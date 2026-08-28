/**
 * Graph and SHACL helpers shared by the fixture-verification suites.
 *
 * A plain module, not a `.test.ts`: importing a helper out of a test file makes
 * vitest collect that file's tests into the importer as well, so one import
 * would run the whole suite twice.
 *
 * WHY THE TESTS PARSE INSTEAD OF MATCHING SUBSTRINGS. The serializer produces
 * text, but what it MEANS is a set of triples. `toContain('cascade:x')` is a
 * boolean over the whole document: it passes on a `@prefix` line, cannot count,
 * cannot say which record a triple belongs to, and breaks on any legal
 * re-rendering — a full IRI instead of a prefixed name, or `p "a", "b"` instead
 * of `p "a" ; p "b"`. Both of those matter here: the two forms are the same
 * graph, and the fixtures and this SDK disagree about which to write.
 *
 * Traversal is `clownface`, the RDF/JS graph-traversal library, rather than
 * something hand-rolled. `.out(predicate)` follows outgoing edges from the
 * current node; `.values` reads them as strings.
 *
 * `n3`, `clownface`, `@zazuko/env` and `rdf-validate-shacl` are devDependencies
 * used by tests only. `src/` imports none of them and `dependencies` stays
 * empty, so the published package is unchanged.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Parser } from 'n3';
import env from '@zazuko/env';
import SHACLValidator from 'rdf-validate-shacl';
import type { AnyPointer } from 'clownface';
import type { ValidationReport } from 'rdf-validate-shacl/src/validation-report.js';

import { serialize } from '../../src/serializer/turtle-serializer.js';
import { NAMESPACES } from '../../src/vocabularies/namespaces.js';
import type { CascadeEntity, CascadeRecord } from '../../src/models/common.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(here, '../../../conformance/fixtures');
const shapesDir = resolve(here, '../shapes');

// ─── Vocabulary ─────────────────────────────────────────────────────────────

/**
 * The Cascade namespaces as property accessors: `cascade.dataAbsentReason`
 * rather than a CURIE string or a full IRI.
 *
 * Built from the SDK's own `NAMESPACES` so a test cannot drift from the prefix
 * table. The LOCAL NAME is still written out by hand at each call site rather
 * than looked up from `PROPERTY_PREDICATES` — deriving it would make the test
 * agree with the code by construction, and a wrong predicate would become
 * invisible.
 */
export const cascade = env.namespace(NAMESPACES.cascade);

// ─── Fixtures ───────────────────────────────────────────────────────────────

/**
 * A conformance fixture, whatever kind of subject it carries.
 *
 * `input` is a `CascadeEntity` — id and type — because not every fixture is a
 * health record. `pod-001` is an `ldp:BasicContainer`: a directory listing with
 * no `dataProvenance`, because nobody "reported" a directory.
 */
export interface Fixture {
  /** The fixture's own one-line account of what it is. */
  description: string;
  input: CascadeEntity;
  expectedOutput: { turtle: string };
  /** The verdict the corpus declares this input should earn. */
  shouldAccept: boolean;
}

/** A fixture whose input is a health record: `dataProvenance` and `schemaVersion` present. */
export interface CascadeRecordFixture extends Fixture {
  input: CascadeRecord;
}

export function loadFixture(id: string): Fixture {
  return JSON.parse(readFileSync(resolve(fixturesDir, `${id}.json`), 'utf-8')) as Fixture;
}

/**
 * Load a fixture and verify its input really is a health record.
 *
 * The narrowing is CHECKED, not asserted. A cast would let
 * `loadCascadeRecordFixture('pod-001')` hand back a directory listing dressed
 * as a record, and the mistake would surface somewhere unrelated; this fails at
 * the point someone picked the wrong loader, and says which one to use instead.
 */
export function loadCascadeRecordFixture(id: string): CascadeRecordFixture {
  const fixture = loadFixture(id);
  const { dataProvenance, schemaVersion } = fixture.input;

  if (!dataProvenance || !schemaVersion) {
    throw new Error(
      `${id} is not a record fixture — dataProvenance=${dataProvenance}, `
      + `schemaVersion=${schemaVersion}. Use loadFixture() for pod and container fixtures.`,
    );
  }
  return fixture as CascadeRecordFixture;
}

// ─── Reading a serialized record ────────────────────────────────────────────

/**
 * Turtle text as a traversable graph.
 *
 * Deliberately takes TEXT, not a record: the call to `serialize()` belongs in
 * the test, where the reader can see what is under test. A helper that
 * serialized and parsed in one step would hide it.
 *
 * @example
 * const record = loadCascadeRecordFixture('absent-003').input;
 * const node = parseTurtle(serialize(record)).namedNode(record.id);
 * expect(node.out(cascade.dataAbsentReason).values)
 *   .toEqual(['not-asked', 'asked-unknown']);
 */
export function parseTurtle(turtle: string): AnyPointer {
  return env.clownface({ dataset: env.dataset(new Parser().parse(turtle)) });
}

// ─── SHACL ──────────────────────────────────────────────────────────────────

