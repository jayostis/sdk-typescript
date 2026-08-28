/**
 * core v3.6 — `cascade:dataAbsentReason`: why a record's primary VALUE is
 * absent, bound to the 15 codes of the HL7 data-absent-reason code system.
 *
 * Every claim here holds regardless of which defects are outstanding. Claims
 * that only hold WHILE a defect exists belong on that issue's work branch,
 * committed red — on a shared branch they would make a green suite mean "the
 * bugs are still present", and they cannot drive a red-green loop because they
 * pass at HEAD:
 *
 *   #2   a record with two reasons writes both, and the shapes then reject it
 *   #3   a record with no value but a stated reason passes validate()
 *   #4   validate() faults an unmapped code and a repeated one
 *
 * Helpers are in `tests/support/rdf.ts`, and they differ on this point.
 * `parseTurtle` takes TEXT, so the `serialize()` call under test stays visible
 * in the graph tests below. `shaclCheck` takes a RECORD and serializes it
 * itself — so the SHACL tests judge freshly serialized output, NOT the
 * fixture's declared `expectedOutput.turtle`, which nothing here reads.
 *
 * @see spec/ontologies/core/v1/core.ttl         cascade:dataAbsentReason
 * @see spec/ontologies/core/v1/core.shapes.ttl  cascade:DataAbsentReasonShape
 */

import { describe, it, expect } from 'vitest';
import { serialize } from '../src/serializer/turtle-serializer.js';
import { cascade, inputOf, parseTurtle, sh, shaclCheck } from './support/rdf.js';

describe('core v3.6: cascade:dataAbsentReason is written onto the record', () => {
  describe('a lab result with no value, stating a ratified reason', () => {
    it('writes the reason as a single literal on the record subject', () => {
      const record = inputOf('absent-001');
      const node = parseTurtle(serialize(record)).namedNode(record.id);

      // One assertion carries both the value and the cardinality the shape
      // constrains. A substring check can carry neither: it cannot count, and
      // it cannot bind a value to this record rather than to the document.
      expect(node.out(cascade.dataAbsentReason).values).toEqual(['not-performed']);
    });
  });

  describe('a lab result whose reason was never mapped from HL7 v3 nullFlavor', () => {
    it('writes the source code verbatim rather than guessing a mapping', () => {
      // "UNK" is a real code, but it belongs to v3-NullFlavor rather than to
      // the value set this property is bound to. An importer is required to map
      // it (UNK -> unknown, per the table on the property in core.ttl). The
      // serializer's job is to write faithfully what it was given; catching the
      // unmapped code is the validator's, and is asserted below.
      const record = inputOf('absent-002');
      const node = parseTurtle(serialize(record)).namedNode(record.id);

      expect(node.out(cascade.dataAbsentReason).values).toEqual(['UNK']);
    });
  });
});

describe('core v3.6: cascade:dataAbsentReason is judged by the ratified shapes', () => {
  it('accepts a record that carries no value and states a ratified reason', async () => {
    // The record the property exists for. cascade:DataAbsentReasonShape targets
    // subjects OF the property, so absence is never itself a finding.
    const report = await shaclCheck(inputOf('absent-001'));

    expect(report.results).toEqual([]);
    expect(report.conforms).toBe(true);
  });

  it('rejects a code outside the 15-member data-absent-reason value set', async () => {
    const report = await shaclCheck(inputOf('absent-002'));
    expect(report.conforms).toBe(false);
    expect(report.results).toHaveLength(1);

    // Assert the RULE, not the message. sh:in on cascade:DataAbsentReasonShape
    // is what fired, declared once in spec with no validation code here. The
    // message is prose spec owns: rewording it must not break this test, and a
    // different constraint that happened to mention the property must not
    // satisfy it.
    // Compared as IRIs rather than as terms: the report's terms and the
    // namespace's are different implementations of the same RDF/JS interface,
    // so toEqual on them compares constructors and fails on identical IRIs.
    const [violation] = report.results;
    expect(violation?.sourceConstraintComponent.value).toBe(sh.InConstraintComponent?.value);
    expect(violation?.path.value).toBe(cascade.dataAbsentReason?.value);
    expect(violation?.value.value).toBe('UNK');
  });
});
