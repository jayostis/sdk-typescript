/**
 * Scratch inputs for driving a generator at a fixture, and reading what it found.
 *
 * A DETECTOR IS PROVEN BY MAKING IT SPEAK (`tests/README.md`), and the pinned
 * spec cannot be made to say most of what these detectors exist to say — it has
 * no deprecated record class with a dangling successor, no key declared across
 * three contexts that disagrees with itself twice. So every detector test hands
 * its generator a spec it wrote itself. Two forms, because the generators read
 * two things: `scratchData` is a `src/spec/` stand-in (expanded JSON-LD
 * ontologies plus verbatim contexts — what `build-record-types` and
 * `build-terms` read) and `scratchCheckout` is a `spec` checkout stand-in
 * (Turtle plus contexts — what `build-spec-data` reads).
 *
 * NEVER THE REAL `src/spec/`. Every generator honours `CASCADE_SPEC_DATA_DIR`
 * and every run here sets it, because `tests/record-types/derivation.test.ts`
 * rebuilds the real derived table from a sibling worker and `build-spec-data`
 * EMPTIES its output directories before writing — a run pointed at the tree
 * would race that test and win by deleting what it was reading.
 *
 * THE FIXTURE CONTEXTS CANNOT TIE. `scripts/lib/iri.mjs` refuses two contexts
 * with an equal share of one namespace, so a fixture with two contexts each
 * carrying only `cascade:` terms does not test a detector — it tests the
 * refusal. Every fixture below gives each context a clear majority namespace.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect } from 'vitest';

// The vocabularies the channel is defined by, re-exported rather than copied:
// a copy here would keep passing rows against a list the recorder had moved
// on from, or fail a legitimate row the day a fourth owner is added.
// @ts-expect-error -- a build script, deliberately plain JavaScript and untyped.
import { OWNERS, SEVERITIES, findingsFile } from '../../scripts/lib/diagnostics.mjs';
// @ts-expect-error -- a build script, deliberately plain JavaScript and untyped.
import { OWL_DEPRECATED, RDFS_RANGE, RDFS_SEE_ALSO } from '../../scripts/lib/detectors.mjs';

export { OWNERS, SEVERITIES, OWL_DEPRECATED, RDFS_RANGE, RDFS_SEE_ALSO };

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const OWL = 'http://www.w3.org/2002/07/owl#';
const XSD = 'http://www.w3.org/2001/XMLSchema#';

export const RDFS_SUB_CLASS_OF = `${RDFS}subClassOf`;
export const OWL_CLASS = `${OWL}Class`;
export const OWL_ONTOLOGY = `${OWL}Ontology`;
export const OWL_NAMED_INDIVIDUAL = `${OWL}NamedIndividual`;
export const XSD_STRING = `${XSD}string`;

export const CASCADE = 'https://ns.cascadeprotocol.org/core/v1#';
export const CLINICAL = 'https://ns.cascadeprotocol.org/clinical/v1#';
export const HEALTH = 'https://ns.cascadeprotocol.org/health/v1#';
export const RECORD_CLASS = `${CASCADE}RecordClass`;

/** The prefix declarations every fixture context carries. */
export const PREFIXES = {
  cascade: CASCADE,
  clinical: CLINICAL,
  health: HEALTH,
  owl: OWL,
  rdfs: RDFS,
  xsd: XSD,
} as const;

/** What a generator records: the fields every row carries, plus per-code detail. */
export interface Finding {
  readonly id: string;
  readonly code: string;
  readonly severity: string;
  readonly subject: string;
  readonly owner: string;
  readonly location: readonly string[];
  readonly source: string;
  readonly [detail: string]: unknown;
}

export type Node = { '@id': string; '@type'?: string[]; [predicate: string]: unknown };

const ref = (iri: string) => ({ '@id': iri });
const deprecatedTrue = () => [{ '@value': 'true', '@type': `${XSD}boolean` }];

/** A class node, optionally marked as a record class, deprecated, or linked onward. */
export function klass(
  iri: string,
  { record = false, deprecated = false, seeAlso = [] as string[], subClassOf = [] as string[] } = {},
): Node {
  return {
    '@id': iri,
    '@type': record ? [OWL_CLASS, RECORD_CLASS] : [OWL_CLASS],
    ...(deprecated ? { [OWL_DEPRECATED]: deprecatedTrue() } : {}),
    ...(seeAlso.length > 0 ? { [RDFS_SEE_ALSO]: seeAlso.map(ref) } : {}),
    ...(subClassOf.length > 0 ? { [RDFS_SUB_CLASS_OF]: subClassOf.map(ref) } : {}),
  };
}

/** A property node of one of OWL's three kinds, with or without a range. */
export function property(
  iri: string,
  {
    kind = 'Datatype' as 'Datatype' | 'Object' | 'Annotation',
    range = undefined as string | undefined,
    deprecated = false,
    seeAlso = [] as string[],
  } = {},
): Node {
  return {
    '@id': iri,
    '@type': [`${OWL}${kind}Property`],
    ...(range ? { [RDFS_RANGE]: [ref(range)] } : {}),
    ...(deprecated ? { [OWL_DEPRECATED]: deprecatedTrue() } : {}),
    ...(seeAlso.length > 0 ? { [RDFS_SEE_ALSO]: seeAlso.map(ref) } : {}),
  };
}

/** A member node typed directly to whatever it is given. */
export const individual = (iri: string, ...types: string[]): Node => ({ '@id': iri, '@type': types });

/** The `owl:Ontology` node that declares a namespace as one spec publishes. */
export const ontology = (namespace: string): Node => ({ '@id': namespace, '@type': [OWL_ONTOLOGY] });

/** A context document: the fixture prefixes plus the terms given. */
export const context = (terms: Record<string, unknown>) => ({ '@context': { ...PREFIXES, ...terms } });