/**
 * The vocabularies vendored in `tests/shapes/`, and the namespace IRIs their
 * shapes constrain. Core publishes its terms under the `cascade:` prefix.
 *
 * A DELIBERATE SUBSET, not a mirror — `scripts/sync-shapes-from-spec.sh` copies
 * exactly these. The two lists move together: a file added there without its
 * namespace added here would still be loaded, but a record in that vocabulary
 * would keep being refused; a namespace added here without its file would let a
 * record through to a graph holding no shapes for it, which is the false green
 * `assertCovered` exists to stop.
 */
const VENDORED_SHAPES = ['core.shapes.ttl', 'health.shapes.ttl'];
const COVERED_NAMESPACES = new Set<string>([NAMESPACES.cascade, NAMESPACES.health]);

/**
 * The vendored shapes, as one graph.
 *
 * Read from `tests/shapes/`, NOT from a `spec` sibling: CI checks out
 * `conformance` and not `spec`, so a sibling-reading test would fail on clean
 * machines or skip itself — and a test that skips when it cannot find its input
 * reports green having asserted nothing. `scripts/check-shapes-drift.mjs` is
 * what keeps the copy honest. See tests/shapes/README.md.
 *
 * ONE VALIDATOR, SHARED. `SHACLValidator.validate()` awaits only
 * `loadOwlImports()`; everything that touches instance state — `setDataGraph`,
 * `validateAll`, `getReport` — runs synchronously after that await, so two
 * concurrent calls cannot interleave between them, and `validateAll` calls
 * `initReport()`, so results do not accumulate. Constructing one indexes the
 * whole shapes graph, which is why this is not done per call.
 * `tests/rdf-helpers.test.ts` pins the no-crossing property against a future
 * release that adds an await.
 */
const shacl = new SHACLValidator(
  env.dataset(
    new Parser().parse(
      VENDORED_SHAPES
        .map((f) => readFileSync(resolve(shapesDir, f), 'utf-8'))
        .join('\n'),
    ),
  ),
);

const rdf = env.namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#');

/** IRI -> the prefix `NAMESPACES` declares for it, so a message reads as a CURIE. */
const PREFIX_OF = new Map(Object.entries(NAMESPACES).map(([prefix, iri]) => [iri as string, prefix]));

/** The namespace part of an IRI: everything through the last `#` or `/`. */
const namespaceOf = (iri: string): string =>
  iri.slice(0, Math.max(iri.lastIndexOf('#'), iri.lastIndexOf('/')) + 1);

/**
 * Refuse a record whose vocabulary has no vendored shapes.
 *
 * Without this, `shaclCheck` on a `clinical:Medication` validates against a
 * graph that declares no clinical shape and returns `{ conforms: true,
 * violations: [] }` — a verdict indistinguishable from one earned by satisfying
 * every clinical constraint. A thrown error is the only outcome a test cannot
 * mistake for a pass.
 */
function assertCovered(dataset: ReturnType<typeof env.dataset>, record: CascadeEntity): void {
  const types = env.clownface({ dataset }).namedNode(record.id).out(rdf.type).values;
  const uncovered = types.filter((iri) => !COVERED_NAMESPACES.has(namespaceOf(iri)));
  if (uncovered.length === 0) return;

  const named = uncovered
    .map((iri) => `${PREFIX_OF.get(namespaceOf(iri)) ?? namespaceOf(iri)}:${iri.slice(namespaceOf(iri).length)}`)
    .join(', ');
  throw new Error(
    `shaclCheck cannot judge ${named}: tests/shapes/ vendors ${VENDORED_SHAPES.join(' and ')} only, `
    + 'so no shape in the graph targets it and the verdict would be a vacuous conforms:true. '
    + 'Vendor the vocabulary (add it to scripts/sync-shapes-from-spec.sh, re-run it, and extend '
    + 'UPSTREAM in scripts/check-shapes-drift.mjs), or assert on the graph with parseTurtle instead.',
  );
}

/**
 * The SHACL vocabulary, for naming the constraint a result came from.
 *
 * `sh:InConstraintComponent`, `sh:MaxCountConstraintComponent` and the rest are
 * the RULE's identity. Assert on those rather than on `message`, which is prose
 * owned by `spec`: rewording a `sh:message` would break a text assertion
 * without any behaviour changing, and a DIFFERENT constraint whose message
 * happens to mention the property would satisfy one.
 */
export const sh = env.namespace('http://www.w3.org/ns/shacl#');

/**
 * Serialize a record and validate the resulting graph against the real shapes.
 *
 * Returns the library's own ValidationReport unchanged. Each result carries
 * path, value, focusNode, severity, sourceConstraintComponent and message as
 * RDF terms — a wrapper that flattened those into strings would throw away the
 * constraint identity, which is the thing worth asserting on.
 *
 * Throws — rather than returning a verdict — when no vendored shape covers the
 * record's vocabulary. See `assertCovered`.
 */
export async function shaclCheck(record: CascadeRecord): Promise<ValidationReport> {
  const dataset = env.dataset(new Parser().parse(serialize(record)));
  assertCovered(dataset, record);
  return shacl.validate(dataset);
}
