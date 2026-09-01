/**
 * core v3.4 — `cascade:clinicalSummary`: an export manifest's per-domain record
 * counts, written inline as a `cascade:RecordSummary` blank node.
 *
 * SPIKE. Termed to answer one question the three patient-profile structures
 * could not: whether a declared child reproduces `serializeBlankNode`'s
 * DATATYPED output. Its children are integers, theirs were all strings.
 *
 * `{ form: 'literal', datatype: 'xsd:integer' }` rather than `{ form: 'number' }`
 * on every count. The two are different bytes for the same triple — `number`
 * writes a bare `5`, which RDF 1.1 types as `xsd:integer` all the same — and
 * `pod-002` is `validationMode: exact-match`, asserted byte-for-byte at
 * `tests/export-manifest.test.ts:47`, where it expects `"5"^^xsd:integer`.
 * That is what `serializeBlankNode` writes, routing an `INTEGER_FIELDS` child
 * through `b.integer`; the untyped term path's `nestedOutputs` dispatches on the
 * runtime type and would write the bare form. Declaring the child is what closes
 * that gap, and it is the whole reason a child carries a rule rather than just a
 * name.
 *
 * `RecordSummary`'s WHOLE surface and not a subset of it, which is two counts
 * and not one: the thirteen the class declares itself, and the six it reaches
 * through `CascadeEntity`. Declaring `children` made the term authoritative,
 * and a short map is wrong in both directions at once — the thirteen were the
 * writer's silence (a manifest read in with `sleepDays` and re-serialized lost
 * it, with nothing reported), the six are `validate()`'s false rejection of
 * registered vocabulary the model declares. The count is the claim, and
 * `tests/terms/clinical-summary.test.ts` asserts the predicate list rather than
 * any one field.
 *
 * `tests/terms/children-complete.test.ts` cannot catch the inherited half: it
 * walks `cascade:RecordSummaryShape`'s `sh:path` set, and the shape declares
 * none of the six. Shape-ahead-of-term is the direction that file guards;
 * model-ahead-of-term is this one, and the test beside it is what holds it.
 *
 * @see spec/ontologies/core/v1/core.ttl  cascade:RecordSummary
 */

import { defineTerm } from './term.js';
import { requirePredicate } from './predicate.js';

/** `sh:minCount 1` on `cascade:RecordSummaryShape`; the counts are optional. */
const count = { form: 'literal', datatype: 'xsd:integer' } as const;

export const clinicalSummary = defineTerm({
  key: 'clinicalSummary',
  predicate: requirePredicate('clinicalSummary'),
  // cascade:ExportManifestShape
  maxCount: 1,
  rule: {
    form: 'blankNode',
    rdfType: 'cascade:RecordSummary',
    // The flat form, which this field has always had: `ExportManifest` types
    // `clinicalSummary` as a `string` documented "IRI of the RecordSummary",
    // and `URI_FIELDS` wrote it as `cascade:clinicalSummary <urn:uuid:...>`.
    // Without this the node rule turns a type-correct call into an error, and
    // `wellnessSummary` beside it — typed identically and not yet termed —
    // goes on accepting the same input.
    scalarRule: { form: 'iri' },
    children: {
      domain: { form: 'literal' },
      conditionCount: count,
      medicationCount: count,
      allergyCount: count,
      labResultCount: count,
      immunizationCount: count,
      coverageCount: count,
      supplementCount: count,
      // The DAY counts. `cascade:RecordSummaryShape` bounds each above as well
      // as below — "a days-covered figure larger than a decade of daily
      // readings is a unit error, not a long history" — so they are as much
      // declared vocabulary as the counts above, and `RecordSummary` declares
      // all five on the model.
      vitalSignDays: count,
      heartRateDays: count,
      bloodPressureDays: count,
      activityDays: count,
      sleepDays: count,

      // `cascade:RecordSummaryShape` declares this beside the counts
      // (core.shapes.ttl:1085, `sh:maxCount 1`), and `RecordSummary` reaches it
      // through `CascadeEntity`, so a caller building a summary off the model
      // has it to hand. Undeclared it was dropped: a legal value, set by the
      // caller, gone with no error.
      //
      // `prefixedEnum` rather than `literal`, which is the form the TOP-LEVEL
      // writer uses for this same field (`turtle-serializer.ts:578`,
      // `sub.uri(pred, 'cascade:' + value)`). The shape constrains neither — no
      // `sh:in`, no `sh:datatype`, no `sh:nodeKind` — so both conform and the
      // tie is broken on consistency: one document carrying provenance as an
      // IRI at the top and a quoted string inside a blank node is a reader's
      // problem that no validator would report. The pre-term nested path wrote
      // the literal, so this is a change of form, not only of presence.
      dataProvenance: { form: 'prefixedEnum', prefix: 'cascade' },

      // THE INHERITED HALF. `RecordSummary extends CascadeEntity`, so a caller
      // building a summary off the model has these six to hand exactly as they
      // have `dataProvenance` above, and every one was reported by `validate()`
      // as carrying "a nested X, which no vocabulary declares" — of
      // `cascade:schemaVersion`, which is registered vocabulary the model
      // declares the field for. That is the false rejection this file's own
      // comment on `children` warns a short map produces, and it arrived the
      // moment the map was made authoritative.
      //
      // `id` and `type` are not here: `NESTED_SKIP` drops both before any rule
      // is consulted, because a blank node has no subject IRI to carry and its
      // class is written by `rdfType`.
      schemaVersion: { form: 'literal' },
      sourceIdentity: { form: 'literal' },

      // `health:sourceRecordId` and `clinical:businessIdentifier` — the two
      // that do NOT take this node's `cascade:` prefix. Both are registered
      // under another namespace and nothing re-prefixes them per type, so the
      // node prefix wrote `cascade:sourceRecordId` for a value the top level of
      // the same document writes `health:sourceRecordId`. One field, two
      // spellings, and only one of them declared anywhere.
      sourceRecordId: { form: 'literal', predicate: 'health:sourceRecordId' },
      businessIdentifier: { form: 'literal', predicate: 'clinical:businessIdentifier' },

      // `cascade:notes` and NOT `health:notes`, which is what `notes` is
      // registered as. The serializer's `TYPE_PREDICATE_OVERRIDES` already
      // declares that fork for `RecordSummary`, so the node prefix is right
      // here and a `predicate` naming the registered spelling would be the
      // wrong triple — the reason these are declared per child rather than
      // looked up by key.
      notes: { form: 'literal' },

      // `iri`, matching the top level: `hasAttachment` is in `URI_FIELDS` and
      // `IRI_ARRAY_FIELDS`, and `cascade:HasAttachmentEdgeShape` declares
      // `sh:nodeKind sh:IRI` so a record and its attachment can live in
      // different files. A quoted literal here is a different node kind for the
      // same edge.
      hasAttachment: { form: 'iri' },
    },
  },
});
