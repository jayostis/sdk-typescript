/**
 * core v2.2 — `cascade:dateOfBirth`, required of a patient profile.
 *
 * Termed for the CARDINALITY `cascade:PatientProfileShape` declares — both
 * halves of it, `sh:minCount 1` and `sh:maxCount 1`, which sit on the same
 * `sh:property` block. `validate()` checked neither: `profile-004` is missing
 * this field and was rejected over `givenName` and `familyName` (#35) rather
 * than over what it is actually missing, and a profile carrying two dates of
 * birth was accepted outright.
 *
 * `{ form: 'literal', datatype: 'xsd:date' }` reproduces what `emitField`
 * already writes — `isDateOnlyField` routes it through `sub.date`, giving
 * `"1973-08-15"^^xsd:date`, and the shape declares `sh:datatype xsd:date` to
 * match. NO `values`: a date is constrained by its datatype, not by a list, and
 * an empty `values` would read as an empty value set rather than as none.
 *
 * @see spec/ontologies/core/v1/core.shapes.ttl  cascade:PatientProfileShape
 */

import { defineTerm } from '../term.js';
import { requirePredicate } from '../predicate.js';

export const dateOfBirth = defineTerm({
  key: 'dateOfBirth',
  predicate: requirePredicate('dateOfBirth'),
  minCountByType: { PatientProfile: 1 },
  // The OTHER half of the same `sh:property` block: `cascade:PatientProfileShape`
  // declares `sh:maxCount 1` on the line below the `sh:minCount 1`
  // (core.shapes.ttl:42-43). Terming one and stopping left `validate()` able to
  // report a profile with no date of birth and unable to report one with two:
  // `hasField` sees the field present, the minCount passes, and with no cap
  // nothing counted. `serialize()` writes both dates back out, faithfully.
  //
  // Flat rather than by type because `maxCount` has no per-type form, and it
  // needs none here — `cascade:dateOfBirth` is capped wherever it appears.
  maxCount: 1,
  rule: { form: 'literal', datatype: 'xsd:date' },
});
