/**
 * The `clinicalSummary` term: `cascade:clinicalSummary`, core v3.4.
 *
 * Pure. No serializer, no fixture loader, no RDF library.
 *
 * The claim is that a DECLARED CHILD CARRIES A RULE, not just a name. Its
 * children are integers where the three patient-profile structures are all
 * strings, and that difference is the one that had teeth: `serializeBlankNode`
 * routes a child in `INTEGER_FIELDS` through `b.integer` and writes
 * `"5"^^xsd:integer`, while an undeclared child dispatches on the runtime type
 * and writes a bare `5`. Same RDF triple, different bytes — and `pod-002` is
 * `validationMode: exact-match`, asserted byte-for-byte at
 * `tests/export-manifest.test.ts:47`.
 *
 * That fixture is what proves the end of it. This file pins the term's own
 * output, so a failure here says the rule changed rather than that some
 * serializer branch did.
 *
 * @see spec/ontologies/core/v1/core.ttl  cascade:RecordSummary
 */

import { describe, it, expect } from 'vitest';

import { termFor } from '../../src/terms/index.js';
import { requirePredicate } from '../../src/terms/index.js';
import { validate } from '../../src/validator/index.js';

const MANIFEST = { id: 'urn:uuid:pod002-aaaa-bbbb-cccc-ddddeeeeffff', type: 'ExportManifest' };

describe('clinicalSummary', () => {
  it('references the registered predicate rather than declaring one', () => {
    expect(termFor('clinicalSummary')?.predicate).toBe('cascade:clinicalSummary');
    expect(requirePredicate('clinicalSummary')).toBe('cascade:clinicalSummary');
  });

  it('writes an integer child as a TYPED literal, not a bare token', () => {
    // The whole reason a child carries a rule. `datatype: 'xsd:integer'` on the
    // child is what reproduces what `serializeBlankNode` already wrote; without
    // it the output would be `{ kind: 'number', value: 5 }`, which the builder
    // writes as a bare `5` and which `pod-002` does not expect.
    expect(
      termFor('clinicalSummary')?.outputsFor({
        ...MANIFEST,
        clinicalSummary: { domain: 'clinical', conditionCount: 5 },
      }),
    ).toEqual([
      {
        kind: 'blankNode',
        predicate: 'cascade:clinicalSummary',
        rdfType: 'cascade:RecordSummary',
        children: [
          { kind: 'literal', predicate: 'cascade:domain', value: 'clinical' },
          {
            kind: 'literal',
            predicate: 'cascade:conditionCount',
            value: '5',
            datatype: 'xsd:integer',
          },
        ],
      },
    ]);
  });

  it('writes every count `RecordSummary` declares, not the subset it started with', () => {
    // A blank node's children used to be DERIVED from the object handed in, so
    // an undeclared key was written anyway. Declaring them made the term
    // authoritative — and the guard that drops an undeclared key drops a
    // MISSING one just as quietly. `supplementCount`, `heartRateDays`,
    // `bloodPressureDays`, `activityDays` and `sleepDays` are declared on
    // `RecordSummary` (`src/models/export-manifest.ts`), registered in
    // `PROPERTY_PREDICATES`, and carry an `sh:property` on
    // `cascade:RecordSummaryShape` — so a manifest read in with `sleepDays` and
    // re-serialized lost it, with nothing reported.
    //
    // Asserted as the PREDICATE LIST rather than as five absences: the claim is
    // the count, and a term that declared the five while losing one of the
    // eight would pass a per-field assertion.
    const summary = {
      domain: 'clinical',
      conditionCount: 5,
      medicationCount: 4,
      allergyCount: 3,
      labResultCount: 2,
      immunizationCount: 1,
      coverageCount: 1,
      supplementCount: 2,
      vitalSignDays: 90,
      heartRateDays: 7,
      bloodPressureDays: 14,
      activityDays: 21,
      sleepDays: 30,
    };

    const outputs = termFor('clinicalSummary')?.outputsFor({
      ...MANIFEST,
      clinicalSummary: summary,
    });
    const node = outputs?.[0] as { children: { predicate: string }[] };

    expect(node.children.map((child) => child.predicate)).toEqual(
      Object.keys(summary).map((key) => `cascade:${key}`),
    );
  });

  it('writes the flat IRI form the model declares as a resource reference', () => {
    // `ExportManifest.clinicalSummary` is typed `string`, documented as "IRI of
    // the RecordSummary", and listed in the serializer's `URI_FIELDS` — so
    // `cascade:clinicalSummary <urn:uuid:...>` is what a type-correct caller has
    // always got. The blank-node rule must not turn that into a throw: the model
    // is a shipped contract, and `wellnessSummary` beside it still takes the
    // flat form, so the two would otherwise behave oppositely on the same input.
    expect(
      termFor('clinicalSummary')?.outputsFor({
        ...MANIFEST,
        clinicalSummary: 'urn:uuid:8f14e45f-ceea-467a-9a1e-1f2b3c4d5e6f',
      }),
    ).toEqual([
      {
        kind: 'uri',
        predicate: 'cascade:clinicalSummary',
        value: 'urn:uuid:8f14e45f-ceea-467a-9a1e-1f2b3c4d5e6f',
      },
    ]);
  });

  it('writes a child the term does not declare, leaving that to the validator', () => {
    // `cascade:RecordSummaryShape` gives this node a fixed set of counts, and
    // `wardCount` is a spelling nothing in spec declares. It is WRITTEN anyway,
    // by runtime type, and `validate()` reports it: a writer that dropped it
    // would hand the validator a summary with nothing left to violate and earn
    // a clean verdict on data the caller did not get.
    //
    // The bare `3` is the point of the declared/undeclared split, not an
    // oversight. A declared count carries `xsd:integer` because its rule says
    // so; an undeclared key has no rule, so `nestedOutputs` dispatches on the
    // runtime type and writes the bare token — which is what makes the two
    // distinguishable in the graph as well as in the verdict.
    //
    // @see tests/rules/undeclared-child.test.ts  the refusal this leaves to
    expect(
      termFor('clinicalSummary')?.outputsFor({
        ...MANIFEST,
        clinicalSummary: { domain: 'clinical', wardCount: 3 },
      }),
    ).toEqual([
      {
        kind: 'blankNode',
        predicate: 'cascade:clinicalSummary',
        rdfType: 'cascade:RecordSummary',
        children: [
          { kind: 'literal', predicate: 'cascade:domain', value: 'clinical' },
          { kind: 'number', predicate: 'cascade:wardCount', value: 3 },
        ],
      },
    ]);
  });

  it('writes nothing for a manifest carrying no clinical summary', () => {
    expect(termFor('clinicalSummary')?.outputsFor(MANIFEST)).toEqual([]);
  });
});

