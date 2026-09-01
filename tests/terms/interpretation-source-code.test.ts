/**
 * The `interpretationSourceCode` term: `health:interpretationSourceCode`, and
 * `clinical:interpretationSourceCode` on a vital sign (health v2.7 /
 * clinical v1.15).
 *
 * Pure. No serializer, no fixture loader, no RDF library — a term returns DATA
 * and this file reads that data, so what fails here is the term's own rule and
 * nothing downstream of it.
 *
 * Two claims, and the field was chosen because it makes both at once.
 *
 * ARITY. `lab-013` supplies two verbatim codes for one interpretation, and both
 * have to be WRITTEN even though two is illegal: `health:LabResultRecordShape`
 * caps `health:interpretationSourceCode` at `sh:maxCount 1`, and a shape can
 * only judge what reached the graph. A writer that keeps the first value hands
 * the validator a record with nothing left to violate and gets back a clean
 * verdict on incomplete data. Faithful first, judged second.
 *
 * NAMESPACE. The predicate is chosen by the RECORD TYPE, not by the field name:
 * a lab result writes `health:`, a vital sign writes `clinical:`, so the
 * verbatim code always sits in the same namespace as the `interpretation` it
 * explains and a consumer reading one finds the other. Both spellings have live
 * fixtures — `lab-012` / `lab-013` and `vital-001` / `vital-004` — so a term
 * that keyed only on the field name would move real output, not a hypothetical.
 *
 * @see spec/ontologies/health/v1/health.shapes.ttl     health:LabResultRecordShape
 * @see spec/ontologies/clinical/v1/clinical.shapes.ttl clinical:VitalSignShape
 * @see tests/conformance/lab.test.ts                   the arity claim, end to end
 * @see tests/vocab-2026-08-train.test.ts               the namespace claim, end to end
 */

import { describe, it, expect } from 'vitest';

import { interpretationSourceCode } from '../../src/terms/definitions/interpretation-source-code.js';
import { requirePredicate } from '../../src/terms/index.js';
import { termFor } from '../../src/terms/index.js';

const LAB_ID = 'urn:uuid:lab013-aaaa-bbbb-cccc-ddddeeeeffff';

describe('interpretationSourceCode', () => {
  it('references the registered predicate rather than declaring one', () => {
    // Hand-written on the right, resolved on the left. Comparing the term
    // against `PROPERTY_PREDICATES` directly would agree with the table by
    // construction and a re-namespaced predicate would pass unnoticed.
    expect(interpretationSourceCode.key).toBe('interpretationSourceCode');
    expect(interpretationSourceCode.predicate).toBe('health:interpretationSourceCode');
    expect(requirePredicate('interpretationSourceCode')).toBe('health:interpretationSourceCode');
  });

  it('is the module the barrel hands out for this field', () => {
    // A term is reachable only once `src/terms/index.ts` lists it. Left out, it
    // is dead code that still compiles: `termFor` returns undefined, the
    // serializer takes its type-driven default, and every assertion below can
    // pass while nothing about the SDK's output has changed.
    expect(termFor('interpretationSourceCode')).toBe(interpretationSourceCode);
  });

  it('writes one literal per source code, in the order given', () => {
    // lab-013's input verbatim. Two outputs, not one and not a joined
    // "ZQ7,HIGH-LOCAL" — a reader cannot split that back apart, and
    // sh:maxCount would count it as a conforming single value.
    expect(
      interpretationSourceCode.outputsFor({
        id: LAB_ID,
        type: 'LabResultRecord',
        interpretationSourceCode: ['ZQ7', 'HIGH-LOCAL'],
      }),
    ).toEqual([
      { kind: 'literal', predicate: 'health:interpretationSourceCode', value: 'ZQ7' },
      { kind: 'literal', predicate: 'health:interpretationSourceCode', value: 'HIGH-LOCAL' },
    ]);
  });

  it('writes a bare scalar as the same single literal an array of one would give', () => {
    // lab-012 passes a bare string and is the shape that works today. Whatever
    // emits the array must not change it: `toEqual` with no `datatype` key is
    // the assertion, since an output carrying `datatype: undefined` would write
    // a typed literal the fixture does not.
    expect(
      interpretationSourceCode.outputsFor({
        id: LAB_ID,
        type: 'LabResultRecord',
        interpretationSourceCode: 'ZQ7',
      }),
    ).toEqual([
      { kind: 'literal', predicate: 'health:interpretationSourceCode', value: 'ZQ7' },
    ]);
  });

  it('resolves the clinical: spelling from the record type, not from the field name', () => {
    // The assertion that fails if this migration keys on the field alone.
    // `clinical:interpretationSourceCode` is what TYPE_PREDICATE_OVERRIDES
    // writes for a VitalSign today and what vital-001 and vital-004 expect, so
    // a term reading only its `predicate` would silently re-namespace two
    // shipped fixtures.
    expect(
      interpretationSourceCode.outputsFor({
        id: 'urn:uuid:vs01-sys0-0120-aaaa-bbbbccccdddd',
        type: 'VitalSign',
        interpretationSourceCode: 'elevated',
      }),
    ).toEqual([
      { kind: 'literal', predicate: 'clinical:interpretationSourceCode', value: 'elevated' },
    ]);

    // Arity and namespace are resolved independently: an array on a VitalSign
    // is every value under the OVERRIDDEN predicate, not the first value, and
    // not the health: spelling.
    expect(
      interpretationSourceCode.outputsFor({
        id: 'urn:uuid:vs01-sys0-0120-aaaa-bbbbccccdddd',
        type: 'VitalSign',
        interpretationSourceCode: ['ZQ7', 'HIGH-LOCAL'],
      }),
    ).toEqual([
      { kind: 'literal', predicate: 'clinical:interpretationSourceCode', value: 'ZQ7' },
      { kind: 'literal', predicate: 'clinical:interpretationSourceCode', value: 'HIGH-LOCAL' },
    ]);
  });

  it('writes nothing for a record that carries no source code at all', () => {
    // The overwhelmingly common case: every lab result and vital sign whose
    // interpretation needed no verbatim escape hatch. An absent field is not an
    // empty code, and a term that wrote one would put
    // `health:interpretationSourceCode ""` on most of the corpus.
    expect(
      interpretationSourceCode.outputsFor({ id: LAB_ID, type: 'LabResultRecord' }),
    ).toEqual([]);
  });
});
