/**
 * Graph and SHACL helpers shared by the fixture-verification suites.
 *
 * A plain module, not a `.test.ts`: vitest collects tests per file, so importing
 * a helper out of a test file drags that file's tests into the importer.
 * Measured — a file declaring one test ran five.
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
 * `cascade.dataAbsentReason` rather than a CURIE string or a full IRI.
 *
 * The local name stays hand-written at each call site rather than looked up from
 * `PROPERTY_PREDICATES`: deriving it would make the test agree with the code by
 * construction, and a wrong predicate would become invisible.
 */
export const cascade = env.namespace(NAMESPACES.cascade);

// ─── Fixtures ───────────────────────────────────────────────────────────────

/**
 * A conformance fixture, whatever kind of subject it carries.
 *
 * `input` is a `CascadeEntity` because not every fixture is a health record —
 * `pod-001` is an `ldp:BasicContainer` with no `dataProvenance`, a directory
 * listing rather than an observation.
 */
export interface Fixture {
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

/** Load a fixture, checking rather than asserting that its input is a health record. */
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
 * Takes TEXT, not a record, so the `serialize()` call stays in the test where a
 * reader can see what is under test. A helper that did both would hide it.
 */
export function parseTurtle(turtle: string): AnyPointer {
  return env.clownface({ dataset: parseDataset(turtle) });
}

/** Turtle text as a dataset — what `assertCovered` and the validator take. */
export function parseDataset(turtle: string): ReturnType<typeof env.dataset> {
  return env.dataset(new Parser().parse(turtle));
}

// ─── SHACL ──────────────────────────────────────────────────────────────────

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
 * `tests/rdf-helpers.test.ts` pins that against a release that adds an await.
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
