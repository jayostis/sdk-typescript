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

import { serialize } from '../../src/serializer/turtle-serializer.js';
import { NAMESPACES } from '../../src/vocabularies/namespaces.js';
import type { CascadeRecord } from '../../src/models/common.js';

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

export interface Fixture {
  input: Record<string, unknown>;
  expectedOutput: { turtle: string };
}

export function loadFixture(id: string): Fixture {
  return JSON.parse(readFileSync(resolve(fixturesDir, `${id}.json`), 'utf-8')) as Fixture;
}

/** The fixture's `input`, typed for the SDK's entry points. */
export function inputOf(id: string): CascadeRecord {
  return loadFixture(id).input as unknown as CascadeRecord;
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
 * const record = inputOf('absent-003');
 * const node = parseTurtle(serialize(record)).namedNode(record.id);
 * expect(node.out(cascade.dataAbsentReason).values)
 *   .toEqual(['not-asked', 'asked-unknown']);
 */
export function parseTurtle(turtle: string): AnyPointer {
  return env.clownface({ dataset: env.dataset(new Parser().parse(turtle)) });
}

// ─── SHACL ──────────────────────────────────────────────────────────────────

/**
 * The vendored shapes, as one graph.
 *
 * Read from `tests/shapes/`, NOT from a `spec` sibling: CI checks out
 * `conformance` and not `spec`, so a sibling-reading test would fail on clean
 * machines or skip itself — and a test that skips when it cannot find its input
 * reports green having asserted nothing. `scripts/check-shapes-drift.mjs` is
 * what keeps the copy honest. See tests/shapes/README.md.
 */
const shacl = new SHACLValidator(
  env.dataset(
    new Parser().parse(
      ['core.shapes.ttl', 'health.shapes.ttl']
        .map((f) => readFileSync(resolve(shapesDir, f), 'utf-8'))
        .join('\n'),
    ),
  ),
);

export interface ShaclVerdict {
  conforms: boolean;
  /** `path: message` per result, so a failure names the constraint. */
  violations: string[];
}

/** Serialize a record and validate the resulting graph against the real shapes. */
export async function shaclCheck(record: CascadeRecord): Promise<ShaclVerdict> {
  const report = await shacl.validate(env.dataset(new Parser().parse(serialize(record))));
  return {
    conforms: report.conforms,
    violations: report.results.map((r) => {
      const path = 'value' in (r.path ?? {}) ? String((r.path as { value: string }).value) : '?';
      return `${path}: ${r.message.map((m) => m.value).join(' ') || r.severity?.value || 'violation'}`;
    }),
  };
}
