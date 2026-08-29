/**
 * health v2.x — `health:resultValue`: the measured value of a lab result.
 *
 * Termed for its CARDINALITY rather than for its rule. `health:LabResultRecordShape`
 * caps it at `sh:maxCount 1`, and until a term carried that, nothing shipped
 * could see it: `serialize()` writes one triple per member of an array and
 * `validate()` only reads a cap off a term, so a record carrying two result
 * values was written in full and pronounced valid. `shaclCheck` caught it, and
 * `shaclCheck` does not ship.
 *
 * `{ form: 'number' }` and not `'literal'`, which would quote everything. The
 * model types this `string`, but `emitField` has always taken its numeric branch
 * for a numeric value — `4` writes a bare `4`, `4.2` a bare `4.2`, and only a
 * string writes `"4"`. `outputsForMember`'s `number` case falls back to a quoted
 * literal for a non-number, which is that same fall-through, and `addAll` splits
 * integer from decimal exactly as `emitField` does. All three spellings are
 * unchanged.
 *
 * NO `resultUnit` beside it, deliberately. It is `sh:maxCount 1` too and would
 * be one more file, but terming a field changes which code path writes it, and
 * doing two at once means a byte difference has two suspects. `resultUnit` is
 * the obvious next one.
 *
 * @see spec/ontologies/health/v1/health.shapes.ttl  health:LabResultRecordShape
 */

import { defineTerm, requirePredicate } from './term.js';

export const resultValue = defineTerm({
  key: 'resultValue',
  predicate: requirePredicate('resultValue'),
  // health:LabResultRecordShape
  maxCount: 1,
  rule: { form: 'number' },
});
