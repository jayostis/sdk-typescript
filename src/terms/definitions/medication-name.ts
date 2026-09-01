/**
 * clinical v1.8 — `clinical:drugName`: the name of the drug a medication record
 * is about. The FIELD is `medicationName`; the predicate is not spelled after
 * it, which is why the term names both.
 *
 * Termed for `sh:minCount 1` on `clinical:MedicationShape`.
 *
 * @see spec/ontologies/clinical/v1/clinical.shapes.ttl  clinical:MedicationShape
 */

import { defineTerm } from '../term.js';
import { requirePredicate } from '../predicate.js';

export const medicationName = defineTerm({
  key: 'medicationName',
  predicate: requirePredicate('medicationName'),
  minCountByType: { MedicationRecord: 1 },
  // The cap sits in the same property block as the minCount in every shape
  // that declares it. A cap answers HOW MANY and a minCount answers AT LEAST
  // ONE; neither substitutes for the other, and two values pass both.
  maxCount: 1,
  rule: { form: 'literal' },
});
