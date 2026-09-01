/**
 * health v1 — `health:resultUnit`: the unit a lab result is reported in,
 * `"ng/mL"`, `"mmol/L"`.
 *
 * Termed for `sh:maxCount 1` on `health:LabResultRecordShape`, and for nothing
 * else, because the shape declares nothing else about it.
 *
 * NOT REQUIRED, AND THAT IS THE WHOLE POINT OF THE FIELD'S HISTORY. The
 * hardcoded `case` this SDK used to run demanded `resultUnit` alongside
 * `testName` and `resultValue`; only `testName` has an `sh:minCount` anywhere,
 * and requiring the other two was a rule with no source (#3). `test-name.ts`
 * records the same finding from the other side. The requirement was deleted and
 * is not being reinstated here — this term carries the cap that WAS published
 * and was lost with it.
 *
 * The model already agrees: `src/models/lab-result.ts` declares
 * `resultUnit?: string`, optional. Nothing but the deleted `case` ever said
 * otherwise.
 *
 * WHY IT EXISTS AT ALL. Presence and arity used to be answered together by that
 * one `case`. Splitting them across two layers left the cap unclaimed: no term
 * named `resultUnit`, so `termFindings` read nothing, and a lab result carrying
 * two units — what the faithful reader returns for a document with two
 * `health:resultUnit` triples — validated clean. Deleting an unsourced rule was
 * right; losing the sourced one beside it was not.
 *
 * @see spec/ontologies/health/v1/health.shapes.ttl  health:LabResultRecordShape
 */

import { defineTerm } from '../term.js';
import { requirePredicate } from '../predicate.js';

export const resultUnit = defineTerm({
  key: 'resultUnit',
  predicate: requirePredicate('resultUnit'),
  maxCount: 1,
  // NO minLength and NO minCount. `health:LabResultRecordShape` gives this path
  // an `sh:maxCount` and nothing more; the term states exactly that much.
  rule: { form: 'literal' },
});
