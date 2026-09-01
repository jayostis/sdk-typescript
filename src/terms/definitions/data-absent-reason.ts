/**
 * core v3.6 — `cascade:dataAbsentReason`: why a record's primary VALUE is
 * absent, bound to the 15 codes of the HL7 data-absent-reason code system.
 *
 * `{ form: 'literal' }` with nothing else is the REPEATED-literal form:
 * `outputsFor` ends at `members(value).flatMap(...)`, and `members` reads an
 * array as its members and a scalar as a one-member list, so a two-element
 * array is two `cascade:dataAbsentReason` triples and a bare string is one.
 * Not `literalList` — that is the ordered `( "a" "b" )` rdf:List form, which
 * would write a single node where the fixture expects two triples.
 *
 * Two is ILLEGAL, and writing both is the point. `cascade:DataAbsentReasonShape`
 * is `sh:targetSubjectsOf cascade:dataAbsentReason` with `sh:maxCount 1`, so a
 * writer that drops the second value hands the validator a record with nothing
 * left to violate and gets back a clean verdict on incomplete data (#2).
 * Faithful first, judged second.
 *
 * No `datatype`: the field is a plain string literal, and setting one would
 * write a typed literal absent-001 and absent-002 do not carry.
 *
 * @see spec/ontologies/core/v1/core.ttl         cascade:dataAbsentReason
 * @see spec/ontologies/core/v1/core.shapes.ttl  cascade:DataAbsentReasonShape
 */

import { defineTerm } from '../term.js';
import { requirePredicate } from '../predicate.js';

export const dataAbsentReason = defineTerm({
  key: 'dataAbsentReason',
  predicate: requirePredicate('dataAbsentReason'),
  // cascade:DataAbsentReasonShape
  maxCount: 1,
  // cascade:DataAbsentReasonShape sh:in — the HL7 data-absent-reason code
  // system, transcribed from the shape rather than from the code system, since
  // the shape is what judges it.
  values: [
  'unknown', 'asked-unknown', 'temp-unknown', 'not-asked', 'asked-declined', 'masked',
  'not-applicable', 'unsupported', 'as-text', 'error', 'not-a-number', 'negative-infinity',
  'positive-infinity', 'not-performed', 'not-permitted'
  ],
  rule: { form: 'literal' },
});
