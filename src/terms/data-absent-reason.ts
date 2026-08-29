/**
 * core v3.6 — `cascade:dataAbsentReason`: why a record's primary VALUE is
 * absent, bound to the 15 codes of the HL7 data-absent-reason code system.
 *
 * STUB. `outputsFor` returns nothing, which is what `serialize()` writes for
 * this field today (#2): an array value matches no `emitField` branch, so both
 * of absent-003's reasons are dropped without an error. Returning `[]` keeps
 * that behaviour exactly while giving `tests/terms/data-absent-reason.test.ts`
 * a symbol to assert against, so its failure lands on the assertion rather than
 * on a missing module.
 *
 * The signature is the contract: a `Term`, keyed `dataAbsentReason`, with its
 * predicate from `requirePredicate` and never written by hand. The `rule` is
 * the smallest declaration the type demands and is not a finding — `literal` is
 * simply the form the `{ kind: 'literal' }` outputs the issue asks for come
 * from.
 *
 * Barrelled but NOT in `index.ts`'s `TERMS`: registering it is what makes
 * `termFor('dataAbsentReason')` resolve, and that is the implementer's step.
 *
 * @see spec/ontologies/core/v1/core.ttl         cascade:dataAbsentReason
 * @see spec/ontologies/core/v1/core.shapes.ttl  cascade:DataAbsentReasonShape
 */

import { requirePredicate } from './term.js';
import type { Term } from './term.js';

export const dataAbsentReason: Term = {
  key: 'dataAbsentReason',
  predicate: requirePredicate('dataAbsentReason'),
  rule: { form: 'literal' },
  outputsFor: () => [],
};
