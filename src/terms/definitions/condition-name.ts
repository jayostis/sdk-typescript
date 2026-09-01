/**
 * health v1 — `health:conditionName`: the name of the condition a record is
 * about.
 *
 * Termed for `sh:minCount 1`, which `validateTypeSpecific` asserted from a
 * hardcoded `case` citing nothing. The shape is the source, and reading it
 * changes the rule: `health:conditionName` is required by
 * `health:ConditionRecordShape` AND by `health:FamilyHistoryRecordShape`, where
 * the switch only ever checked a `ConditionRecord`. A family history missing
 * its condition name was accepted.
 *
 * `minCountByType` and not a flat `minCount`: an `sh:minCount` lives inside ONE
 * node shape, so this is required of those two record types and means nothing
 * on any other. A flat cap would demand a condition name on a lab result.
 *
 * @see spec/ontologies/health/v1/health.shapes.ttl  health:ConditionRecordShape, health:FamilyHistoryRecordShape
 */

import { defineTerm } from '../term.js';
import { requirePredicate } from '../predicate.js';

export const conditionName = defineTerm({
  key: 'conditionName',
  predicate: requirePredicate('conditionName'),
  minCountByType: { ConditionRecord: 1, FamilyHistoryRecord: 1 },
  // The cap sits in the same property block as the minCount in every shape
  // that declares it. A cap answers HOW MANY and a minCount answers AT LEAST
  // ONE; neither substitutes for the other, and two values pass both.
  maxCount: 1,
  // sh:minLength 1, declared in the same property block as the cap above.
  // CHARACTERS, not content: "  " is two of them and conforms. See TermSpec.
  minLength: 1,
  rule: { form: 'literal' },
});
