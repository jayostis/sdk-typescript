/**
 * health v1 — `health:vaccineName`: the vaccine an immunization record is about.
 *
 * Termed for `sh:minCount 1` on `health:ImmunizationRecordShape`.
 *
 * @see spec/ontologies/health/v1/health.shapes.ttl  health:ImmunizationRecordShape
 */

import { defineTerm } from '../term.js';
import { requirePredicate } from '../predicate.js';

export const vaccineName = defineTerm({
  key: 'vaccineName',
  predicate: requirePredicate('vaccineName'),
  minCountByType: { ImmunizationRecord: 1 },
  // The cap sits in the same property block as the minCount in every shape
  // that declares it. A cap answers HOW MANY and a minCount answers AT LEAST
  // ONE; neither substitutes for the other, and two values pass both.
  maxCount: 1,
  // sh:minLength 1, declared in the same property block as the cap above.
  // CHARACTERS, not content: "  " is two of them and conforms. See TermSpec.
  minLength: 1,
  rule: { form: 'literal' },
});
