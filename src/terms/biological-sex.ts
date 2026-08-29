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
 * `minCountByType` and not a flat `minCount`: an `sh:minCount` lives inside ONE
 * node shape, so this is required OF A PATIENT PROFILE and means nothing on any
 * other record. A flat cap would demand a biological sex on a lab result.
 *
 * @see spec/ontologies/core/v1/core.shapes.ttl  cascade:PatientProfileShape
 */

import { defineTerm, requirePredicate } from './term.js';

export const biologicalSex = defineTerm({
  key: 'biologicalSex',
  predicate: requirePredicate('biologicalSex'),
  minCountByType: { PatientProfile: 1 },
  values: ['male', 'female', 'intersex'],
  rule: { form: 'literal' },
});
