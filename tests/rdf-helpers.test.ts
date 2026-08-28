/**
 * Properties of `shaclCheck` itself, as distinct from any claim about a record.
 *
 * A validator that answers when it cannot check is worse than no validator: a
 * pod of malformed records comes back certified clean, and every suite leaning
 * on the helper reports green while inheriting the wrong answer.
 */

import { describe, it, expect } from 'vitest';
import { NAMESPACES } from '../src/vocabularies/namespaces.js';
import { loadCascadeRecordFixture } from './support/fixtures.js';
import { parseDataset } from './support/graph.js';
import { assertCovered, shaclCheck } from './support/shacl.js';

describe('shaclCheck never certifies what it did not check', () => {
  it('refuses a record whose vocabulary we hold no shapes for', async () => {
    // Before the guard, a clinical:Medication validated against a graph holding
    // no clinical shape and returned conforms:true — indistinguishable from a
    // record that satisfies every clinical constraint.
    await expect(shaclCheck(loadCascadeRecordFixture('med-001').input)).rejects.toThrow(/clinical/);
  });

  it('refuses a coverage: record too, so the rule is not special-cased to clinical:', async () => {
    await expect(shaclCheck(loadCascadeRecordFixture('claim-001').input)).rejects.toThrow(/coverage/);
  });

  it('refuses a record whose type we can judge but whose data we cannot', async () => {
    // The case a type check alone cannot see, and it is live. absent-001 is a
    // health:LabResultRecord — a type the vendored shapes do target — but
    // serialize() writes its LOINC code as clinical:loincCode, which no vendored
    // shape declares an sh:path for.
    //
    // This test retires itself: it goes red the day clinical shapes are vendored
    // or the day the predicate is settled (#8). Red here is a signal, not a bug.
    await expect(shaclCheck(loadCascadeRecordFixture('absent-001').input))
      .rejects.toThrow(/clinical:loincCode/);
  });

  it('refuses a record with nothing on it to say what it is', () => {
    // Asserted through assertCovered directly because no record can reach
    // shaclCheck this way today: serialize() emits `a <type>` for everything in
    // TYPE_MAPPING and throws for anything else. It still failed OPEN — no types
    // found was read as nothing uncovered, and a subject with no type is exactly
    // what no sh:targetClass selects.
    const untyped = parseDataset(
      `<urn:uuid:untyped> <${NAMESPACES.cascade}dataAbsentReason> "not-performed" .`,
    );

    expect(() => assertCovered(untyped, { id: 'urn:uuid:untyped', type: 'LabResultRecord' }))
      .toThrow(/no rdf:type/);
  });
});

describe('shaclCheck answers about the record it was asked about', () => {
  it('does not swap verdicts between two records validated at once', async () => {
    // One SHACLValidator is shared across calls. If a future release awaits
    // inside validate(), the second setDataGraph lands before the first
    // validateAll and BOTH verdicts describe the second record. lab-001 conforms
    // and absent-002 does not, so crossing shows up as two equal verdicts.
    const [conforming, violating] = await Promise.all([
      shaclCheck(loadCascadeRecordFixture('lab-001').input),
      shaclCheck(loadCascadeRecordFixture('absent-002').input),
    ]);

    expect(conforming.conforms).toBe(true);
    expect(violating.conforms).toBe(false);
  });
});
