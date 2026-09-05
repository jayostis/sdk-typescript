/**
 * `validate()` on a record type routed for `'validate'` judges from the shapes
 * spec publishes.
 *
 * `health:ImmunizationRecord` is the one type on the migration allow-list, and
 * this is the shipped judge on it: `validate()` in, a verdict out, with `field`
 * naming the JSON key and `message` equal to the shape's own `sh:message`, read
 * off the shapes graph at test time rather than retyped here.
 *
 * WHAT THIS IS THE FIRST EVIDENCE FOR. #53 (`schemaVersion` outside
 * `sh:pattern` accepted) and #57 (a mistyped `vaccineName` accepted) were
 * closed as superseded by #79, the SHACL engine, and neither has been shown
 * fixed on any routed type until now. The three cases below are their
 * instances, plus the one #99's typed writer exposed: an `administrationDate`
 * no `xsd:dateTime` lexical form admits.
 *
 * WHAT MOVED HERE FROM THE LEGACY TABLES. `tests/rules/min-length.test.ts` and
 * `tests/rules/required-field-arity.test.ts` each carried an
 * `ImmunizationRecord` row asserting the legacy chain's message text. The
 * legacy chain no longer judges this type, so those rows' equivalents live
 * here, asserting the shape's message instead.
 *
 * EXACT ERROR LISTS. A routed type gets the engine's answer and nothing else
 * — the fork in `validate()` is a replacement, not a supplement — so every
 * case asserts the whole `errors` array. A legacy finding riding along would
 * be a second judge nobody asked.
 */

import { describe, it, expect } from 'vitest';

import { validate } from '../../src/validator/validator.js';
import type { CascadeRecord } from '../../src/models/common.js';
import { declaredProperty } from '../support/declared.js';
import { loadCascadeRecordFixture } from '../support/fixtures.js';

const CASCADE = 'https://ns.cascadeprotocol.org/core/v1#';
const HEALTH = 'https://ns.cascadeprotocol.org/health/v1#';
const SHAPE = `${HEALTH}ImmunizationRecordShape`;

// Written out rather than read off a predicate table, so a re-namespaced
// predicate is a failure here and not something the test agrees with.
const schemaVersion = `${CASCADE}schemaVersion`;
const administrationDate = `${HEALTH}administrationDate`;
const vaccineName = `${HEALTH}vaccineName`;
const lotNumber = `${HEALTH}lotNumber`;
const status = `${HEALTH}status`;

const imm001 = loadCascadeRecordFixture('imm-001').input;

/** imm-001 with some fields changed, or removed where the override is `undefined`. */
function immunization(overrides: Record<string, unknown>): CascadeRecord {
  const record: Record<string, unknown> = { ...imm001 };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete record[key];
    else record[key] = value;
  }
  return record as unknown as CascadeRecord;
}

/** The one error the shape's message for `path` predicts on `field`. */
const only = (field: string, path: string) => [{
  field,
  message: declaredProperty(SHAPE, path).message,
  severity: 'error',
}];

describe('validate() on a routed ImmunizationRecord', () => {
  it('accepts imm-001 unchanged', () => {
    const result = validate(imm001);

    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  describe('the instances of #53, #57 and the typed writer', () => {
    it('rejects schemaVersion "abc" on the shape\'s pattern, with its message', () => {
      const result = validate(immunization({ schemaVersion: 'abc' }));

      expect(result.errors).toEqual(only('schemaVersion', schemaVersion));
      expect(result.valid).toBe(false);
    });

    it('rejects administrationDate "yesterday", with its message', () => {
      const result = validate(immunization({ administrationDate: 'yesterday' }));

      expect(result.errors).toEqual(only('administrationDate', administrationDate));
      expect(result.valid).toBe(false);
    });

    it('rejects vaccineName 42 on the shape\'s datatype, with its message', () => {
      const result = validate(immunization({ vaccineName: 42 }));

      expect(result.errors).toEqual(only('vaccineName', vaccineName));
      expect(result.valid).toBe(false);
    });
  });

  describe('the rows that left the legacy tables', () => {
    it('rejects an empty vaccineName', () => {
      const result = validate(immunization({ vaccineName: '' }));

      expect(result.errors).toEqual(only('vaccineName', vaccineName));
    });

    it('accepts a blank vaccineName, because sh:minLength counts characters', () => {
      // The contestable half of min-length, carried over intact: SHACL
      // measures the value converted to string and never trims, and the
      // oracle accepts this. Trimming would put the shipped judge ahead of the
      // shapes, which the fixture contract asserts it never is.
      const result = validate(immunization({ vaccineName: '  ' }));

      expect(result.errors).toEqual([]);
    });

    it('rejects two vaccineName values as two values, with the shape\'s message', () => {
      const result = validate(immunization({ vaccineName: ['first', 'second'] }));

      expect(result.errors).toEqual(only('vaccineName', vaccineName));
    });

    it('rejects an absent vaccineName, with the shape\'s message', () => {
      const result = validate(immunization({ vaccineName: undefined }));

      expect(result.errors).toEqual(only('vaccineName', vaccineName));
    });

    it('rejects two lotNumber values, with the shape\'s message', () => {
      const result = validate(immunization({ lotNumber: ['FN2487', 'FN2488'] }));

      expect(result.errors).toEqual(only('lotNumber', lotNumber));
    });

    it('rejects an unlisted status, with the shape\'s message', () => {
      const result = validate(immunization({ status: 'pending' }));

      expect(result.errors).toEqual(only('status', status));
    });
  });
});
