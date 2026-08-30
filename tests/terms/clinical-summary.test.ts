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
import { requirePredicate } from '../../src/terms/term.js';

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

  it('drops a child the term does not declare', () => {
    // `cascade:RecordSummaryShape` gives this node a fixed set of counts. A key
    // outside it is a spelling nothing in spec declares, and `childrenOf` would
    // have written it back out of the writer under no domain and no shape.
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
        children: [{ kind: 'literal', predicate: 'cascade:domain', value: 'clinical' }],
      },
    ]);
  });

  it('writes nothing for a manifest carrying no clinical summary', () => {
    expect(termFor('clinicalSummary')?.outputsFor(MANIFEST)).toEqual([]);
  });
});
