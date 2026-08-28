/**
 * Properties of the SHACL helper in `tests/support/rdf.ts` itself, as distinct
 * from any claim about a vocabulary.
 *
 * A helper that reports a wrong verdict is worse than a missing helper: every
 * suite that leans on it inherits the wrong answer while reporting green. The
 * cases below are the ways `shaclCheck` could do that — answering about the
 * wrong record, and answering at all about a graph the vendored shapes are
 * silent on. "Silent" has three shapes, and `assertCovered` throws for each:
 * a subject with no type, a type no shape targets, and a PREDICATE no shape
 * constrains. The third is the one a type check alone cannot see.
 */

import { describe, it, expect } from 'vitest';
import { NAMESPACES } from '../src/vocabularies/namespaces.js';
import { assertCovered, loadCascadeRecordFixture, parseDataset, shaclCheck } from './support/rdf.js';

describe('shaclCheck: one verdict per call', () => {
  it('does not cross verdicts between concurrent callers', async () => {
    // A module-level SHACLValidator reused across calls mutates $data after an
    // await, so the second setDataGraph lands before the first validateAll and
    // BOTH verdicts describe the second record. lab-001 conforms and absent-002
    // does not, so a crossed pair is visible as two equal verdicts.
    //
    // lab-001 rather than absent-001, which this used to pair with: absent-001
    // no longer reaches a verdict at all — see the clinical:loincCode case
    // below. Both are health:LabResultRecord fixtures, and lab-001 is the one
    // that spells its LOINC code the way the vendored shapes constrain it
    // (`health:testCode`), so the pair is otherwise unchanged.
    const [conforming, unmapped] = await Promise.all([
      shaclCheck(loadCascadeRecordFixture('lab-001').input),
      shaclCheck(loadCascadeRecordFixture('absent-002').input),
    ]);

    expect(conforming.conforms).toBe(true);
    expect(unmapped.conforms).toBe(false);
  });
});

describe('shaclCheck: a graph the vendored shapes cannot judge is not a pass', () => {
  it('refuses a clinical: record rather than conforming vacuously', async () => {
    // tests/shapes/ vendors core and health only. Before this guard,
    // clinical:Medication validated against a graph holding no clinical shape
    // and came back { conforms: true, violations: [] } — indistinguishable from
    // a record that genuinely satisfies every clinical constraint.
    await expect(shaclCheck(loadCascadeRecordFixture('med-001').input)).rejects.toThrow(/clinical/);
  });

  it('refuses a coverage: record for the same reason', async () => {
    await expect(shaclCheck(loadCascadeRecordFixture('claim-001').input)).rejects.toThrow(/coverage/);
  });

  it('refuses a covered TYPE that carries a predicate from an unvendored vocabulary', async () => {
    // The case a type-only check cannot see, and it is live rather than
    // hypothetical. absent-001 is a health:LabResultRecord — a type the
    // vendored shapes do target — but `serialize()` writes its LOINC code as
    // `clinical:loincCode`, and no vendored shape declares an sh:path for it
    // under any spelling: health.shapes.ttl constrains `health:testCode` on
    // LabResultRecordShape and `cascade:loincCode` on DailyVitalReadingShape,
    // neither of which this triple uses.
    //
    // So the shapes had nothing to say about one of absent-001's four data
    // triples, and `expect(report.results).toEqual([])` in
    // data-absent-reason.test.ts was asserting the absence of violations no
    // shape in the graph could have raised.
    //
    // This test retires itself: it goes red the day clinical shapes are
    // vendored, or the day the predicate is settled. See the absent-001
    // describe in tests/data-absent-reason.test.ts for what that would restore.
    await expect(shaclCheck(loadCascadeRecordFixture('absent-001').input))
      .rejects.toThrow(/clinical:loincCode/);
  });

  it('refuses a subject carrying no rdf:type rather than reading that as covered', () => {
    // Latent, so it is asserted through `assertCovered` directly: `serialize()`
    // emits `a <type>` for every type in TYPE_MAPPING and throws for anything
    // else, so no record reaches shaclCheck with an untyped subject today. It
    // still failed OPEN — with no types found, "nothing is uncovered" was read
    // as "covered", and a graph whose subject has no type is precisely a graph
    // no sh:targetClass selects, so the verdict would have been the vacuous
    // conforms:true this guard exists to refuse.
    const untyped = parseDataset(
      `<urn:uuid:untyped> <${NAMESPACES.cascade}dataAbsentReason> "not-performed" .`,
    );

    expect(() => assertCovered(untyped, { id: 'urn:uuid:untyped', type: 'LabResultRecord' }))
      .toThrow(/no rdf:type/);
  });
});
