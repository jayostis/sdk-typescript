/**
 * Where `spec` is, and everything the suites need out of it.
 *
 * THE ONLY MODULE THAT KNOWS. Callers ask for a vocabulary by name, or for the
 * shapes as one graph, and learn nothing about whether spec is a sibling, an
 * environment variable, or something else later. Four files used to answer that
 * question separately and drift apart; `spec-sources.json` is the one answer and
 * this is the one reader of it.
 *
 * REFUSES, NEVER SKIPS. A suite that cannot find the shapes and carries on
 * validates against an empty graph, and an empty graph conforms to everything —
 * a green run asserting nothing, which is worse than a red one. Every failure
 * here throws naming the path it tried and the ways to change it.
 *
 * The resolution order is the one both upstream repositories document — an
 * explicit path, then `CASCADE_SPEC_DIR`, then the `../spec` sibling. CI passes
 * a clone of the revision `conformance/scripts/SPEC_PIN` names, so the shapes a
 * run judges against are the ones its fixtures were verified against; the
 * sibling is for a developer's local layout.
 *
 * WHICH REVISION a local checkout is at is deliberately NOT checked here. CI
 * clones the pin, so a comparison against it can only ever fire on a
 * developer's machine — where spec is routinely on a branch on purpose — and it
 * would refuse to run the suite to report something CI reports anyway.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NAMESPACES } from '../../src/vocabularies/namespaces.js';
import { parseDataset } from './graph.js';

/** Paths to what `spec` publishes for one vocabulary, inside some checkout. */
export interface VocabularySources {
  readonly ontology: string;
  readonly shapes?: string;
}

const here = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = resolve(here, '../../spec-sources.json');

/**
 * The manifest, checked rather than cast.
 *
 * A cast to `Record<string, VocabularySources>` is a claim, not a check: an
 * entry written with only `shapes` satisfies the compiler and reaches
 * `join(root, undefined)`, which throws `ERR_INVALID_ARG_TYPE` out of
 * `node:path` — a message naming neither the vocabulary nor the key, behind
 * which every SHACL-importing suite fails at once. This module's header
 * promises every failure names what it tried, and that promise is only worth
 * something if the manifest is read as untrusted JSON, which is what it is.
 *
 * Exported so it can be handed a manifest that MUST make it speak — the same
 * shape as the detectors in `tests/spec-single-source.ts`, and for the same
 * reason: a refusal proven only by never firing is not proven.
 */
export function parseManifest(raw: unknown, source: string): Record<string, VocabularySources> {
  const entries = Object.entries((raw ?? {}) as Record<string, { ontology?: unknown }>);

  if (entries.length === 0) {
    throw new Error(`${source} lists no vocabularies, so every SHACL verdict would be vacuous.`);
  }

  for (const [name, entry] of entries) {
    if (typeof entry?.ontology !== 'string') {
      throw new Error(
        `${source} lists "${name}" with no "ontology" path. Every entry must name the ontology `
        + 'file spec publishes for it; "shapes" is the only optional key.',
      );
    }
  }

  return raw as Record<string, VocabularySources>;
}

/**
 * The manifest, read once.
 *
 * readFileSync rather than an import: the runtime attribute is spelled `assert`
 * on this package's Node 18 floor and `with` on current Node, and neither
 * spelling parses on both.
 */