const scratchDirs: string[] = [];

function scratch(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), `${prefix}-`));
  scratchDirs.push(dir);
  return dir;
}

/** An empty directory, for `CASCADE_SPEC_DATA_DIR` when a generator builds it from scratch. */
export const scratchDir = (): string => scratch('spec-data');

/** Removes every scratch directory this module handed out. For an `afterAll`. */
export function cleanupScratch(): void {
  for (const dir of scratchDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
}

/**
 * A `src/spec/` stand-in: `ontologies/<name>.jsonld` and `contexts/<name>.jsonld`
 * from the maps given. Returns the directory, for `CASCADE_SPEC_DATA_DIR`.
 */
export function scratchData(spec: {
  ontologies: Record<string, Node[]>;
  contexts: Record<string, object>;
}): string {
  const dir = scratch('spec-data');

  mkdirSync(join(dir, 'ontologies'));
  mkdirSync(join(dir, 'contexts'));

  for (const [name, nodes] of Object.entries(spec.ontologies)) {
    writeFileSync(join(dir, 'ontologies', `${name}.jsonld`), JSON.stringify(nodes), 'utf-8');
  }
  for (const [name, document] of Object.entries(spec.contexts)) {
    writeFileSync(join(dir, 'contexts', `${name}.jsonld`), JSON.stringify(document), 'utf-8');
  }

  return dir;
}

const TURTLE_PREFIXES = `@prefix owl: <${OWL}> .
@prefix rdfs: <${RDFS}> .
@prefix xsd: <${XSD}> .
@prefix cascade: <${CASCADE}> .
`;

/**
 * A `spec` checkout stand-in: one Turtle file per vocabulary the manifest
 * names, each declaring its namespace as an `owl:Ontology`, and `contexts/v1/`.
 * Returns the directory, for `CASCADE_SPEC_DIR`.
 *
 * EVERY MANIFEST VOCABULARY IS WRITTEN, whether or not the caller cares about
 * it, because `build-spec-data` refuses a checkout missing any one of them.
 * `core` always marks one record class, because `build-record-types` refuses a
 * graph that marks none — so the whole pipeline can run against this.
 * `turtle` APPENDS to a vocabulary's file; `contexts` REPLACES the default
 * single context, since a second context carrying the same terms would tie.
 */
export function scratchCheckout({
  turtle = {} as Record<string, string>,
  contexts = undefined as Record<string, object> | undefined,
} = {}): string {
  const dir = scratch('spec-checkout');
  const manifest = JSON.parse(readFileSync(join(repoRoot, 'spec-sources.json'), 'utf-8')) as
    Record<string, { ontology: string }>;

  for (const [vocabulary, { ontology: path }] of Object.entries(manifest)) {
    const namespace = vocabulary === 'core' ? CASCADE : `https://ns.cascadeprotocol.org/${vocabulary}/v1#`;
    const base = `${TURTLE_PREFIXES}@prefix ${vocabulary}: <${namespace}> .\n\n<${namespace}> a owl:Ontology .\n`
      + (vocabulary === 'core' ? 'cascade:Widget a owl:Class, cascade:RecordClass .\n' : '');

    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), `${base}\n${turtle[vocabulary] ?? ''}`, 'utf-8');
  }

  mkdirSync(join(dir, 'contexts/v1'), { recursive: true });
  for (const [name, document] of Object.entries(contexts ?? { core: context({ Widget: 'cascade:Widget' }) })) {
    writeFileSync(join(dir, 'contexts/v1', `${name}.jsonld`), JSON.stringify(document), 'utf-8');
  }

  return dir;
}

/**
 * Runs one generator with the environment given on top of this process's, and
 * throws with its stderr on a non-zero exit. A generator that refuses its input
 * is a fixture bug, and the message it refused with is the fastest way to it.
 */
export function runGenerator(
  script: 'build-spec-data' | 'build-record-types' | 'build-terms',
  env: Record<string, string>,
): { stdout: string; stderr: string } {
  const result = spawnSync(
    process.execPath,
    [join(repoRoot, `scripts/${script}.mjs`)],
    { cwd: repoRoot, env: { ...process.env, ...env }, encoding: 'utf-8' },
  );

  if (result.status !== 0) {
    throw new Error(`${script} exited ${result.status}:\n${result.stderr}\n${result.stdout}`);
  }

  return { stdout: result.stdout, stderr: result.stderr };
}

/**
 * What one generator recorded into a data directory.
 *
 * ASSERTS THE FILE EXISTS rather than reading a missing one as `[]`: every
 * "produces none" case below would pass against a generator that recorded
 * nothing at all, which is the vacuous pass `tests/README.md` names first.
 */
export function findingsOf(dataDir: string, source: string): Finding[] {
  const file = findingsFile(join(dataDir, 'diagnostics'), source) as string;

  expect(existsSync(file), `${source} recorded no findings file at ${file}`).toBe(true);

  return JSON.parse(readFileSync(file, 'utf-8')) as Finding[];
}

/** The rows a generator recorded under one code. */
export const rowsFor = (findings: readonly Finding[], code: string): Finding[] =>
  findings.filter((finding) => finding.code === code);

/** The table `build-record-types` emitted into a data directory. */
export function derivedClassesOf(dataDir: string): { iri: string; name: string; localName: string }[] {
  const source = readFileSync(join(dataDir, 'derived/record-types.generated.ts'), 'utf-8');
  const table = /DERIVED_CLASSES: readonly DerivedClass\[\] = (\[[\s\S]*?\]) as const;/.exec(source);

  if (!table) throw new Error('record-types.generated.ts carries no DERIVED_CLASSES table');

  return JSON.parse(table[1]) as { iri: string; name: string; localName: string }[];
}
