/**
 * health v1 — `health:allergen`: the substance an allergy record is about.
 *
 * Termed for `sh:minCount 1` on `health:AllergyRecordShape`, which
 * `validateTypeSpecific` asserted from a hardcoded `case` citing nothing. The
 * rule is unchanged by reading the shape — the switch happened to be right
 * here — but it is now sourced, and it moves out of the chain that is being
 * retired.
 *
 * @see spec/ontologies/health/v1/health.shapes.ttl  health:AllergyRecordShape
 */

import { defineTerm } from '../term.js';
import { requirePredicate } from '../predicate.js';

export const allergen = defineTerm({
  key: 'allergen',
  predicate: requirePredicate('allergen'),
  minCountByType: { AllergyRecord: 1 },
  // The cap sits in the same property block as the minCount in every shape
  // that declares it. A cap answers HOW MANY and a minCount answers AT LEAST
  // ONE; neither substitutes for the other, and two values pass both.
  maxCount: 1,
  rule: { form: 'literal' },
});
