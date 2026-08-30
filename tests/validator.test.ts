/**
 * Tests for the record validator module.
 *
 * Covers base validation, type-specific validation, warning-level checks,
 * and the batch validateAll() function.
 */

import { describe, it, expect } from 'vitest';
import { validate, validateAll } from '../src/validator/validator.js';
import type { CascadeRecord } from '../src/models/common.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Creates a valid base CascadeRecord with the given type. Override fields as needed. */
function makeRecord(
  type: string,
  extra: Record<string, unknown> = {},
): CascadeRecord & Record<string, unknown> {
  return {
    id: 'urn:uuid:test-record-001',
    type,
    dataProvenance: 'ClinicalGenerated',
    schemaVersion: '1.3',
    ...extra,
  } as CascadeRecord & Record<string, unknown>;
}

/** Creates a fully valid MedicationRecord. */
function makeValidMedication(overrides: Record<string, unknown> = {}) {
  return makeRecord('MedicationRecord', {
    medicationName: 'Metoprolol',
    isActive: true,
    ...overrides,
  });
}

/** Creates a fully valid ConditionRecord. */
function makeValidCondition(overrides: Record<string, unknown> = {}) {
  return makeRecord('ConditionRecord', {
    conditionName: 'Hypertension',
    status: 'active',
    ...overrides,
  });
}

/** Creates a fully valid AllergyRecord. */
function makeValidAllergy(overrides: Record<string, unknown> = {}) {
  return makeRecord('AllergyRecord', {
    allergen: 'Penicillin',
    ...overrides,
  });
}

/** Creates a fully valid LabResultRecord. */
function makeValidLabResult(overrides: Record<string, unknown> = {}) {
  return makeRecord('LabResultRecord', {
    testName: 'TSH',
    resultValue: 2.5,
    resultUnit: 'mIU/L',
    ...overrides,
  });
}

/** Creates a fully valid VitalSign. */
function makeValidVitalSign(overrides: Record<string, unknown> = {}) {
  return makeRecord('VitalSign', {
    vitalType: 'heartRate',
    value: 72,
    unit: 'bpm',
    ...overrides,
  });
}

/** Creates a fully valid ImmunizationRecord. */
function makeValidImmunization(overrides: Record<string, unknown> = {}) {
  return makeRecord('ImmunizationRecord', {
    vaccineName: 'COVID-19 mRNA',
    ...overrides,
  });
}

/** Creates a fully valid CoverageRecord. */
function makeValidCoverage(overrides: Record<string, unknown> = {}) {
  return makeRecord('CoverageRecord', {
    providerName: 'Blue Cross Blue Shield',
    ...overrides,
  });
}

/** Creates a fully valid PatientProfile. */
function makeValidPatientProfile(overrides: Record<string, unknown> = {}) {
  return makeRecord('PatientProfile', {
    givenName: 'Jane',
    familyName: 'Doe',
    // `cascade:PatientProfileShape` declares sh:minCount 1 for both, and the
    // term modules now carry that, so a profile without them is invalid and
    // this helper's previous "valid" record was not one. It passed only because
    // nothing checked — the same gap that let profile-004 and profile-005 be
    // rejected over `givenName` instead of over the field each is missing.
    dateOfBirth: '1985-03-12',
    biologicalSex: 'female',
    ...overrides,
  });
}

/** Helper: returns the field names from all errors in a result. */
function errorFields(result: { errors: readonly { field: string }[] }): string[] {
  return result.errors.map((e) => e.field);
}

