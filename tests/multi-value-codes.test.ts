/**
 * health v2.6 / clinical v1.14: code properties whose cardinality is 0..*.
 *
 * `sh:maxCount 1` was removed from `health:testCode`, `health:labCategory`,
 * `health:icd10Code`, `health:snomedCode` and the `clinical:` spellings of the
 * last two, because FHIR R4 `Observation.category` is 0..* and
 * `CodeableConcept.coding` is 0..*. A record that preserved every coding its
 * source sent was being rejected for preserving it.
 *
 * These tests pin BOTH directions. A serializer that emits only the first
 * member, or a deserializer that keeps only the first triple, is a silent
 * data-loss bug that no round-trip of a single-valued record would catch, so
 * every case below asserts the count as well as the contents.
 *
 * All values are synthetic.
 */

import { describe, it, expect } from 'vitest';
import { serialize } from '../src/serializer/turtle-serializer.js';
import { deserializeOne } from '../src/deserializer/turtle-parser.js';
import { asArray } from '../src/models/common.js';
import { validate } from '../src/validator/index.js';
import type { LabResult } from '../src/models/lab-result.js';
import type { Condition } from '../src/models/condition.js';
import type { VitalSign } from '../src/models/vital-sign.js';
import type { Encounter } from '../src/models/encounter.js';

const LOINC_A = 'http://loinc.org/rdf#4548-4';
const LOINC_B = 'http://loinc.org/rdf#17856-6';
const SCT_A = 'http://snomed.info/sct/44054006';
const SCT_B = 'http://snomed.info/sct/73211009';
const ICD_A = 'E11.9';
const ICD_B = 'E11.65';

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function labResult(overrides: Partial<LabResult>): LabResult {
  return {
    id: 'urn:uuid:00000000-0000-4000-8000-00000000la01',
    type: 'LabResultRecord',
    testName: 'Synthetic Panel Analyte',
    dataProvenance: 'ClinicalGenerated',
    schemaVersion: '1.3',
    ...overrides,
  } as LabResult;
}

function condition(overrides: Partial<Condition>): Condition {
  return {
    id: 'urn:uuid:00000000-0000-4000-8000-0000000cnd01',
    type: 'ConditionRecord',
    conditionName: 'Synthetic Condition',
    status: 'active',
    dataProvenance: 'ClinicalGenerated',
    schemaVersion: '1.3',
    ...overrides,
  } as Condition;
}

describe('multi-value code properties: serializer', () => {
  it('emits one health:testCode triple per LOINC coding, in order', () => {
    const ttl = serialize(labResult({ testCode: [LOINC_A, LOINC_B] }));

    expect(countOccurrences(ttl, 'health:testCode')).toBe(2);
    expect(ttl).toContain(`health:testCode <${LOINC_A}>`);
    expect(ttl).toContain(`health:testCode <${LOINC_B}>`);
    expect(ttl.indexOf(LOINC_A)).toBeLessThan(ttl.indexOf(LOINC_B));
  });

  it('emits one health:labCategory literal per category', () => {
    const ttl = serialize(labResult({ labCategory: ['Chemistry', 'Hematology'] }));

    expect(countOccurrences(ttl, 'health:labCategory')).toBe(2);
    expect(ttl).toContain('health:labCategory "Chemistry"');
    expect(ttl).toContain('health:labCategory "Hematology"');
  });

  it('emits repeated health:icd10Code and health:snomedCode on a dual-coded condition', () => {
    const ttl = serialize(condition({ icd10Code: [ICD_A, ICD_B], snomedCode: [SCT_A, SCT_B] }));

    expect(countOccurrences(ttl, 'health:icd10Code')).toBe(2);
    expect(countOccurrences(ttl, 'health:snomedCode')).toBe(2);
    expect(ttl).toContain(`health:snomedCode <${SCT_A}>`);
    expect(ttl).toContain(`health:snomedCode <${SCT_B}>`);
  });

  it('emits clinical:snomedCode for a VitalSign, still one triple per coding', () => {
    const vital: VitalSign = {
      id: 'urn:uuid:00000000-0000-4000-8000-0000000vit01',
      type: 'VitalSign',
      vitalType: 'heartRate',
      value: 72,
      unit: 'bpm',
      dataProvenance: 'DeviceGenerated',
      schemaVersion: '1.3',
      snomedCode: [SCT_A, SCT_B],
    };
    const ttl = serialize(vital);

    expect(countOccurrences(ttl, 'clinical:snomedCode')).toBe(2);
    expect(countOccurrences(ttl, 'health:snomedCode')).toBe(0);
  });

  it('keeps a single value single: one triple, no list syntax', () => {
    const ttl = serialize(labResult({ testCode: LOINC_A, labCategory: 'Chemistry' }));

    expect(countOccurrences(ttl, 'health:testCode')).toBe(1);
    expect(ttl).toContain(`health:testCode <${LOINC_A}>`);
    expect(ttl).toContain('health:labCategory "Chemistry"');
    expect(ttl).not.toContain('health:testCode (');
  });

  it('emits nothing for an empty array', () => {
    const ttl = serialize(labResult({ testCode: [], labCategory: [] }));

    expect(ttl).not.toContain('health:testCode');
    expect(ttl).not.toContain('health:labCategory');
  });

  it('declares the namespace prefix for every member, not just the first', () => {
    const ttl = serialize(condition({ snomedCode: ['urn:uuid:not-a-code', SCT_A] }));
    expect(ttl).toContain('@prefix sct: <http://snomed.info/sct/>');
  });
});

