/**
 * core v3.5: `cascade:sourceIdentity`, the ORIGIN axis.
 *
 * A record carries three source-shaped answers to three different questions.
 * `clinical:sourceEHR` is a display LABEL, worded however the source document
 * worded it. `cascade:sourceSystem` is the INGESTION batch: how and when the
 * data entered the pod. `cascade:sourceIdentity` is the ORIGIN: a canonical,
 * transport-independent identity for the organization the record came from, and
 * the only one of the three that may be used as a reconciliation key.
 *
 * This SDK stores and round-trips the value. It does NOT validate the scheme:
 * deriving a slug is the importer's job, and a reader that rejected a value it
 * did not know how to mint would drop data it was asked to carry. The tests
 * below pin both halves of that: the round trip, and the deliberate absence of
 * enforcement.
 *
 * All values are synthetic.
 */

import { describe, it, expect } from 'vitest';
import { PROPERTY_PREDICATES } from '../src/vocabularies/index.js';
import { getContext } from '../src/jsonld/index.js';
import { serialize } from '../src/serializer/turtle-serializer.js';
import { deserializeOne } from '../src/deserializer/turtle-parser.js';
import { validate } from '../src/validator/index.js';
import type { Condition } from '../src/models/condition.js';

function condition(sourceIdentity?: string): Condition {
  return {
    id: 'urn:uuid:00000000-0000-4000-8000-0000000src01',
    type: 'ConditionRecord',
    conditionName: 'Synthetic Condition',
    status: 'active',
    dataProvenance: 'EHRVerified',
    schemaVersion: '1.3',
    ...(sourceIdentity === undefined ? {} : { sourceIdentity }),
  };
}

describe('core v3.5: cascade:sourceIdentity registration', () => {
  it('registers the predicate under the core namespace', () => {
    expect(PROPERTY_PREDICATES.sourceIdentity).toBe('cascade:sourceIdentity');
  });

  it('appears in the generated JSON-LD context as a plain term', () => {
    const ctx = (getContext() as { '@context': Record<string, unknown> })['@context'];
    expect(ctx.sourceIdentity).toBe('cascade:sourceIdentity');
  });
});

describe('core v3.5: cascade:sourceIdentity round trip', () => {
  it('serializes as a plain string literal on the record subject', () => {
    const ttl = serialize(condition('org:meridian'));
    expect(ttl).toContain('cascade:sourceIdentity "org:meridian"');
  });

  it('reads back every one of the three value schemes unchanged', () => {
    for (const value of ['org:meridian', 'ns:https://fhir.example.org/r4', 'transport:Synthetic Health export']) {
      const parsed = deserializeOne<Condition>(serialize(condition(value)), 'ConditionRecord');
      expect(parsed?.sourceIdentity).toBe(value);
    }
  });

  it('gives two transports of one organization the same value, which is the point of the axis', () => {
    // A FHIR export identifies its origin by endpoint host and a C-CDA document
    // of the SAME system by custodian organization name. Both normalize to one
    // slug upstream, so both records agree here; a display label would not.
    const fromFhir = deserializeOne<Condition>(serialize(condition('org:meridian')), 'ConditionRecord');
    const fromCcda = deserializeOne<Condition>(serialize(condition('org:meridian')), 'ConditionRecord');
    expect(fromFhir?.sourceIdentity).toBe('org:meridian');
    expect(fromCcda?.sourceIdentity).toBe(fromFhir?.sourceIdentity);
  });

  it('is absent, not empty, on a record that carries no origin', () => {
    const ttl = serialize(condition());
    expect(ttl).not.toContain('cascade:sourceIdentity');
    expect(deserializeOne<Condition>(ttl, 'ConditionRecord')?.sourceIdentity).toBeUndefined();
  });
});

describe('core v3.5: cascade:sourceIdentity is stored, not policed', () => {
  it('reports nothing about a value whose scheme this SDK does not recognize', () => {
    // Deliberate: scheme derivation belongs to the importer that has the source
    // document. Rejecting an unrecognized value here would discard origin
    // information a future producer is entitled to write.
    const result = validate(condition('something-with-no-scheme'));
    const mentions = [...result.errors, ...result.warnings].filter(
      (e) => e.field === 'sourceIdentity',
    );
    expect(mentions).toEqual([]);
  });

  it('does not make a previously valid record invalid', () => {
    expect(validate(condition('org:meridian')).valid).toBe(validate(condition()).valid);
  });
});
