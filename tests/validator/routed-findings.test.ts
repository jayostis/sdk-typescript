/**
 * `routedFindings` over a hand-written index: the findings the shipped index
 * cannot be made to produce.
 *
 * Every shape spec publishes for `health:ImmunizationRecord` is evaluated in
 * full, so through `validate()` the refusal findings and the "nothing
 * selected" finding are unreachable, and a message the shape wrote twice does
 * not occur. A detector is proven by making it speak (`tests/README.md`), so
 * each case hands the routed path an index that MUST make it.
 *
 * The record is imm-001 unchanged throughout: every difference between cases
 * is in the shapes, never in the data.
 */

import { describe, it, expect } from 'vitest';

import { recordTypeFor } from '../../src/record-types/index.js';
import type { RecordType } from '../../src/record-types/index.js';
import { routedFindings } from '../../src/validator/routed.js';
import { shapesOf, SH } from '../shacl/harness.js';
import { loadCascadeRecordFixture } from '../support/fixtures.js';

const imm001 = loadCascadeRecordFixture('imm-001').input as unknown as Record<string, unknown>;
const immunization = recordTypeFor('ImmunizationRecord') as RecordType;

const findings = (shapes: string) => routedFindings(imm001, immunization, shapesOf(shapes));

describe('routedFindings', () => {
  describe('a shape that selected the record and had every parameter refused', () => {
    // `sh:class` is not implemented, so the shape evaluates nothing — and
    // `evaluated === 0` is then NOT "no shape selected". A finding saying so
    // would send the reader after a missing shape when the shape is there and
    // the engine is what fell short.
    const shape = 'health:S a sh:NodeShape ; sh:targetClass health:ImmunizationRecord ; '
      + 'sh:property [ sh:path health:vaccineName ; sh:class health:Kind ] .';

    it('reports the refused parameter, and does not claim no shape selected the record', () => {
      const found = findings(shape);

      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ field: 'type', severity: 'error' });
      expect(found[0]?.message).toContain(`${SH}class`);
      expect(found.map((f) => f.message).join('\n')).not.toMatch(/No shape/);
    });
  });

  describe('an index in which no shape targets the record\'s class', () => {
    const shape = 'ex:S a sh:NodeShape ; sh:targetClass ex:Other ; sh:property [ sh:path ex:p ; sh:minCount 1 ] .';

    it('says so, as an error on type', () => {
      const found = findings(shape);

      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ field: 'type', severity: 'error' });
      expect(found[0]?.message).toMatch(/^No shape spec publishes selected /);
    });
  });

  describe('a shape that selected the record and declares no constraint at all', () => {
    // Selected, nothing refused, nothing evaluated. Still a refusal — a verdict
    // with nothing evaluated is never a pass — but not the "no shape" one.
    const shape = 'health:S a sh:NodeShape ; sh:targetClass health:ImmunizationRecord .';

    it('is an error that says nothing was evaluated, not that nothing was selected', () => {
      const found = findings(shape);

      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ field: 'type', severity: 'error' });
      expect(found[0]?.message).not.toMatch(/No shape/);
      expect(found[0]?.message).toMatch(/nothing was evaluated/);
    });
  });

  describe('a property shape carrying two sh:message values', () => {
    // Six clinical shapes do this at the pin (`clinical.shapes.ttl`, the
    // encounterDate / documentDate properties). SHACL permits it and the
    // oracle returns both; a result that kept neither printed "the shape
    // declares no sh:message", which was false.
    const shape = 'health:S a sh:NodeShape ; sh:targetClass health:ImmunizationRecord ; '
      + 'sh:property [ sh:path health:vaccineName ; sh:minCount 2 ; '
      + 'sh:message "First message."@en ; sh:message "Second message."@en ] .';

    it('carries both messages, in the order the shape declares them', () => {
      const found = findings(shape);

      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ field: 'vaccineName', severity: 'error' });
      expect(found[0]?.message).toBe('First message. Second message.');
    });
  });
});
