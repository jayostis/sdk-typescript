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
 * @see spec/ontologies/core/v1/core.ttl  cascade:RecordSummary
 */

import { defineTerm, requirePredicate } from './term.js';

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
    children: {
      domain: { form: 'literal' },
      conditionCount: count,
      medicationCount: count,
      allergyCount: count,
      labResultCount: count,
      immunizationCount: count,
      vitalSignDays: count,
      coverageCount: count,
    },
  },
});
