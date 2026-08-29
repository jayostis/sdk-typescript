/**
 * STUB — the declaration #15 fills in.
 *
 * health v2.7 / clinical v1.15 — `interpretationSourceCode`: the source's own
 * verbatim code for an interpretation whose ratified reading is carried on
 * `interpretation` beside it.
 *
 * This exists so the tests in `tests/terms/interpretation-source-code.test.ts`
 * can NAME the term and fail on what it returns rather than on an import that
 * does not resolve. It writes nothing, and it is deliberately not listed in
 * `./index.ts`: a term reaches the serializer only through that barrel, so
 * leaving it out keeps every fixture serializing exactly as it does today
 * while the tests that describe the finished rule stay red.
 *
 * What the shape of this declaration commits to, and what #15 has to supply:
 *
 *   - `key` / `predicate` — the registered field and its `health:` default,
 *     resolved through `requirePredicate` because a term references vocabulary
 *     and never declares any.
 *   - `predicateByType` — `{ VitalSign: 'clinical:interpretationSourceCode' }`,
 *     the entry `TYPE_PREDICATE_OVERRIDES` carries today, moved onto the term
 *     so `outputsFor` and `collectPrefixes` resolve it from one place.
 *   - `rule: { form: 'literal' }` — the REPEATED-literal form, one triple per
 *     value in the order given, which is what makes `lab-013`'s two codes both
 *     reach the graph. Not `literalList`: an ordered `( "a" "b" )` is a single
 *     node, and `sh:maxCount 1` would count it as one conforming value.
 *
 * @see spec/ontologies/health/v1/health.shapes.ttl    health:LabResultRecordShape
 * @see spec/ontologies/clinical/v1/clinical.shapes.ttl clinical:VitalSignShape
 */

import { requirePredicate } from './term.js';
import type { Term } from './term.js';

export const interpretationSourceCode: Term = {
  key: 'interpretationSourceCode',
  predicate: requirePredicate('interpretationSourceCode'),
  rule: { form: 'literal' },
  outputsFor: () => [],
};
