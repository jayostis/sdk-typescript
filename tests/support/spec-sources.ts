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
 * The manifest, read once.
 *
 * readFileSync rather than an import: the runtime attribute is spelled `assert`
 * on this package's Node 18 floor and `with` on current Node, and neither
 * spelling parses on both.
 */
const MANIFEST = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8')) as Record<
  string,
  { ontology: string; shapes?: string }
>;

const VOCABULARIES = Object.keys(MANIFEST).sort();

if (VOCABULARIES.length === 0) {
  throw new Error(`${MANIFEST_PATH} lists no vocabularies, so every SHACL verdict would be vacuous.`);
}

/** The sibling checkout, the layout a developer clones into. */
const SIBLING = resolve(here, '../../../spec');

/**
 * Does this directory hold a spec checkout?
 *
 * `ontologies/` rather than the directory merely existing: pointed one level
 * too high, at the directory spec is cloned INTO, every path resolves to
 * something absent and the first symptom is a shapes graph with nothing in it.
 */
const holdsSpec = (dir: string): boolean => existsSync(join(dir, 'ontologies'));

/**
 * The spec checkout, or a refusal naming every way to supply one.
 *
 * `override` is the explicit form — a test hands it a directory, and it is
 * checked exactly as the other two are, so a wrong path fails the same way
 * wherever it came from.
 */
export function specRoot(override?: string): string {
  const candidate = override ?? process.env.CASCADE_SPEC_DIR ?? SIBLING;
  const absolute = resolve(candidate);

  if (!holdsSpec(absolute)) {
    throw new Error(
      `no spec checkout at ${absolute}: it holds no ontologies/ directory. Point CASCADE_SPEC_DIR `
      + 'at a spec checkout, or clone spec as the ../spec sibling of this repository. The suites '
      + 'read spec where it is checked out and keep no copy, so this cannot be skipped past.',
    );
  }

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
