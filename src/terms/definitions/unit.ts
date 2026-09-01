/**
 * clinical v1 — `clinical:unit`: the unit a vital sign is measured in, `"bpm"`,
 * `"mmHg"`, `"°C"`.
 *
 * Termed for `sh:maxCount 1`, which three shapes declare and agree on:
 * `clinical:VitalSignShape`, `clinical:LabResultShape` and — under the
 * `health:unit` spelling — `health:DailyVitalReadingShape`. A cap is a fact
 * about the predicate, true wherever it appears, so one flat number covers all
 * three.
 *
 * NO `minCountByType`, AND THE MODEL DISAGREES. `src/models/vital-sign.ts`
 * declares `unit: string`, non-optional, and its docblock lists it among the
 * required fields — but not one of those three shapes gives the path an
 * `sh:minCount`. A vital sign without a unit conforms. That is the same
 * disagreement `MedicationValidator` records for `isActive` and
 * `ConditionRecord` has for `status`, all three on a field the model requires
 * and the vocabulary does not, and it is not this term's to settle: a term
 * carries what the shapes state. The presence question belongs to a
 * `VitalSignValidator` when one exists (#49), which is where a model-versus-
 * shape disagreement is supposed to be written down and argued.
 *
 * WHY IT EXISTS AT ALL. The cap WAS enforced, by a hardcoded `case` in
 * `validateTypeSpecific` that answered presence and arity together. Splitting
 * those two questions across two layers left this one behind: no term claimed
 * `unit`, so `termFindings` had nothing to read and a vital sign carrying two
 * units — which the faithful reader produces from a document with two
 * `clinical:unit` triples — came back clean. A published `sh:maxCount` that
 * nothing enforced.
 *
 * @see spec/ontologies/clinical/v1/clinical.shapes.ttl  clinical:VitalSignShape
 */

import { defineTerm } from '../term.js';
import { requirePredicate } from '../predicate.js';

export const unit = defineTerm({
  key: 'unit',
  predicate: requirePredicate('unit'),
  maxCount: 1,
  // NO minLength. `clinical:unit` carries none in any of the three property
  // blocks that cap it, so `""` is a conformant unit and this must not reject
  // one — the rule transcribes the shape, including where the shape is quieter
  // than seems sensible.
  rule: { form: 'literal' },
});