const MANIFEST = parseManifest(JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8')), MANIFEST_PATH);

const VOCABULARIES = Object.keys(MANIFEST).sort();

/** The sibling checkout, the layout a developer clones into. */
const SIBLING = resolve(here, '../../../spec');

/**
 * Does this directory hold a spec checkout?
 *
 * The top segment of a declared path rather than the directory merely existing:
 * pointed one level too high, at the directory spec is cloned INTO, every path
 * resolves to something absent and the first symptom is a shapes graph with
 * nothing in it.
 *
 * Read off the manifest, not written here. A literal `'ontologies'` in this
 * module is this module resolving a spec path for itself — the thing
 * `specPathLiterals` in `tests/spec-single-source.ts` reports, and the thing
 * the manifest exists so that nobody needs.
 */
const holdsSpec = (dir: string): boolean =>
  Object.values(MANIFEST).every((entry) => existsSync(join(dir, entry.ontology.split('/')[0] ?? '')));

/**
 * The spec checkout, or a refusal naming every way to supply one.
 *
 * `override` is the explicit form — a test hands it a directory, and it is
 * checked exactly as the other two are, so a wrong path fails the same way
 * wherever it came from.
 *
 * `||`, not `??`. `??` falls back only on null/undefined, so an exported-but-
 * empty `CASCADE_SPEC_DIR=` — what any shell or CI that passes an unset input
 * straight through produces — survives to `resolve('')`, which is the cwd. The
 * cwd is a directory, so nothing downstream notices; the sibling is simply
 * never consulted, and the refusal names THIS repository, a path nobody set. An
 * empty string is not a choice of directory.
 */
export function specRoot(override?: string): string {
  const candidate = override || process.env.CASCADE_SPEC_DIR || SIBLING;
  const absolute = resolve(candidate);

  if (!holdsSpec(absolute)) {
    throw new Error(
      `no spec checkout at ${absolute}: it holds no ontologies/ directory. Point CASCADE_SPEC_DIR `
      + 'at a spec checkout, or clone spec as the ../spec sibling of this repository. The suites '
      + 'read spec where it is checked out and keep no copy, so this cannot be skipped past.',
    );
  }

  // After the layout check and before any caller reads a file out of it: WHICH
  // spec answered is as much a part of a verdict as whether one did.
  return absolute;
}

/**
 * What `spec` publishes for one vocabulary, as absolute paths.
 *
 * Throws on a name the manifest does not carry rather than returning
 * `undefined`, which a caller reads as "no shapes for this one" — the vacuous
 * pass `assertCovered` exists to refuse. Throws too when the manifest names a
 * file the checkout does not have, which is the drift the deleted check
 * reported and must not degrade into an empty graph.
 */
export function pathsFor(vocabulary: string, root: string = specRoot()): VocabularySources {
  const declared = MANIFEST[vocabulary];

  if (!declared) {
    throw new Error(
      `spec-sources.json does not list "${vocabulary}". It lists ${VOCABULARIES.join(', ')}. `
      + 'Add the vocabulary there rather than resolving a path at the call site.',
    );
  }

  const absolute = (relative: string): string => {
    const path = join(root, relative);
    if (!existsSync(path)) {
      throw new Error(
        `spec-sources.json names ${relative} for "${vocabulary}", and ${path} does not exist. `
        + 'Either the checkout is at a revision that does not publish it, or the manifest entry '
        + 'has outlived the file.',
      );
    }
    return path;
  };

  return {
    ontology: absolute(declared.ontology),
    ...(declared.shapes ? { shapes: absolute(declared.shapes) } : {}),
  };
}

/** Every vocabulary the manifest declares, sorted. */
export function vocabularies(): string[] {
  return [...VOCABULARIES];
}

let graph: ReturnType<typeof parseDataset> | undefined;

/**
 * Every declared shapes file, parsed into one graph, once.
 *
 * Once because three suites want it and parsing 125 KB of Turtle is ~350 ms
 * each time — the cost `shacl.ts` documents and the reason fixture loading was
 * split into its own module. The graph is separate from the `SHACLValidator`
 * built over it for the same reason: two of the three callers never validate
 * anything, they read what the shapes declare.
 *
 * A vocabulary the manifest lists without a `shapes` entry contributes nothing
 * and is not an error: `spec` publishes no shapes file for some vocabularies,
 * and omitting the key is how the manifest says so.
 */
export function shapesGraph(): ReturnType<typeof parseDataset> {
  if (graph) return graph;

  const root = specRoot();
  const sources = VOCABULARIES.map((name) => pathsFor(name, root).shapes).filter(
    (path): path is string => path !== undefined,
  );

  if (sources.length === 0) {
    throw new Error(
      `spec-sources.json declares shapes for none of ${VOCABULARIES.join(', ')}, so the shapes `
      + 'graph would be empty and every record would validate clean.',
    );
  }

  graph = parseDataset(sources.map((path) => readFileSync(path, 'utf-8')).join('\n'));
  return graph;
}

/** The SHACL vocabulary's namespace, spelled once. */
export const SHACL_NS = 'http://www.w3.org/ns/shacl#';

/** The namespace part of an IRI: everything through the last `#` or `/`. */
export const namespaceOf = (iri: string): string =>
  iri.slice(0, Math.max(iri.lastIndexOf('#'), iri.lastIndexOf('/')) + 1);

const PREFIX_OF = new Map(Object.entries(NAMESPACES).map(([prefix, iri]) => [iri as string, prefix]));

/**
 * `prefix:localName` → full IRI, so a term's spelling can be compared to a
 * shape's.
 *
 * An unknown prefix comes back unchanged rather than throwing: a term may name
 * a vocabulary this SDK has no prefix for, and a CURIE that expands to itself
 * matches no `sh:path`, which is the finding the caller is looking for anyway.
 */
export function expand(curie: string): string {
  const [prefix = '', local = ''] = curie.split(':');
  const ns = (NAMESPACES as Record<string, string>)[prefix];
  return ns ? `${ns}${local}` : curie;
}

/** An IRI as a CURIE, so a message reads the way the Turtle does. */
export function curieOf(iri: string): string {
  const ns = namespaceOf(iri);
  return `${PREFIX_OF.get(ns) ?? ns}:${iri.slice(ns.length)}`;
}
