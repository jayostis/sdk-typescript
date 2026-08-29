/**
 * health v2.7 / clinical v1.15 — `interpretationSourceCode`: the source's own
 * verbatim code for an interpretation whose ratified reading is carried on
 * `interpretation` beside it.
 *
 * `{ form: 'literal' }` with nothing else is the REPEATED-literal form:
 * `outputsFor` ends at `members(value).flatMap(...)`, and `members` reads an
 * array as its members and a scalar as a one-member list, so `lab-013`'s two
 * codes are two triples and `lab-012`'s bare string is one. Not `literalList` —
 * that is the ordered `( "a" "b" )` rdf:List form, which would write a single
 * node where the fixture expects two triples, and `sh:maxCount 1` would count
 * that node as one conforming value.
 *
 * Two is ILLEGAL, and writing both is the point.
 * `health:LabResultRecordShape` caps `health:interpretationSourceCode` at
 * `sh:maxCount 1`, so a writer that keeps the first value hands the validator a
 * record with nothing left to violate and gets back a clean verdict on
 * incomplete data (#15). Faithful first, judged second.
 *
 * `predicateByType` carries what `TYPE_PREDICATE_OVERRIDES` used to say for
 * this field, and it is the first thing in the codebase to exercise the
 * mechanism. The escape hatch follows the property it explains: a vital sign
 * writes `clinical:interpretation`, so its verbatim code is
 * `clinical:interpretationSourceCode` and a consumer reading one always finds
 * the other in the same namespace. The override table's entry is gone rather
 * than left beside this one — `getPredicateForField` is no longer reached for a
 * termed key, so keeping it would be a second copy of the same fact.
 *
 * No `datatype`: the field is a plain string literal, and setting one would
 * write a typed literal the fixtures do not carry.
 *
 * @see spec/ontologies/health/v1/health.shapes.ttl     health:LabResultRecordShape
 * @see spec/ontologies/clinical/v1/clinical.shapes.ttl clinical:VitalSignShape
 */

import { defineTerm, requirePredicate } from './term.js';

export const interpretationSourceCode = defineTerm({
  key: 'interpretationSourceCode',
  predicate: requirePredicate('interpretationSourceCode'),
  predicateByType: { VitalSign: 'clinical:interpretationSourceCode' },
  rule: { form: 'literal' },
});
