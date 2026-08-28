/**
 * Validating a serialized record against the shapes `spec` publishes.
 *
 * Importing this indexes 125 KB of vendored Turtle into a SHACLValidator at
 * module scope — ~350 ms, on top of `graph.ts`'s ~500 ms for the RDF libraries.
 * That is why fixture loading lives in `fixtures.ts`, which imports in 27 ms: a
 * suite that only reads fixtures should not pay either bill.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import env from '@zazuko/env';
import SHACLValidator from 'rdf-validate-shacl';
import type { ValidationReport } from 'rdf-validate-shacl/src/validation-report.js';

import { serialize } from '../../src/serializer/turtle-serializer.js';
import { NAMESPACES } from '../../src/vocabularies/namespaces.js';
import type { CascadeEntity, CascadeRecord } from '../../src/models/common.js';
import { parseDataset } from './graph.js';

const shapesDir = resolve(dirname(fileURLToPath(import.meta.url)), '../shapes');

/** `prefix` is the key in `NAMESPACES` whose namespace this file's shapes constrain. */
interface VendoredShape {
  specPath: string;
  prefix: string;
}

/**
 * The vendored subset, read from `tests/shapes/vendored.json` — the same list
 * `sync-shapes-from-spec.sh` copies and `check-shapes-drift.mjs` checks.
 *
 * readFileSync rather than an import: the runtime attribute is spelled `assert`
 * on this package's Node 18 floor and `with` on current Node, and neither
 * spelling parses on both.
 */
const MANIFEST = JSON.parse(
  readFileSync(resolve(shapesDir, 'vendored.json'), 'utf-8'),
) as Record<string, VendoredShape>;

const IRI_OF = new Map<string, string>(Object.entries(NAMESPACES).map(([p, iri]) => [p, iri as string]));

const VENDORED_SHAPES = Object.keys(MANIFEST).sort();
const COVERED_NAMESPACES = new Set<string>(
  Object.entries(MANIFEST).map(([file, { prefix }]) => {
    const iri = IRI_OF.get(prefix);
    // `undefined` here would match no namespace, refusing every record in that
    // vocabulary with a message insisting the file is not vendored when it is.
    if (!iri) {
      throw new Error(
        `tests/shapes/vendored.json: ${file} names prefix "${prefix}", which NAMESPACES does not declare.`,
      );
    }
    return iri;
  }),
);

if (VENDORED_SHAPES.length === 0) {
  throw new Error('tests/shapes/vendored.json lists no shapes, so every SHACL verdict would be vacuous.');
}

/**
 * The vendored shapes, as one graph.
 *
 * Read from `tests/shapes/`, not from a `spec` sibling: CI checks out
 * `conformance` and not `spec`, so a sibling-reading test would fail on a clean
 * machine or skip itself — and a test that skips when it cannot find its input
 * reports green having asserted nothing. `check-shapes-drift.mjs` keeps the copy
 * honest.
 *
 * ONE VALIDATOR, SHARED, because constructing one indexes the whole shapes
 * graph. `validate()` awaits only `loadOwlImports()`; `setDataGraph`,
 * `validateAll` and `getReport` all run synchronously after it, so concurrent
 * calls cannot interleave, and `validateAll` calls `initReport()`.
 * `tests/support/shacl.test.ts` pins that against a release that adds an await.
 */
const shacl = new SHACLValidator(
  parseDataset(
    VENDORED_SHAPES
      .map((f) => readFileSync(resolve(shapesDir, f), 'utf-8'))
      .join('\n'),
  ),
);

/** `rdf:type` SELECTS a shape rather than being constrained by one, so it is exempt below. */
const RDF_NS = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const rdf = env.namespace(RDF_NS);

const PREFIX_OF = new Map(Object.entries(NAMESPACES).map(([prefix, iri]) => [iri as string, prefix]));

/** The namespace part of an IRI: everything through the last `#` or `/`. */
const namespaceOf = (iri: string): string =>
  iri.slice(0, Math.max(iri.lastIndexOf('#'), iri.lastIndexOf('/')) + 1);

/** An IRI as a CURIE, so a message reads the way the Turtle does. */
const curieOf = (iri: string): string => {
  const ns = namespaceOf(iri);
  return `${PREFIX_OF.get(ns) ?? ns}:${iri.slice(ns.length)}`;
};

/**
 * Refuse a record the vendored shapes cannot actually judge.
 *
 * A graph they hold nothing for validates to `conforms: true` — indistinguishable
 * from one that satisfies every constraint. A thrown error is the only outcome a
 * test cannot mistake for a pass.
 *
 * Of the three cases below, the untyped one is latent: `serialize()` emits
 * `a <type>` for everything in TYPE_MAPPING and throws otherwise, and `n3`
 * leaves a relative IRI unresolved, so even `pod-001`'s empty `id` round-trips
 * to a subject `namedNode(record.id)` addresses. The uncovered-predicate one is
 * live — `serialize(absent-001)` writes `clinical:loincCode`, which no vendored
 * shape constrains.
 *
 * The predicate sweep covers the whole dataset, not just the record subject,
 * because a blank-node sub-structure's predicates are validated too.
 */
export function assertCovered(dataset: ReturnType<typeof env.dataset>, record: CascadeEntity): void {
  const types = env.clownface({ dataset }).namedNode(record.id).out(rdf.type).values;
  if (types.length === 0) {
    throw new Error(
      `shaclCheck found no rdf:type on <${record.id}> in the serialized graph, so it cannot tell `
      + 'whether any vendored shape targets it; the verdict would be a vacuous conforms:true.',
    );
  }

  refuse('judge', types.filter((iri) => !COVERED_NAMESPACES.has(namespaceOf(iri))));

  const predicates = new Set<string>();
  for (const quad of dataset) predicates.add(quad.predicate.value);
  refuse(
    'judge the triples on',
    [...predicates].filter((iri) => namespaceOf(iri) !== RDF_NS && !COVERED_NAMESPACES.has(namespaceOf(iri))),
  );
}

/** Throw naming what the vendored shapes are silent about, or return if nothing is. */
function refuse(verb: string, uncovered: string[]): void {
  if (uncovered.length === 0) return;
  throw new Error(
    `shaclCheck cannot ${verb} ${uncovered.map(curieOf).join(', ')}: tests/shapes/ vendors `
    + `${VENDORED_SHAPES.join(' and ')} only, so nothing in the shapes graph constrains that and the `
    + 'verdict would be a vacuous conforms:true. Vendor the vocabulary (add it to '
    + 'tests/shapes/vendored.json and re-run scripts/sync-shapes-from-spec.sh), or assert on the '
    + 'graph with parseTurtle instead.',
  );
}

/**
 * The SHACL vocabulary, for naming the constraint a result came from.
 *
 * Assert on `sourceConstraintComponent` rather than `message`: the message is
 * prose `spec` owns, so a reword breaks a text assertion with no behaviour
 * change, and a different constraint mentioning the property would satisfy one.
 */
export const sh = env.namespace('http://www.w3.org/ns/shacl#');

/**
 * Serialize a record and validate the result against the vendored shapes.
 *
 * Returns the library's own ValidationReport unchanged — flattening its terms to
 * strings would throw away the constraint identity, which is the thing worth
 * asserting on. Throws rather than returning a verdict when the shapes cannot
 * judge the record; see `assertCovered`.
 */
export async function shaclCheck(record: CascadeRecord): Promise<ValidationReport> {
  const dataset = parseDataset(serialize(record));
  assertCovered(dataset, record);
  return shacl.validate(dataset);
}
