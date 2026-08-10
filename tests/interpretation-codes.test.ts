/**
 * health v2.6 / clinical v1.14: the accepted `interpretation` value set.
 *
 * The set is pinned by a SHA-256 checksum rather than by reading the shape
 * file. This SDK is published standalone and its CI checks out no `spec`
 * sibling, so a test that read the shapes would either fail on every clean
 * machine or skip itself into meaninglessness. The checksum below was computed
 * from the `sh:in` list of `health:interpretation` in
 * `health.shapes.ttl` v1.3 (health v2.6) and is identical to the list on
 * `clinical:interpretation` in `clinical.shapes.ttl` v1.14.
 *
 * The expected digest is written out as a literal here as well as exported from
 * the source module: changing the value list therefore requires editing this
 * file too, which is exactly the review moment a vocabulary change deserves.
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  LAB_INTERPRETATION_VALUES,
  LAB_INTERPRETATION_CHECKSUM,
  OBSERVATION_INTERPRETATION_CODE_COUNT,
} from '../src/models/common.js';
import type { LabInterpretation } from '../src/models/common.js';
import * as entry from '../src/index.js';

/** The canonical form the checksum is computed over: values joined by \n, UTF-8. */
function checksumOf(values: readonly string[]): string {
  return createHash('sha256').update(values.join('\n'), 'utf8').digest('hex');
}

describe('interpretation value set (health v2.6 / clinical v1.14)', () => {
  it('pins the list with a checksum recomputed from the in-code array', () => {
    expect(checksumOf(LAB_INTERPRETATION_VALUES)).toBe(
      '2da0a308329c92456edf7f46d1529c1a2971b79294d0776025328d04773695f2',
    );
  });

  it('exports the same checksum it documents', () => {
    expect(LAB_INTERPRETATION_CHECKSUM).toBe(checksumOf(LAB_INTERPRETATION_VALUES));
  });

  it('carries 60 values: 49 selectable ObservationInterpretation codes + unknown + 10 retained words', () => {
    expect(OBSERVATION_INTERPRETATION_CODE_COUNT).toBe(49);
    expect(LAB_INTERPRETATION_VALUES).toHaveLength(60);
    expect(new Set(LAB_INTERPRETATION_VALUES).size).toBe(60);
  });

  it('preserves the code system order the shape file lists', () => {
    expect(LAB_INTERPRETATION_VALUES[0]).toBe('EX');
    expect(LAB_INTERPRETATION_VALUES[48]).toBe('SYN-S');
    expect(LAB_INTERPRETATION_VALUES[49]).toBe('unknown');
    expect(LAB_INTERPRETATION_VALUES[59]).toBe('Critical');
  });

  it('accepts the result families the previous five-word enum could not express', () => {
    const set = new Set<string>(LAB_INTERPRETATION_VALUES);
    // susceptibility
    for (const code of ['S', 'I', 'R', 'SDD', 'NS', 'VS', 'MS']) expect(set.has(code)).toBe(true);
    // detection
    for (const code of ['POS', 'NEG', 'DET', 'ND', 'IND']) expect(set.has(code)).toBe(true);
    // reactivity
    for (const code of ['RR', 'WR', 'NR']) expect(set.has(code)).toBe(true);
    // change
    for (const code of ['B', 'D', 'U', 'W']) expect(set.has(code)).toBe(true);
    // normality, including the codes an ordinary chemistry panel reports
    for (const code of ['A', 'N', 'AA', 'H', 'L', 'HH', 'LL', 'HU', 'LU']) {
      expect(set.has(code)).toBe(true);
    }
  });

  it('accepts the data-absent-reason code and the retained legacy words', () => {
    const set = new Set<string>(LAB_INTERPRETATION_VALUES);
    expect(set.has('unknown')).toBe(true);
    for (const word of ['normal', 'high', 'low', 'abnormal', 'critical']) {
      expect(set.has(word)).toBe(true);
    }
    for (const word of ['Normal', 'High', 'Low', 'Abnormal', 'Critical']) {
      expect(set.has(word)).toBe(true);
    }
  });

  it('excludes the eight abstract (notSelectable) concepts', () => {
    const set = new Set<string>(LAB_INTERPRETATION_VALUES);
    for (const abstractConcept of [
      '_GeneticObservationInterpretation',
      '_ObservationInterpretationChange',
      '_ObservationInterpretationExceptions',
      '_ObservationInterpretationNormality',
      '_ObservationInterpretationSusceptibility',
      'ObservationInterpretationDetection',
      'ObservationInterpretationExpectation',
      'ReactivityObservationInterpretation',
    ]) {
      expect(set.has(abstractConcept)).toBe(false);
    }
  });

  it('does NOT contain "elevated", which no version of the shapes ever accepted', () => {
    // Pre-existing defect this release corrects: the TypeScript union carried
    // "elevated" (never in any sh:in list) and omitted "high" (in every one).
    expect(new Set<string>(LAB_INTERPRETATION_VALUES).has('elevated')).toBe(false);
    expect(new Set<string>(LAB_INTERPRETATION_VALUES).has('high')).toBe(true);
  });

  it('is reachable from the package entry point, not only the internal module', () => {
    // A value set nobody can import is not a public API. These are runtime
    // exports, so `export type` alone would not carry them.
    expect(entry.LAB_INTERPRETATION_VALUES).toBe(LAB_INTERPRETATION_VALUES);
    expect(entry.LAB_INTERPRETATION_CHECKSUM).toBe(LAB_INTERPRETATION_CHECKSUM);
    expect(entry.OBSERVATION_INTERPRETATION_CODE_COUNT).toBe(OBSERVATION_INTERPRETATION_CODE_COUNT);
    expect(typeof entry.asArray).toBe('function');
  });

  it('derives the LabInterpretation type from the runtime array', () => {
    // If the type and the array could drift, this would be assignable from a
    // string the array does not contain. tsc is the assertion; the runtime
    // check keeps the test honest under vitest, which does not typecheck.
    const accepted: LabInterpretation[] = ['H', 'POS', 'unknown', 'Critical'];
    for (const value of accepted) {
      expect(new Set<string>(LAB_INTERPRETATION_VALUES).has(value)).toBe(true);
    }
  });
});
