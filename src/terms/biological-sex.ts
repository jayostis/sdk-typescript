/**
 * core v2.2 — `cascade:biologicalSex`: sex assigned at birth, distinct from
 * `cascade:genderIdentity` beside it on the same profile.
 *
 * Termed for `sh:minCount 1` on `cascade:PatientProfileShape`, which `validate()`
 * did not check: `profile-005` is missing this field and was rejected over
 * `givenName` and `familyName` instead — #35's defect, not this fixture's claim.
 * A verdict that agrees with `shouldAccept` while looking at neither the missing
 * field nor anything else the record is about is a vacuous rejection.
 *
 * The `sh:maxCount 1` beside it is carried too. A value set answers WHICH values
 * and a cap answers HOW MANY, and neither substitutes for the other: two
 * admitted members are two passes of the `values` loop and one broken shape.
 *
 * `minCountByType` and not a flat `minCount`: an `sh:minCount` lives inside ONE
 * node shape, so this is required OF A PATIENT PROFILE and means nothing on any
 * other record. A flat cap would demand a biological sex on a lab result.
 *
 * @see spec/ontologies/core/v1/core.shapes.ttl  cascade:PatientProfileShape
 */

import { defineTerm } from './term.js';
import { requirePredicate } from './predicate.js';

export const biologicalSex = defineTerm({
  key: 'biologicalSex',
  predicate: requirePredicate('biologicalSex'),
  minCountByType: { PatientProfile: 1 },
  // `cascade:PatientProfileShape` declares `sh:maxCount 1` (core.shapes.ttl:54)
  // in the same block as the `sh:minCount 1` and the `sh:in` above.
  //
  // The value set does not cover this and cannot: `biologicalSex:
  // ['male', 'female']` is two admitted members, so the `values` loop passes
  // each one and the record's only defect is how many there are. Uncapped,
  // `validate()` returned an empty `errors` array for it.
  maxCount: 1,
  values: ['male', 'female', 'intersex'],
  rule: { form: 'literal' },
});
