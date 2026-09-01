/**
 * clinical v1 — `clinical:relationship`: how the person a family history record
 * is about is related to the patient, `"mother"`, `"maternal grandfather"`.
 *
 * Termed for the whole of `health:FamilyHistoryRecordShape`'s property block,
 * which declares an `sh:minCount 1`, an `sh:maxCount 1` and an `sh:minLength 1`
 * at `sh:Violation` — and which nothing in this SDK read. A family history
 * record carrying no relationship at all came back `valid: true` while
 * `pyshacl` reported "Family history record must state exactly one relationship
 * to the patient".
 *
 * FOUND BY AUDITING A GROUP OF TESTS, not by a failure. `tests/validator.test.ts`
 * had a `describe` titled "Types with no additional type-specific required
 * fields" holding four record types; two of them had required fields.
 * `FamilyHistoryRecord` was moved out when `conditionName` became a term, and
 * `relationship` was in the same shape, in the same scan output, and read past.
 * The lesson is the group title: a test asserting a record type has nothing to
 * check will pass for exactly as long as nothing checks it.
 *
 * `minCountByType` AND IT SHOULD NOT BE. A per-record-type requirement declared
 * on a predicate makes this file name every record type that uses it, which is
 * backwards — see #49, which retires the field. It is written this way because
 * that is where the other seven live and there is no `FamilyHistoryValidator`
 * yet; it moves with them.
 *
 * @see spec/ontologies/health/v1/health.shapes.ttl  health:FamilyHistoryRecordShape
 */

import { defineTerm } from '../term.js';
import { requirePredicate } from '../predicate.js';

export const relationship = defineTerm({
  key: 'relationship',
  predicate: requirePredicate('relationship'),
  minCountByType: { FamilyHistoryRecord: 1 },
  maxCount: 1,
  // sh:minLength 1, declared in the same property block as the cap above.
  // CHARACTERS, not content: "  " is two of them and conforms. See TermSpec.
  minLength: 1,
  rule: { form: 'literal' },
});