/**
 * The half of `RecordSummary`'s surface that comes from `CascadeEntity`.
 *
 * `tests/terms/children-complete.test.ts` cannot reach these. It walks
 * `cascade:RecordSummaryShape`'s `sh:path` set, and the shape declares none of
 * the six — the term was short of its MODEL, not of its shape, and the two are
 * different obligations. A caller builds a summary off the TypeScript
 * interface, so what the interface offers is what the term has to answer for.
 *
 * Every one of these was reported by `validate()` as "a nested X, which no
 * vocabulary declares" — of `cascade:schemaVersion`, which is registered
 * vocabulary. The false rejection the `children` comment in
 * `src/terms/clinical-summary.ts` warns a short map produces, arrived.
 */
describe('clinicalSummary — the children RecordSummary inherits', () => {
  /** Every `CascadeEntity` field a nested summary can carry, and its predicate. */
  const INHERITED: ReadonlyArray<readonly [string, unknown, string]> = [
    ['schemaVersion', '3.4', 'cascade:schemaVersion'],
    ['sourceIdentity', 'org:meridian', 'cascade:sourceIdentity'],
    // NOT `cascade:`. Registered under another namespace, re-prefixed nowhere
    // per type, and written under the node prefix until the child declared one.
    ['sourceRecordId', 'MRN-88213', 'health:sourceRecordId'],
    ['businessIdentifier', 'ACC-4471', 'clinical:businessIdentifier'],
    // `cascade:notes`, though `notes` is REGISTERED `health:notes`: the
    // serializer's `TYPE_PREDICATE_OVERRIDES` forks it for RecordSummary. The
    // case that makes a child predicate a declaration rather than a lookup.
    ['notes', 'Partial export', 'cascade:notes'],
    ['hasAttachment', 'urn:uuid:att-0001', 'cascade:hasAttachment'],
  ];

  it.each(INHERITED)('declares %s, so validate() does not refuse it', (child) => {
    const result = validate({
      id: 'urn:uuid:manifest-0001-aaaa-bbbb-ccccddddeeee',
      type: 'ExportManifest',
      title: 'Cascade export',
      created: '2026-08-29T00:00:00Z',
      schemaVersion: '3.4',
      clinicalSummary: {
        type: 'RecordSummary',
        domain: 'clinical',
        [child]: INHERITED.find(([k]) => k === child)?.[1],
      },
    } as never);

    expect(
      result.errors.map((e) => e.field),
      `a summary may carry ${child}: RecordSummary extends CascadeEntity, the model declares it, ` +
        'and the vocabulary registers a predicate for it',
    ).not.toContain(`clinicalSummary.${child}`);
  });

  it.each(INHERITED)('writes %s under the predicate the vocabulary registers', (child, value, predicate) => {
    const outputs = termFor('clinicalSummary')?.outputsFor({
      ...MANIFEST,
      clinicalSummary: { domain: 'clinical', [child]: value },
    }) as ReadonlyArray<{ children: ReadonlyArray<{ predicate: string }> }>;

    expect(
      outputs[0].children.map((c) => c.predicate),
      `${child} inside the node and ${child} at the top level are ONE field: the node's ` +
        'cascade: prefix wrote a predicate no ontology declares beside a top level spelling ' +
        'the same value correctly',
    ).toEqual(['cascade:domain', predicate]);
  });

  it('declares the whole model surface, so a new inherited field is caught here', () => {
    // The count is the claim, exactly as it is for the thirteen. `id` and
    // `type` are absent because `NESTED_SKIP` drops both before any rule is
    // consulted: a blank node has no subject IRI and its class is `rdfType`.
    const declared = Object.keys(termFor('clinicalSummary')?.rule.children ?? {});

    expect(INHERITED.map(([k]) => k).filter((k) => !declared.includes(k))).toEqual([]);
    expect(declared).toHaveLength(14 + INHERITED.length);
  });
});
