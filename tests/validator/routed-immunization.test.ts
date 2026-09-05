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

    it('reports two vaccineName values and an absent one as the same finding, on purpose', () => {
      // The legacy row asserted the two were DIFFERENT findings — "carries 2
      // values" against "must be present". The shape writes one `sh:message`
      // for its `sh:minCount` and its `sh:maxCount` alike ("exactly one
      // non-empty vaccineName"), and `ValidationError` carries no component
      // (#74: the result does not change shape), so the two cases are
      // indistinguishable through `validate()`. That is the shape's own
      // wording, accurate for both, and not a verdict the judge got wrong.
      const two = validate(immunization({ vaccineName: ['first', 'second'] }));
      const none = validate(immunization({ vaccineName: undefined }));

      expect(two.errors).toEqual(none.errors);
      expect(two.errors).toHaveLength(1);
    });
  });

  describe('the values the range declares and the shape lists', () => {
    // `cascade:DataProvenance` declares its permitted values as subclasses at
    // two depths: `EHRVerified` is under `ClinicalGenerated`, `SelfReported`
    // and `DeviceGenerated` under `ConsumerGenerated`. The shape's `sh:in`
    // names four of the grandchildren, and the writer refused every one of
    // them as "not a member" — which, on the judge's path, was a throw out of
    // `validate()` for a value the shape permits.
    it.each(['EHRVerified', 'DeviceGenerated', 'SelfReported', 'AIExtracted'])(
      'accepts dataProvenance %s, which the shape\'s sh:in lists',
      (provenance) => {
        const result = validate(immunization({ dataProvenance: provenance }));

        expect(result.errors).toEqual([]);
        expect(result.valid).toBe(true);
      },
    );

    it('rejects a member of the range the shape\'s sh:in omits, as a finding and not a throw', () => {
      // `ScannedDocument` is a subclass of `ClinicalGenerated` in the ontology
      // and absent from the shape's list. Faithful first: the writer writes
      // it, and the judge — not the writer — says it is not permitted.
      const result = validate(immunization({ dataProvenance: 'ScannedDocument' }));

      expect(result.errors).toEqual(only('dataProvenance', `${CASCADE}dataProvenance`));
      expect(result.valid).toBe(false);
    });

    it('still throws on a value that is no member of the range and no IRI', () => {
      // Inexpressibility, not invalidity: the writer's refusal, which #98
      // leaves on the judge's path and #80 owns the question of catching.
      expect(() => validate(immunization({ dataProvenance: 'Bogus' })))
        .toThrow(/Cannot express "dataProvenance"/);
    });
  });

  describe('a value written twice', () => {
    it('accepts the same vaccineName given twice, because two identical triples are one', () => {
      // An RDF graph is a SET of triples. `deserialize()` of Turtle carrying
      // `health:vaccineName "MMR", "MMR"` hands back `['MMR', 'MMR']`, and a
      // judge that counted the array's length would reject on `sh:maxCount 1`
      // a document every RDF store holds as one triple — and that the oracle
      // accepts.
      const result = validate(immunization({ vaccineName: ['MMR', 'MMR'] }));

      expect(result.errors).toEqual([]);
      expect(result.valid).toBe(true);
    });
  });

  describe('a result on a property shape that declares no sh:message', () => {
    it('names the parameter the shape did not write a message for', () => {
      // `vaccineCode` carries `sh:maxCount 1` and no `sh:message`, the one
      // property on this shape that reaches the fallback wording.
      const result = validate(immunization({ vaccineCode: ['CVX-1', 'CVX-2'] }));

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({ field: 'vaccineCode', severity: 'error' });
      expect(result.errors[0]?.message).toMatch(/^sh:maxCount on /);
      expect(result.errors[0]?.message).toMatch(/declares no sh:message/);
    });
  });

  describe('the warnings channel', () => {
    it('carries only what the shapes grade sh:Warning, never the legacy SDK-policy warnings', () => {
      // A routed type gets the shipped shapes' answer and nothing else — the
      // seam is a replacement, not a supplement. The legacy chain warned on a
      // `schemaVersion` behind the current one and on a missing coding; both
      // are SDK policy transcribed by hand, which is the thing #69 replaces
      // with what spec publishes. `health:ImmunizationRecordShape` grades
      // every constraint `sh:Violation`, so on this type the channel is empty.
      const result = validate(immunization({ schemaVersion: '1.2', snomedCode: undefined, loincCode: undefined }));

      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });
  });
});