describe('multi-value code properties: deserializer', () => {
  it('reads N repeated health:testCode triples back as N values', () => {
    const ttl = serialize(labResult({ testCode: [LOINC_A, LOINC_B] }));
    const parsed = deserializeOne<LabResult>(ttl, 'LabResultRecord');

    expect(parsed).not.toBeNull();
    expect(parsed?.testCode).toEqual([LOINC_A, LOINC_B]);
  });

  it('reads repeated health:labCategory literals back as an array, in order', () => {
    const ttl = serialize(labResult({ labCategory: ['Chemistry', 'Hematology', 'Microbiology'] }));
    const parsed = deserializeOne<LabResult>(ttl, 'LabResultRecord');

    expect(parsed?.labCategory).toEqual(['Chemistry', 'Hematology', 'Microbiology']);
  });

  it('reads a dual-coded condition back with both codings on both properties', () => {
    const ttl = serialize(condition({ icd10Code: [ICD_A, ICD_B], snomedCode: [SCT_A, SCT_B] }));
    const parsed = deserializeOne<Condition>(ttl, 'ConditionRecord');

    expect(parsed?.icd10Code).toEqual([ICD_A, ICD_B]);
    expect(parsed?.snomedCode).toEqual([SCT_A, SCT_B]);
  });

  it('reads a clinical:snomedCode Encounter back with every coding', () => {
    const encounter: Encounter = {
      id: 'urn:uuid:00000000-0000-4000-8000-0000000enc01',
      type: 'Encounter',
      encounterType: 'Synthetic follow-up visit',
      dataProvenance: 'EHRVerified',
      schemaVersion: '1.3',
      snomedCode: [SCT_A, SCT_B],
    };
    const parsed = deserializeOne<Encounter>(serialize(encounter), 'Encounter');

    expect(parsed?.snomedCode).toEqual([SCT_A, SCT_B]);
  });

  it('preserves arity: one triple reads back as a bare string, not a one-element array', () => {
    const ttl = serialize(labResult({ testCode: LOINC_A, labCategory: 'Chemistry' }));
    const parsed = deserializeOne<LabResult>(ttl, 'LabResultRecord');

    expect(parsed?.testCode).toBe(LOINC_A);
    expect(parsed?.labCategory).toBe('Chemistry');
  });

  it('round-trips a three-coding record without losing or reordering a member', () => {
    const original = labResult({ testCode: [LOINC_A, LOINC_B, 'http://loinc.org/rdf#2345-7'] });
    const once = deserializeOne<LabResult>(serialize(original), 'LabResultRecord');
    const twice = deserializeOne<LabResult>(serialize(once as LabResult), 'LabResultRecord');

    expect(asArray(once?.testCode)).toHaveLength(3);
    expect(twice?.testCode).toEqual(original.testCode);
  });
});

describe('multi-value code properties: validator', () => {
  it('treats an empty code array as no coding at all, not as a coding', () => {
    // An empty array serializes to zero triples, so a check that accepted it as
    // present would suppress the warning on a record that carries no code.
    const withEmpty = validate(labResult({ testCode: [], snomedCode: [] } as Partial<LabResult>));
    const withNone = validate(labResult({}));

    expect(withEmpty.warnings.map((w) => w.message)).toEqual(
      withNone.warnings.map((w) => w.message),
    );
    expect(withEmpty.warnings.some((w) => w.field === 'loincCode')).toBe(true);
  });

  it('accepts a populated code array as a coding', () => {
    const result = validate(labResult({ testCode: [LOINC_A, LOINC_B] }));
    expect(result.warnings.some((w) => w.field === 'loincCode')).toBe(false);
  });
});

describe('asArray', () => {
  it('normalizes the bare, array and absent forms', () => {
    expect(asArray('X')).toEqual(['X']);
    expect(asArray(['X', 'Y'])).toEqual(['X', 'Y']);
    expect(asArray(undefined)).toEqual([]);
    expect(asArray(null)).toEqual([]);
    expect(asArray([])).toEqual([]);
  });

  it('copies rather than aliasing the caller array', () => {
    const source = ['X', 'Y'];
    const out = asArray(source);
    out.push('Z');
    expect(source).toEqual(['X', 'Y']);
  });
});
