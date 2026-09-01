/**
 * clinical v1.8 — `clinical:drugName`: the name of the drug a medication record
 * is about. The FIELD is `medicationName`; the predicate is not spelled after
 * it, which is why the term names both.
 *
 * Termed for the `sh:maxCount 1` on `clinical:MedicationShape`, which is a cap
 * on the PREDICATE — true wherever `clinical:drugName` appears. The
 * `sh:minCount 1` beside it in the same property block is not: an `sh:minCount`
 * is scoped to one node shape, so it is a fact about a RECORD TYPE, and
 * `MedicationValidator` owns it. Declared in both places it reported twice.
 *
 * @see spec/ontologies/clinical/v1/clinical.shapes.ttl  clinical:MedicationShape
 */

import { defineTerm } from '../term.js';
import { requirePredicate } from '../predicate.js';

export const medicationName = defineTerm({
  key: 'medicationName',
  predicate: requirePredicate('medicationName'),
  // NO minCountByType. An sh:minCount is scoped to ONE node shape, so it is a
  // fact about a record type rather than about this predicate, and
  // MedicationValidator owns it. Declared in both places it reported twice.
  // The cap sits in the same property block as the minCount in every shape
  // that declares it. A cap answers HOW MANY and a minCount answers AT LEAST
  // ONE; neither substitutes for the other, and two values pass both.
  maxCount: 1,
  // sh:minLength 1, declared in the same property block as the cap above.
  // CHARACTERS, not content: "  " is two of them and conforms. See TermSpec.
  minLength: 1,
  rule: { form: 'literal' },
});
