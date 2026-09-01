/**
 * health v1 — `health:testName`: the name of the test a lab result reports.
 *
 * Termed for `sh:minCount 1` on `health:LabResultRecordShape`. The hardcoded
 * `case` this replaces was right about `testName` and wrong two fields along,
 * where it also required `resultValue` and `resultUnit` — neither of which any
 * shape gives an `sh:minCount` (#3). Those two are deleted rather than termed:
 * a term carries a rule the vocabulary states, and there is no rule to carry.
 *
 * @see spec/ontologies/health/v1/health.shapes.ttl  health:LabResultRecordShape
 */

import { defineTerm } from '../term.js';
import { requirePredicate } from '../predicate.js';

export const testName = defineTerm({
  key: 'testName',
  predicate: requirePredicate('testName'),
  minCountByType: { LabResultRecord: 1 },
  // The cap sits in the same property block as the minCount in every shape
  // that declares it. A cap answers HOW MANY and a minCount answers AT LEAST
  // ONE; neither substitutes for the other, and two values pass both.
  maxCount: 1,
  // sh:minLength 1, declared in the same property block as the cap above.
  // CHARACTERS, not content: "  " is two of them and conforms. See TermSpec.
  minLength: 1,
  rule: { form: 'literal' },
});
