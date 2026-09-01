/**
 * The `dataAbsentReason` term: `cascade:dataAbsentReason`, core v3.6.
 *
 * Pure. No serializer, no fixture loader, no RDF library — a term returns DATA
 * and this file reads that data, so what fails here is the term's own rule and
 * nothing downstream of it.
 *
 * The claim is ARITY. The vocabulary's own cardinality rule
 * (`cascade:DataAbsentReasonShape`, `sh:maxCount 1`) says one reason is the
 * legal number, and it is exactly because two is illegal that two must be
 * WRITTEN: a shape can only judge what reached the graph, so a writer that
 * silently drops the second value hands a validator an incomplete record and
 * gets back a clean verdict. Faithful first, judged second.
 *
 * @see spec/ontologies/core/v1/core.ttl         cascade:dataAbsentReason
 * @see spec/ontologies/core/v1/core.shapes.ttl  cascade:DataAbsentReasonShape
 * @see tests/conformance/absent.test.ts         the same claim, end to end
 */

import { describe, it, expect } from 'vitest';

import { dataAbsentReason } from '../../src/terms/data-absent-reason.js';
import { requirePredicate } from '../../src/terms/index.js';

const ID = 'urn:uuid:absent03-aaaa-bbbb-cccc-ddddeeeeffff';

describe('dataAbsentReason', () => {
  it('references the registered predicate rather than declaring one', () => {
    // Hand-written on the right, resolved on the left. Comparing the term
    // against `PROPERTY_PREDICATES` directly would agree with the table by
    // construction and a re-namespaced predicate would pass unnoticed.
    expect(dataAbsentReason.key).toBe('dataAbsentReason');
    expect(dataAbsentReason.predicate).toBe('cascade:dataAbsentReason');
    expect(requirePredicate('dataAbsentReason')).toBe('cascade:dataAbsentReason');
  });

  it('writes one literal per reason, in the order given', () => {
    // absent-003's input verbatim. Two outputs, not one and not a joined
    // "not-asked,asked-unknown" — a reader cannot split that back apart, and
    // sh:maxCount would count it as a conforming single value.
    expect(
      dataAbsentReason.outputsFor({
        type: 'LabResultRecord',
        dataAbsentReason: ['not-asked', 'asked-unknown'],
      }),
    ).toEqual([
      { kind: 'literal', predicate: 'cascade:dataAbsentReason', value: 'not-asked' },
      { kind: 'literal', predicate: 'cascade:dataAbsentReason', value: 'asked-unknown' },
    ]);
  });

  it('writes a bare scalar as the same single literal an array of one would give', () => {
    // absent-001 and absent-002 pass a bare string, and they are the shape that
    // works today. Whatever emits the array must not change them: `toEqual`
    // with no `datatype` key is the assertion, since an output carrying
    // `datatype: undefined` would write a typed literal the fixtures do not.
    expect(
      dataAbsentReason.outputsFor({ type: 'LabResultRecord', dataAbsentReason: 'not-performed' }),
    ).toEqual([
      { kind: 'literal', predicate: 'cascade:dataAbsentReason', value: 'not-performed' },
    ]);
  });

  it('writes nothing for a record that carries no reason at all', () => {
    // The overwhelmingly common case: a record whose value is present. An
    // absent field is not an empty reason, and a term that wrote one would put
    // `cascade:dataAbsentReason ""` on every record in the corpus.
    expect(dataAbsentReason.outputsFor({ id: ID, type: 'LabResultRecord' })).toEqual([]);
  });
});
