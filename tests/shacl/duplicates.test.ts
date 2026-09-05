/**
 * A triple stated twice is one triple.
 *
 * An RDF graph is a SET. `rdf-validate-shacl` judges a dataset and sees one
 * value node where the Turtle repeats a statement; an engine that counted the
 * quads it was handed saw two, tripped `sh:maxCount 1` and reported a
 * per-value result twice. Reachable from a pod: `deserialize()` of Turtle
 * carrying `health:vaccineName "MMR", "MMR"` hands back `['MMR', 'MMR']`, and
 * the routed writer writes both. The module header says a disagreement on a
 * claimed component is a finding to record — this is it, recorded.
 */

import { describe, it, expect } from 'vitest';

import { engineOver, oracleOver, oracleTuplesOf, tuplesOf, SH } from './harness.js';

const shape = (constraint: string): string =>
  `ex:S a sh:NodeShape ; sh:targetClass ex:Thing ; sh:property [ sh:path ex:p ; ${constraint} ] .`;

describe('evaluate', () => {
  describe('the same triple stated twice', () => {
    it('is one value under sh:maxCount, as the oracle counts it', async () => {
      const data = 'ex:s a ex:Thing ; ex:p "MMR", "MMR" .';
      const report = engineOver(shape('sh:maxCount 1'), data);
      const oracle = await oracleOver(shape('sh:maxCount 1'), data);

      expect(oracle.conforms, 'the oracle holds the two as one').toBe(true);
      expect(report.results).toEqual([]);
      expect(report.evaluated).toBeGreaterThan(0);
      expect(report.conforms).toBe(true);
    });

    it('earns one per-value result, not one per statement', async () => {
      const data = 'ex:s a ex:Thing ; ex:p "", "" .';
      const report = engineOver(shape('sh:minLength 1'), data);

      expect(report.results.map((r) => r.sourceConstraintComponent)).toEqual([`${SH}MinLengthConstraintComponent`]);
      expect(tuplesOf(report)).toEqual(oracleTuplesOf(await oracleOver(shape('sh:minLength 1'), data)));
    });

    it('is still two values when the two differ only in datatype', () => {
      // The set is of TERMS: `"1"` and `"1"^^xsd:integer` are different
      // triples, and a dedupe keyed on the lexical form alone would fold them.
      const data = 'ex:s a ex:Thing ; ex:p "1", "1"^^xsd:integer .';
      const report = engineOver(shape('sh:maxCount 1'), data);

      expect(report.results.map((r) => r.sourceConstraintComponent)).toEqual([`${SH}MaxCountConstraintComponent`]);
    });
  });
});
