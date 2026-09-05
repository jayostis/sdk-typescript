/**
 * The engine and `rdf-validate-shacl` agree on the imm family and on
 * authored negatives, over one data graph each.
 *
 * ONE GRAPH, TWO JUDGES. Both are handed the quads `convertToRdf` writes for
 * the record, so a disagreement is about judgement and never about writing.
 * Compared as `conforms` and the SORTED SET of
 * `(focusNode, path, sourceConstraintComponent)` tuples — sets, not counts,
 * because two reports of equal length can name different constraints.
 *
 * VACUITY GUARD. Every graph has more than five quads and the engine reports
 * `evaluated > 0`. Two judges agreeing that an empty graph conforms is not
 * agreement.
 *
 * The six authored cases are the ones the Problem names: each is rejected by
 * the oracle, asserted here so the case is a real negative and not a record
 * both judges wave through.
 */

import { describe, it, expect } from 'vitest';

import { convertToRdf } from '../../src/converter/to-rdf.js';
import { quadsFromTurtle } from '../support/graph.js';
import { loadCascadeRecordFixture } from '../support/fixtures.js';
import { engineOverSpec, oracleOverSpec, oracleTuplesOf, tuplesOf } from './harness.js';

const imm001 = loadCascadeRecordFixture('imm-001').input as unknown as Record<string, unknown>;

/** imm-001 with one thing wrong. */
const authored = (overrides: Record<string, unknown>): Record<string, unknown> => ({ ...imm001, ...overrides });

const FIXTURES = ['imm-001', 'imm-002', 'imm-003'] as const;

const NEGATIVES: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
  ['an unlisted status', authored({ status: 'pending' })],
  ['schemaVersion: "abc"', authored({ schemaVersion: 'abc' })],
  ['two lotNumber values', authored({ lotNumber: ['FN2487', 'FN2488'] })],
  ['a plain-string administrationDate', authored({ administrationDate: 'yesterday' })],
  ['an empty vaccineName', authored({ vaccineName: '' })],
  ['vaccineName: 42', authored({ vaccineName: 42 })],
];

const graphOf = (record: Record<string, unknown>) => quadsFromTurtle(convertToRdf(record));

describe('evaluate', () => {
  describe.each(FIXTURES)('agrees with the oracle on %s', (id) => {
    const record = loadCascadeRecordFixture(id).input as unknown as Record<string, unknown>;

    it('on conforms and on the set of violations', async () => {
      const quads = graphOf(record);
      const engine = engineOverSpec(quads);
      const oracle = await oracleOverSpec(quads);

      expect(quads.length).toBeGreaterThan(5);
      expect(engine.evaluated).toBeGreaterThan(0);
      expect(engine.unevaluated).toEqual([]);
      expect(engine.conforms).toBe(oracle.conforms);
      expect(tuplesOf(engine)).toEqual(oracleTuplesOf(oracle));
    });
  });

  describe.each(NEGATIVES)('agrees with the oracle on imm-001 with %s', (_, record) => {
    it('that it is rejected, and on which constraint', async () => {
      const quads = graphOf(record);
      const engine = engineOverSpec(quads);
      const oracle = await oracleOverSpec(quads);

      expect(oracle.conforms, 'the authored case is not a negative').toBe(false);
      expect(quads.length).toBeGreaterThan(5);
      expect(engine.evaluated).toBeGreaterThan(0);
      expect(engine.unevaluated).toEqual([]);
      expect(engine.conforms).toBe(false);
      expect(tuplesOf(engine)).toEqual(oracleTuplesOf(oracle));
    });
  });
});
