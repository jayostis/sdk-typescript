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
  return env.clownface({ dataset: parseDataset(turtle) });
}

/**
 * Turtle text as a dataset — what `assertCovered` and the validator take.
 *
 * Exported so `tests/rdf-helpers.test.ts` can hand `assertCovered` a graph
 * `serialize()` cannot currently produce. One definition rather than three:
 * `parseTurtle` and `shaclCheck` both build their dataset this way.
 */
export function parseDataset(turtle: string): ReturnType<typeof env.dataset> {
  return env.dataset(new Parser().parse(turtle));
}

// ─── SHACL ──────────────────────────────────────────────────────────────────

/**
 * One entry per vendored shapes file, as `tests/shapes/vendored.json` records it.
 *
 * `prefix` is the key in `NAMESPACES` for the namespace that file's shapes
 * constrain — core publishes its terms under `cascade:`.
 */
interface VendoredShape {
  specPath: string;
  prefix: string;
}

/**
 * The vocabularies vendored in `tests/shapes/`, and the namespace IRIs their
 * shapes constrain.
 *
 * A DELIBERATE SUBSET, not a mirror. Both facts are READ from
 * `tests/shapes/vendored.json`, which is also what `sync-shapes-from-spec.sh`
 * copies and what `check-shapes-drift.mjs` checks — one list, three consumers.
 * As four hand-maintained lists they could disagree in two directions, and
 * nothing enforced agreement: a file synced without its namespace registered
 * here was loaded but every record in it kept being refused, and a namespace
 * registered here without its file let a record through to a graph holding no
 * shapes for it — the false green `assertCovered` exists to stop.
 *
 * readFileSync rather than an import: `resolveJsonModule` would type it, but
 * the runtime attribute is spelled `assert` on this package's Node 18 floor and
 * `with` on current Node, and neither spelling parses on both.
 */
const MANIFEST = JSON.parse(
  readFileSync(resolve(shapesDir, 'vendored.json'), 'utf-8'),
) as Record<string, VendoredShape>;

const IRI_OF = new Map<string, string>(Object.entries(NAMESPACES).map(([p, iri]) => [p, iri as string]));

const VENDORED_SHAPES = Object.keys(MANIFEST).sort();
const COVERED_NAMESPACES = new Set<string>(
  Object.entries(MANIFEST).map(([file, { prefix }]) => {
    const iri = IRI_OF.get(prefix);
    // The manifest is untyped input, and an unknown prefix is the failure this
    // indirection could introduce: `undefined` in COVERED_NAMESPACES matches no
    // namespace, so every record in that vocabulary would be refused with a
    // message insisting the file is not vendored when it is.
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
  parseDataset(
    VENDORED_SHAPES
      .map((f) => readFileSync(resolve(shapesDir, f), 'utf-8'))
      .join('\n'),
  ),
);

/**
 * `rdf:type` is how SHACL SELECTS a shape, not a property any shape constrains,
 * so this namespace is exempt from the predicate sweep in `assertCovered`.
 * Nothing else is: a shapes graph that does not constrain a predicate has
 * nothing to say about the triple carrying it, whichever vocabulary it is from.
 */
const RDF_NS = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const rdf = env.namespace(RDF_NS);

/** IRI -> the prefix `NAMESPACES` declares for it, so a message reads as a CURIE. */
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
 * Without this, `shaclCheck` on a `clinical:Medication` validates against a
 * graph that declares no clinical shape and returns `{ conforms: true,
 * violations: [] }` — a verdict indistinguishable from one earned by satisfying
 * every clinical constraint. A thrown error is the only outcome a test cannot
 * mistake for a pass.
 *
 * Three ways the verdict can be vacuous, and all three throw:
 *
 * 1. NO TYPE on the subject. A graph whose subject carries no `rdf:type` is
 *    precisely a graph no `sh:targetClass` selects. This case FAILED OPEN
 *    before — `uncovered.length === 0` concluded "nothing is uncovered" from
 *    "nothing was found", the inverse of the contract. Latent rather than live:
 *    `serialize()` emits `a <type>` for every type in TYPE_MAPPING and throws
 *    for any other, so no record reaches this with an untyped subject today.
 *    (`n3` leaves a relative IRI unresolved when no `baseIRI` is given, so even
 *    the empty and relative `id`s round-trip to a subject `namedNode(record.id)`
 *    addresses.) It becomes reachable the day `serialize()` mints a subject
 *    rather than echoing `record.id`, and it is cheaper to close than to detect.
 *
 * 2. AN UNCOVERED TYPE — no vendored shape targets the record at all.
 *
 * 3. AN UNCOVERED PREDICATE. Checking only types made this oracle blind to the
 *    triples themselves: a record whose type is `cascade:`/`health:` sailed
 *    through carrying predicates from a vocabulary `tests/shapes/` holds nothing
 *    for, and `expect(report.results).toEqual([])` then asserted the absence of
 *    violations no shape could have raised. Live, not hypothetical:
 *    `serialize(absent-001)` writes `clinical:loincCode`, for which no vendored
 *    shape declares an `sh:path`.
 *
 * The sweep is over the whole dataset rather than the record subject alone,
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
 * Throws — rather than returning a verdict — when the vendored shapes cannot
 * judge the record's type or one of its predicates. See `assertCovered`.
 */
export async function shaclCheck(record: CascadeRecord): Promise<ValidationReport> {
  const dataset = parseDataset(serialize(record));
  assertCovered(dataset, record);
  return shacl.validate(dataset);
}
