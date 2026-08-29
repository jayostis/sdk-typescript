/**
 * core v2.2 — `cascade:dateOfBirth`, required of a patient profile.
 *
 * Termed for `sh:minCount 1` on `cascade:PatientProfileShape`. `validate()` did
 * not check it: `profile-004` is missing this field and was rejected over
 * `givenName` and `familyName` (#35) rather than over what it is actually
 * missing.
 *
 * `{ form: 'literal', datatype: 'xsd:date' }` reproduces what `emitField`
 * already writes — `isDateOnlyField` routes it through `sub.date`, giving
 * `"1973-08-15"^^xsd:date`, and the shape declares `sh:datatype xsd:date` to
 * match. NO `values`: a date is constrained by its datatype, not by a list, and
 * an empty `values` would read as an empty value set rather than as none.
 *
 * @see spec/ontologies/core/v1/core.shapes.ttl  cascade:PatientProfileShape
 */

import { defineTerm, requirePredicate } from './term.js';

export const dateOfBirth = defineTerm({
  key: 'dateOfBirth',
  predicate: requirePredicate('dateOfBirth'),
  minCountByType: { PatientProfile: 1 },
  rule: { form: 'literal', datatype: 'xsd:date' },
});