/** Helper: returns the field names from all warnings in a result. */
function warningFields(result: { warnings: readonly { field: string }[] }): string[] {
  return result.warnings.map((w) => w.field);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Validator', () => {
  // ── Base Validation ─────────────────────────────────────────────────────

  describe('Base validation', () => {
    it('a valid Medication passes validation', () => {
      const result = validate(makeValidMedication());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('a record missing required id fails validation', () => {
      const result = validate(makeValidMedication({ id: '' }));
      expect(result.valid).toBe(false);
      expect(errorFields(result)).toContain('id');
    });

    it('a record with invalid/unknown type fails validation', () => {
      const result = validate(makeRecord('BogusType'));
      expect(result.valid).toBe(false);
      expect(errorFields(result)).toContain('type');
      const typeError = result.errors.find((e) => e.field === 'type');
      expect(typeError!.message).toContain('BogusType');
    });

    it('a record missing schemaVersion fails validation', () => {
      const result = validate(makeValidMedication({ schemaVersion: '' }));
      expect(result.valid).toBe(false);
      expect(errorFields(result)).toContain('schemaVersion');
    });

    it('a record with invalid dataProvenance fails validation', () => {
      const rec = makeValidMedication();
      (rec as Record<string, unknown>).dataProvenance = 'InvalidProvenance';
      const result = validate(rec as CascadeRecord);
      expect(result.valid).toBe(false);
      expect(errorFields(result)).toContain('dataProvenance');
    });

    it('accepts all valid provenance types', () => {
      const provenanceTypes = [
        'ClinicalGenerated',
        'DeviceGenerated',
        'SelfReported',
        'AIExtracted',
        'AIGenerated',
        'EHRVerified',
      ] as const;
      for (const prov of provenanceTypes) {
        const result = validate(makeValidMedication({ dataProvenance: prov }));
        expect(result.valid).toBe(true);
      }
    });
  });

  // ── Type-Specific: MedicationRecord ─────────────────────────────────────

  describe('MedicationRecord validation', () => {
    it('a Medication missing medicationName produces an error', () => {
      const result = validate(makeRecord('MedicationRecord', { isActive: true }));
      expect(result.valid).toBe(false);
      expect(errorFields(result)).toContain('medicationName');
    });

    it('a Medication with empty medicationName produces an error', () => {
      const result = validate(
        makeRecord('MedicationRecord', { medicationName: '  ', isActive: true }),
      );
      expect(result.valid).toBe(false);
      expect(errorFields(result)).toContain('medicationName');
    });

    it('a Medication missing isActive produces an error', () => {
      const result = validate(
        makeRecord('MedicationRecord', { medicationName: 'Metoprolol' }),
      );
      expect(result.valid).toBe(false);
      expect(errorFields(result)).toContain('isActive');
    });

    it('a Medication with isActive=false is still valid (field is present)', () => {
      const result = validate(makeValidMedication({ isActive: false }));
      expect(result.valid).toBe(true);
    });
  });

  // ── Type-Specific: ConditionRecord ──────────────────────────────────────

  describe('ConditionRecord validation', () => {
    it('a valid Condition passes validation', () => {
      const result = validate(makeValidCondition());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('a Condition missing conditionName produces an error', () => {
      const result = validate(
        makeRecord('ConditionRecord', { status: 'active' }),
      );
      expect(result.valid).toBe(false);
      expect(errorFields(result)).toContain('conditionName');
    });

    it('a Condition with invalid status produces an error on field "status" (not "clinicalStatus")', () => {
      const result = validate(makeValidCondition({ status: 'unknown' }));
      expect(result.valid).toBe(false);
      const statusError = result.errors.find((e) => e.field === 'status');
      expect(statusError).toBeDefined();
      expect(statusError!.severity).toBe('error');
      // Ensure we do NOT use the old 'clinicalStatus' field name
      expect(errorFields(result)).not.toContain('clinicalStatus');
    });

    it('a Condition without status produces an error', () => {
      const result = validate(
        makeRecord('ConditionRecord', { conditionName: 'Asthma' }),
      );
      expect(result.valid).toBe(false);
      expect(errorFields(result)).toContain('status');
    });

    it('accepts all valid condition statuses', () => {
      const statuses = ['active', 'resolved', 'remission', 'inactive'];
      for (const status of statuses) {
        const result = validate(makeValidCondition({ status }));
        expect(result.valid).toBe(true);
      }
    });
  });

  // ── Type-Specific: AllergyRecord ────────────────────────────────────────

  describe('AllergyRecord validation', () => {
    it('a valid Allergy passes validation', () => {
      const result = validate(makeValidAllergy());
      expect(result.valid).toBe(true);
    });

    it('an Allergy missing allergen produces an error', () => {
      const result = validate(makeRecord('AllergyRecord'));
      expect(result.valid).toBe(false);
      expect(errorFields(result)).toContain('allergen');
    });

    it('an Allergy with empty allergen produces an error', () => {
      const result = validate(makeRecord('AllergyRecord', { allergen: '' }));
      expect(result.valid).toBe(false);
      expect(errorFields(result)).toContain('allergen');
    });
  });

  // ── Type-Specific: LabResultRecord ──────────────────────────────────────

  describe('LabResultRecord validation', () => {
    it('a valid LabResult passes validation', () => {
      const result = validate(makeValidLabResult());
      expect(result.valid).toBe(true);
    });

    it('a LabResult missing testName produces an error', () => {
      const result = validate(
        makeRecord('LabResultRecord', { resultValue: 5.0, resultUnit: 'mg/dL' }),
      );
      expect(result.valid).toBe(false);
      expect(errorFields(result)).toContain('testName');
    });

    it('a LabResult missing resultValue produces an error', () => {
      const result = validate(
        makeRecord('LabResultRecord', { testName: 'TSH', resultUnit: 'mIU/L' }),
      );
      expect(result.valid).toBe(false);
      expect(errorFields(result)).toContain('resultValue');
    });

    it('a LabResult missing resultUnit produces an error', () => {
      const result = validate(
        makeRecord('LabResultRecord', { testName: 'TSH', resultValue: 2.5 }),
      );
      expect(result.valid).toBe(false);
      expect(errorFields(result)).toContain('resultUnit');
    });

    it('a LabResult with all three fields missing produces three errors', () => {
      const result = validate(makeRecord('LabResultRecord'));
      expect(result.valid).toBe(false);
      expect(errorFields(result)).toContain('testName');
      expect(errorFields(result)).toContain('resultValue');
      expect(errorFields(result)).toContain('resultUnit');
    });
  });

  // ── Type-Specific: VitalSign ────────────────────────────────────────────

  describe('VitalSign validation', () => {
    it('a valid VitalSign passes validation', () => {
      const result = validate(makeValidVitalSign());
      expect(result.valid).toBe(true);
    });

    it('validates VitalSign value is a number', () => {
      const result = validate(
        makeRecord('VitalSign', {
          vitalType: 'heartRate',
          value: 'seventy-two', // string, not a number
          unit: 'bpm',
        }),
      );
      expect(result.valid).toBe(false);
      expect(errorFields(result)).toContain('value');
      const valueError = result.errors.find((e) => e.field === 'value');
      expect(valueError!.message).toContain('number');
    });

    it('a VitalSign with invalid vitalType produces an error', () => {
      const result = validate(
        makeRecord('VitalSign', {
          vitalType: 'bogusVital',
          value: 72,
          unit: 'bpm',
        }),
      );
      expect(result.valid).toBe(false);
      expect(errorFields(result)).toContain('vitalType');
    });

    it('a VitalSign missing unit produces an error', () => {
      const result = validate(
        makeRecord('VitalSign', {
          vitalType: 'heartRate',
          value: 72,
        }),
      );
      expect(result.valid).toBe(false);
      expect(errorFields(result)).toContain('unit');
    });

    it('accepts all valid vital types', () => {
      const vitalTypes = [
        'heartRate', 'bloodPressureSystolic', 'bloodPressureDiastolic',
        'respiratoryRate', 'temperature', 'oxygenSaturation',
        'weight', 'height', 'bmi',
      ];
      for (const vitalType of vitalTypes) {
        const result = validate(makeValidVitalSign({ vitalType }));
        expect(result.valid).toBe(true);
      }
    });
  });

  // ── Type-Specific: ImmunizationRecord ───────────────────────────────────

  describe('ImmunizationRecord validation', () => {
    it('a valid Immunization passes validation', () => {
      const result = validate(makeValidImmunization());
      expect(result.valid).toBe(true);
    });

    it('an Immunization missing vaccineName produces an error', () => {
      const result = validate(makeRecord('ImmunizationRecord'));
      expect(result.valid).toBe(false);
      expect(errorFields(result)).toContain('vaccineName');
    });

    it('an Immunization with valid status passes', () => {
      const validStatuses = ['completed', 'entered-in-error', 'not-done'];
      for (const status of validStatuses) {
        const result = validate(makeValidImmunization({ status }));
        expect(result.valid).toBe(true);
      }
    });

    it('an Immunization with invalid status produces an error', () => {
      const result = validate(makeValidImmunization({ status: 'pending' }));
      expect(result.valid).toBe(false);
      expect(errorFields(result)).toContain('status');
    });

    it('an Immunization without status (undefined) is valid', () => {
      const result = validate(makeValidImmunization());
      expect(result.valid).toBe(true);
    });
  });

  // ── Type-Specific: CoverageRecord / InsurancePlan ───────────────────────

  describe('CoverageRecord and InsurancePlan validation', () => {
    it('a valid CoverageRecord passes validation', () => {
      const result = validate(makeValidCoverage());
      expect(result.valid).toBe(true);
    });

    it('a CoverageRecord missing providerName produces an error', () => {
      const result = validate(makeRecord('CoverageRecord'));
      expect(result.valid).toBe(false);
      expect(errorFields(result)).toContain('providerName');
    });

    it('an InsurancePlan missing providerName produces an error', () => {
      const result = validate(makeRecord('InsurancePlan'));
      expect(result.valid).toBe(false);
      expect(errorFields(result)).toContain('providerName');
    });

    it('a valid InsurancePlan passes validation', () => {
      const result = validate(
        makeRecord('InsurancePlan', { providerName: 'Aetna' }),
      );
      expect(result.valid).toBe(true);
    });
  });

  // ── Type-Specific: PatientProfile ───────────────────────────────────────

  describe('PatientProfile validation', () => {
    it('a valid PatientProfile passes validation', () => {
      const result = validate(makeValidPatientProfile());
      expect(result.valid).toBe(true);
    });

    it('a PatientProfile missing givenName produces an error', () => {
      const result = validate(
        makeRecord('PatientProfile', { familyName: 'Doe' }),
      );
      expect(result.valid).toBe(false);
      expect(errorFields(result)).toContain('givenName');
    });

    it('a PatientProfile missing familyName produces an error', () => {
      const result = validate(
        makeRecord('PatientProfile', { givenName: 'Jane' }),
      );
      expect(result.valid).toBe(false);
      expect(errorFields(result)).toContain('familyName');
    });

    it('a PatientProfile with empty givenName produces an error', () => {
      const result = validate(makeValidPatientProfile({ givenName: '  ' }));
      expect(result.valid).toBe(false);
      expect(errorFields(result)).toContain('givenName');
    });
  });

  // ── Warning-Level Checks ────────────────────────────────────────────────

  describe('Warning-level checks', () => {
    it('a Medication without rxNormCode/snomedCode produces a warning about missing coding', () => {
      const result = validate(makeValidMedication());
      expect(result.valid).toBe(true); // warnings do not affect validity
      expect(result.warnings.length).toBeGreaterThan(0);
      const codingWarning = result.warnings.find((w) => w.field === 'loincCode');
      expect(codingWarning).toBeDefined();
      expect(codingWarning!.severity).toBe('warning');
      expect(codingWarning!.message).toContain('interoperability');
    });

    it('a Medication with snomedCode does not produce a coding warning', () => {
      const result = validate(makeValidMedication({ snomedCode: '123456' }));
      const codingWarning = result.warnings.find((w) => w.field === 'loincCode');
      expect(codingWarning).toBeUndefined();
    });

    it('a Condition without snomedCode produces a warning', () => {
      const result = validate(makeValidCondition());
      expect(result.valid).toBe(true);
      const codingWarning = result.warnings.find((w) => w.field === 'loincCode');
      expect(codingWarning).toBeDefined();
    });

    it('a VitalSign without loincCode produces a warning', () => {
      const result = validate(makeValidVitalSign());
      expect(result.valid).toBe(true);
      expect(warningFields(result)).toContain('loincCode');
    });

    it('a VitalSign with loincCode does not produce a coding warning', () => {
      const result = validate(makeValidVitalSign({ loincCode: '8867-4' }));
      const codingWarning = result.warnings.find((w) => w.field === 'loincCode');
      expect(codingWarning).toBeUndefined();
    });

    it('a LabResult without testCode produces a warning', () => {
      const result = validate(makeValidLabResult());
      expect(result.valid).toBe(true);
      expect(warningFields(result)).toContain('loincCode');
    });

    it('a LabResult with testCode does not produce a coding warning', () => {
      const result = validate(makeValidLabResult({ testCode: 'LOINC-1234' }));
      const codingWarning = result.warnings.find((w) => w.field === 'loincCode');
      expect(codingWarning).toBeUndefined();
    });

    it('schema version not matching "1.3" produces a warning', () => {
      const result = validate(makeValidMedication({ schemaVersion: '1.2' }));
      expect(result.valid).toBe(true); // version mismatch is a warning, not an error
      const versionWarning = result.warnings.find((w) => w.field === 'schemaVersion');
      expect(versionWarning).toBeDefined();
      expect(versionWarning!.severity).toBe('warning');
      expect(versionWarning!.message).toContain('1.2');
      expect(versionWarning!.message).toContain('1.3');
    });

    it('schema version "1.3" does not produce a version warning', () => {
      const result = validate(makeValidMedication({ schemaVersion: '1.3' }));
      const versionWarning = result.warnings.find((w) => w.field === 'schemaVersion');
      expect(versionWarning).toBeUndefined();
    });

    it('non-clinical types (e.g. PatientProfile) do not get coding warnings', () => {
      const result = validate(makeValidPatientProfile());
      const codingWarning = result.warnings.find((w) => w.field === 'loincCode');
      expect(codingWarning).toBeUndefined();
    });
  });

  // ── Types Without Extra Validation ──────────────────────────────────────

  describe('Types with no additional type-specific required fields', () => {
    it('a valid ActivitySnapshot passes with only base fields', () => {
      const result = validate(makeRecord('ActivitySnapshot'));
      expect(result.valid).toBe(true);
    });

    it('a valid SleepSnapshot passes with only base fields', () => {
      const result = validate(makeRecord('SleepSnapshot'));
      expect(result.valid).toBe(true);
    });

    it('a valid ProcedureRecord passes with only base fields', () => {
      const result = validate(makeRecord('ProcedureRecord'));
      expect(result.valid).toBe(true);
    });

    it('a valid FamilyHistoryRecord passes with only base fields', () => {
      const result = validate(makeRecord('FamilyHistoryRecord'));
      expect(result.valid).toBe(true);
    });
  });

  // ── validateAll() ───────────────────────────────────────────────────────

  describe('validateAll()', () => {
    it('returns valid=true for an array of valid records', () => {
      const records = [
        makeValidMedication() as CascadeRecord,
        makeValidCondition() as CascadeRecord,
        makeValidAllergy() as CascadeRecord,
      ];
      const result = validateAll(records);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns valid=false when any record has errors', () => {
      const records = [
        makeValidMedication() as CascadeRecord,
        makeRecord('ConditionRecord') as CascadeRecord, // missing conditionName and status
      ];
      const result = validateAll(records);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('combines errors from multiple invalid records', () => {
      const records = [
        makeRecord('MedicationRecord') as CascadeRecord, // missing medicationName, isActive
        makeRecord('AllergyRecord') as CascadeRecord, // missing allergen
      ];
      const result = validateAll(records);
      expect(result.valid).toBe(false);
      expect(errorFields(result)).toContain('medicationName');
      expect(errorFields(result)).toContain('isActive');
      expect(errorFields(result)).toContain('allergen');
    });

    it('combines warnings from multiple records', () => {
      const records = [
        makeValidMedication() as CascadeRecord, // no coding -> warning
        makeValidCondition() as CascadeRecord, // no coding -> warning
      ];
      const result = validateAll(records);
      expect(result.valid).toBe(true);
      // Each clinical record without coding produces a warning
      const codingWarnings = result.warnings.filter((w) => w.field === 'loincCode');
      expect(codingWarnings.length).toBe(2);
    });

    it('handles an empty array gracefully', () => {
      const result = validateAll([]);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('handles a single record the same as validate()', () => {
      const record = makeValidMedication() as CascadeRecord;
      const singleResult = validate(record);
      const batchResult = validateAll([record]);
      expect(batchResult.valid).toBe(singleResult.valid);
      expect(batchResult.errors.length).toBe(singleResult.errors.length);
      expect(batchResult.warnings.length).toBe(singleResult.warnings.length);
    });
  });

  // ── ValidationResult Shape ──────────────────────────────────────────────

  describe('ValidationResult structure', () => {
    it('errors have correct severity "error"', () => {
      const result = validate(makeRecord('MedicationRecord'));
      for (const err of result.errors) {
        expect(err.severity).toBe('error');
      }
    });

    it('warnings have correct severity "warning"', () => {
      const result = validate(makeValidMedication());
      for (const w of result.warnings) {
        expect(w.severity).toBe('warning');
      }
    });

    it('each error has a non-empty field and message', () => {
      const result = validate(makeRecord('MedicationRecord'));
      expect(result.errors.length).toBeGreaterThan(0);
      for (const err of result.errors) {
        expect(err.field.length).toBeGreaterThan(0);
        expect(err.message.length).toBeGreaterThan(0);
      }
    });
  });

  // ── prov:Agent / prov:Activity classes ──────────────────────────────────
  // These are not cascade:HealthRecord subclasses, so they carry no
  // dataProvenance/schemaVersion; their required fields follow each SHACL shape.
  describe('Agent and Activity types', () => {
    const agentRecord = (extra: Record<string, unknown>) =>
      ({ id: 'urn:cascade:test-agent-001', ...extra } as unknown as CascadeRecord);

    it('a valid ProxyAgent passes without dataProvenance/schemaVersion', () => {
      const result = validate(agentRecord({
        type: 'ProxyAgent',
        actsForPatient: 'urn:cascade:patient:child-001',
        proxyRelationship: 'parent',
        proxyGrantedAt: '2026-01-15T10:00:00Z',
      }));
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('a ProxyAgent missing proxyRelationship fails', () => {
      const result = validate(agentRecord({
        type: 'ProxyAgent',
        actsForPatient: 'urn:cascade:patient:child-001',
        proxyGrantedAt: '2026-01-15T10:00:00Z',
      }));
      expect(result.valid).toBe(false);
      expect(errorFields(result)).toContain('proxyRelationship');
    });

    it('a valid AIGenerationActivity passes', () => {
      const result = validate(agentRecord({
        type: 'AIGenerationActivity',
        extractionModel: 'gemma-3.5-4b',
        trigger: 'InitialGeneration',
      }));
      expect(result.valid).toBe(true);
    });
  });
});

/**
 * A base field the FAITHFUL READER hands back as an array.
 *
 * `deserialize()` returns every triple it finds, whatever the field's declared
 * cardinality, so a document with two `cascade:schemaVersion` triples comes
 * back as `schemaVersion: ["1.3", "1.4"]`. `CascadeEntity` types the field
 * `string`, which describes the conforming document and not the input.
 *
 * The whole position of this SDK is that the writer and the reader move data
 * and `validate()` judges it. A judge that THROWS on the input its own
 * faithfulness produces is worse than one that judges wrongly: `TypeError:
 * record.schemaVersion.trim is not a function` came out of `validate()` itself,
 * so the caller learned nothing about the duplicate and nothing about anything
 * else wrong with the record either. Before the reader stopped skipping, the
 * first triple was kept and this was unreachable.
 */
describe('a base field carrying more values than it can hold', () => {
  it('reports a duplicated schemaVersion instead of throwing', () => {
    const result = validate(makeRecord('PatientProfile', {
      schemaVersion: ['1.3', '1.4'],
      givenName: 'Jane',
      familyName: 'Doe',
      dateOfBirth: '1985-03-12',
      biologicalSex: 'female',
    }));

    expect(result.valid).toBe(false);
    expect(errorFields(result)).toContain('schemaVersion');
  });

  it('reports a duplicated id instead of throwing', () => {
    const result = validate(makeRecord('MedicationRecord', {
      id: ['urn:uuid:a', 'urn:uuid:b'],
      medicationName: 'Metoprolol',
      isActive: true,
    }));

    expect(result.valid).toBe(false);
    expect(errorFields(result)).toContain('id');
  });

  it('says the field carries too many values, not that it is missing', () => {
    // A message naming the wrong defect sends the caller looking for a field
    // they supplied twice. It IS present; that is the problem with it.
    const result = validate(makeRecord('MedicationRecord', {
      schemaVersion: ['1.3', '1.4'],
      medicationName: 'Metoprolol',
      isActive: true,
    }));

    expect(result.errors.find((e) => e.field === 'schemaVersion')?.message).toBe(
      'schemaVersion carries 2 values; it must be a single non-empty string',
    );
  });

  it('still says "must be present" when the field is genuinely absent', () => {
    // The other half. Widening the guard must not relabel the absent case.
    const result = validate(makeRecord('MedicationRecord', {
      schemaVersion: undefined,
      medicationName: 'Metoprolol',
      isActive: true,
    }));

    expect(result.errors.find((e) => e.field === 'schemaVersion')?.message).toBe(
      'schemaVersion must be present',
    );
  });

  it('goes on judging everything else about the record', () => {
    // The point of not throwing. A record with a duplicated schemaVersion AND a
    // bad provenance earns both findings; the throw reported neither.
    const result = validate(makeRecord('MedicationRecord', {
      schemaVersion: ['1.3', '1.4'],
      dataProvenance: 'NotAProvenanceType',
      medicationName: 'Metoprolol',
      isActive: true,
    }));

    expect(errorFields(result)).toEqual(
      expect.arrayContaining(['schemaVersion', 'dataProvenance']),
    );
  });
});
