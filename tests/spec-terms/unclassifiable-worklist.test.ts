/**
 * The worklist reports the six Cascade-namespace gaps and none of the five
 * open references.
 *
 * A range with neither members nor fields is ambiguous two different ways,
 * and only one of them is `spec`'s to fix: `rdfs:Resource`, `rdf:List`,
 * `prov:Entity`, `prov:Agent` and `xsd:anyURI` are open by design — "any
 * identifier" is the right answer, not a gap — while `DailyVitalReading`,
 * `HRVReading`, `BloodPressureReading`, `VitalSignReading`,
 * `HeartRateMeasurement` and `BloodPressureMeasurement` are Cascade classes
 * spec declares and never gives a single `rdfs:domain`-linked property, which
 * is the history-container gap `CLAUDE.md` already tracks, seen from the
 * ontology side. Reported, so `spec` has a worklist; the other five are
 * reference types this project could never fix, so they must never appear —
 * eleven rows nobody triages beats eleven rows somebody eventually stops
 * reading.
 *
 * STUB: nothing emits this today. This test invents the smallest shape that
 * can carry the reason — `SPEC_TERMS.unclassifiableRanges`, a
 * `range IRI -> { specFix }` map, present in the generated payload exactly
 * for the six spec-row ranges, absent for every other range including the
 * five open references. Read as `as unknown as WithWorklist` because the
 * shipped `SpecTerms` interface does not declare it yet — that declaration is
 * the implementer's, not this test's.
 *
 * Confirmed against `spec/ontologies/{health,pots}/v1/*.ttl` at the pinned
 * revision: zero `rdfs:domain` triples name any of the six classes below,
 * anywhere in the corpus.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, beforeAll } from 'vitest';

import { SPEC_TERMS } from '../../src/spec/derived/terms.generated.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ONTOLOGIES = join(repoRoot, 'src/spec/ontologies');

beforeAll(() => {
  if (!existsSync(ONTOLOGIES)) {
    execFileSync('node', [join(repoRoot, 'scripts/build-spec-data.mjs')], { cwd: repoRoot });
    execFileSync('node', [join(repoRoot, 'scripts/build-terms.mjs')], { cwd: repoRoot });
  }
}, 60_000);

const HEALTH = 'https://ns.cascadeprotocol.org/health/v1#';
const POTS = 'https://ns.cascadeprotocol.org/pots/v1#';

/** The six classes spec declares and never populates with a field. */
const SPEC_ROW_GAPS = [
  `${HEALTH}DailyVitalReading`,
  `${HEALTH}HRVReading`,
  `${HEALTH}BloodPressureReading`,
  `${HEALTH}VitalSignReading`,
  `${POTS}HeartRateMeasurement`,
  `${POTS}BloodPressureMeasurement`,
].sort();

/** The five ranges that are open by design and must never be reported. */
const OPEN_REFERENCES = [
  'http://www.w3.org/2000/01/rdf-schema#Resource',
  'http://www.w3.org/1999/02/22-rdf-syntax-ns#List',
  'http://www.w3.org/ns/prov#Entity',
  'http://www.w3.org/ns/prov#Agent',
  'http://www.w3.org/2001/XMLSchema#anyURI',
];

interface WithWorklist {
  readonly unclassifiableRanges?: Readonly<Record<string, { readonly specFix: string }>>;
}

const worklist = (): Readonly<Record<string, { readonly specFix: string }>> =>
  (SPEC_TERMS as unknown as WithWorklist).unclassifiableRanges ?? {};

describe('the worklist reports spec-fixable gaps and never an open reference', () => {
  it('reports exactly the six Cascade-namespace classes, and nothing else', () => {
    expect(Object.keys(worklist()).sort()).toEqual(SPEC_ROW_GAPS);
  });

  it('names a spec fix for each reported range', () => {
    for (const range of SPEC_ROW_GAPS) {
      expect(worklist()[range]?.specFix, range).toBeTruthy();
    }
  });

  it('never reports any of the five open references', () => {
    for (const range of OPEN_REFERENCES) {
      expect(worklist()[range], range).toBeUndefined();
    }
  });
});
