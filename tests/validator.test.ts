/**
 * Tests for the record validator module.
 *
 * Covers base validation, type-specific validation, warning-level checks,
 * and the batch validateAll() function.
 */

import { describe, it, expect } from 'vitest';
import { validate, validateAll } from '../src/validator/validator.js';
import type { CascadeRecord } from '../src/models/common.js';
import { CURRENT_SCHEMA_VERSION } from '../src/vocabularies/namespaces.js';

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

    // SKIPPED — needs a constraint the vocabulary does not yet state, and the
    // code to read it. The value is TWO SPACES, not the empty string.
    //
    // `sh:minLength` is enforced, and `sh:minLength 1` does not mean non-empty:
    // SHACL measures the value node after conversion to string, so `"  "` is
    // length 2 and conforms. `""` IS reported — see tests/rules/min-length.test.ts.
    // The constraint that would reject whitespace is `sh:pattern`, and no
    // shape `spec` publishes declares one on any free-text field: all 28 `sh:pattern`
    // declarations are format checks on coded values (cptCode, contentHash,
    // schemaVersion). The trim this test assumes was an implementation detail of
    // the hardcoded check it replaced, never a Cascade rule.
    //
    // Both halves are filed and BOTH are needed:
    //
    //   https://github.com/jayostis/spec/issues/26
    //     spec: add sh:pattern so a required field cannot be whitespace
    //   https://github.com/jayostis/sdk-typescript/issues/53
    //     this SDK: read sh:pattern at all — 28 are declared, 0 are read
    //
    // Adding a `.trim()` here instead would reject records `pyshacl` accepts,
    // which is the divergence tests/support/fixture-contract.ts exists to catch.
    // Un-skip when both land.
    it.skip('a Medication with empty medicationName produces an error (spec#26 + #53)', () => {
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

    /**
     * ONE required field, not three — #3.
     *
     * Three tests stood here demanding `resultValue` and `resultUnit`, and three
     * independent sources say neither is required:
     *
     *   THE SHAPE distinguishes them deliberately, in the same node shape.
     *   `health:testName` carries `sh:minCount 1`, `sh:maxCount 1`,
     *   `sh:minLength 1` and the message "Lab result must have exactly one
     *   non-empty testName". `health:resultValue` gets `sh:maxCount 1` under a
     *   comment reading "REQUIRED cardinality: resultValue is at most one" —
     *   required CARDINALITY, and the paragraph beneath it explains the cap is
     *   there so two same-day readings of one analyte cannot merge into
     *   "95, 310". Same author, same shape, `sh:minCount` on one knowingly and
     *   not on the other.
     *
     *   THE MODEL agrees: `resultValue?` and `resultUnit?` are optional in
     *   `src/models/lab-result.ts`; `testName` is not.
     *
     *   THE CORPUS agrees, and pointedly. `absent-001` is `shouldAccept: true`
     *   and is described as "lab result with no value, carrying a ratified
     *   reason for the absence" — a fixture whose whole subject is a lab result
     *   with no `resultValue`. These tests asserted that record is invalid.
     *   `lab-011` and `lab-012` are `shouldAccept: true` and failed the same way.
     *
     * `pyshacl` returns ZERO results of any kind on a lab result carrying only
     * a `testName`. The requirement came from a hardcoded `switch` case and had
     * no source in the vocabulary, which is #3 and is why it was deleted rather
     * than reimplemented.
     *
     * What survives is the half that was always true, asserted as an exact set
     * so a field creeping back in fails here rather than passing quietly.
     */
    it('a bare LabResult reports testName, and nothing else', () => {
      const result = validate(makeRecord('LabResultRecord'));

      expect(result.valid).toBe(false);
      expect(errorFields(result).sort()).toEqual(['testName']);
    });

    it('a LabResult with only a testName is valid', () => {
      // The positive form of the same claim, and the one `absent-001` makes.
      // Without it the assertion above would still pass under a validator that
      // rejected everything.
      const result = validate(makeRecord('LabResultRecord', { testName: 'TSH' }));

      expect(result.valid).toBe(true);
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

    // SKIPPED — undecided, not broken. `validate()` no longer requires `unit`
    // because nothing in the vocabulary does, and whether that is right is an
    // open question rather than a defect either way.
    //
    // `clinical:VitalSignShape` says so explicitly, in a comment rather than by
    // omission: `# Optional: unit`, the same phrasing it uses for `value`
    // directly above. `src/models/vital-sign.ts` declares `unit: string`,
    // non-optional. One of the two has to move.
    //
    //   https://github.com/jayostis/sdk-typescript/issues/54
    //     decide whether the model relaxes or the shape tightens — covers
    //     ConditionRecord.status, which is the same disagreement
    //
    // NOT settled by the corpus, which is what makes it a question. #3 settled
    // the same argument for `resultValue` because `absent-001` is a
    // shouldAccept fixture carrying no resultValue — a record that must be
    // accepted while missing the field. Every vital-sign fixture carries a
    // unit, so the corpus is silent here rather than supportive.
    //
    // A SEPARATE DEFECT ON THE SAME PREDICATE, which does not block this and is
    // not what this test is about: `clinical:unit` is declared
    // `rdfs:domain clinical:LabResult`, so every vital sign carrying one
    // entails it is a lab result — including the eight in the reference pod.
    //
    //   https://github.com/jayostis/spec/issues/27
    //
    // Left asserting the old behaviour so that whichever way #54 goes, this
    // turns red and gets revisited. Un-skip when #54 is decided.
    it.skip('a VitalSign missing unit produces an error (#54)', () => {
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

    // SKIPPED — blocked upstream, not a defect in this file.
    //
    // `validate()` used to require `givenName` and `familyName` from a hardcoded
    // switch case. NO shape `spec` publishes declares an `sh:path` for either predicate,
    // and `src/models/patient-profile.ts` marks both optional — so the
    // requirement had no source in the vocabulary or in the model. It is gone,
    // and these two assert it.
    //
    // Not merely unrequired: `tests/support/shacl.ts` REFUSES to judge a record
    // carrying `foaf:givenName` / `foaf:familyName` rather than return the
    // vacuous `conforms: true` that an unconstrained predicate produces. There
    // is no SHACL verdict to check against in either direction.
    //
    //   https://github.com/jayostis/sdk-typescript/issues/47
    //   blocked in turn on
    //   https://github.com/jayostis/sdk-typescript/issues/35
    //
    // #47 cannot be answered before #35 decides whether the always-private
    // health document carries a patient name at all. Left asserting the old
    // behaviour, so whichever way #35 goes these turn red and get revisited
    // rather than being silently forgotten. Un-skip when #35 lands.
    it.skip('a PatientProfile missing givenName produces an error (#47, blocked on #35)', () => {
      const result = validate(
        makeRecord('PatientProfile', { familyName: 'Doe' }),
      );
      expect(result.valid).toBe(false);
      expect(errorFields(result)).toContain('givenName');
    });

    // SKIPPED — same block as the test above.
    //   https://github.com/jayostis/sdk-typescript/issues/47
    //   blocked in turn on
    //   https://github.com/jayostis/sdk-typescript/issues/35
    it.skip('a PatientProfile missing familyName produces an error (#47, blocked on #35)', () => {
      const result = validate(
        makeRecord('PatientProfile', { givenName: 'Jane' }),
      );
      expect(result.valid).toBe(false);
      expect(errorFields(result)).toContain('familyName');
    });

    // SKIPPED — blocked on FOUR issues, and it is the only test here that needs
    // all of them. Two independent reasons stack:
    //
    // 1. WHETHER `givenName` IS REQUIRED AT ALL. No shape `spec` publishes declares an
    //    `sh:path` for `foaf:givenName`, the model marks it optional, and
    //    `tests/support/shacl.ts` refuses to judge a record carrying it rather
    //    than return a vacuous conforms:true.
    //
    //      https://github.com/jayostis/sdk-typescript/issues/47
    //      blocked in turn on
    //      https://github.com/jayostis/sdk-typescript/issues/35
    //
    // 2. WHETHER `"  "` COUNTS AS ABSENT, which is a separate question and would
    //    still be open even if #35 made `givenName` required tomorrow. The value
    //    is two spaces; `sh:minLength 1` measures characters, so it conforms,
    //    and no shape declares an `sh:pattern` on any free-text field.
    //
    //      https://github.com/jayostis/spec/issues/26
    //      https://github.com/jayostis/sdk-typescript/issues/53
    //
    // See the same second reason on `a Medication with empty medicationName`
    // above, which needs only that half. Un-skip when #35 and spec#26 are both
    // decided; either alone leaves this failing.
    it.skip('a PatientProfile with empty givenName produces an error (#47/#35 + spec#26/#53)', () => {
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

    // NOT ProcedureRecord either — see the skipped test below. It asserted
    // "passes with only base fields" and passed, and `pyshacl` violates on the
    // same record. Left in this group it would be a green claim that the shape
    // contradicts.
    //
    // ActivitySnapshot and SleepSnapshot below are the two that genuinely
    // belong here, checked rather than assumed: `shaclCheck` returns
    // `conforms: true` for a bare record of each.

    // NOT FamilyHistoryRecord, which was in this group and does not belong to
    // it. `health:FamilyHistoryRecordShape` opens its first property block with
    // "# REQUIRED: conditionName (FHIR condition.code is required per entry)"
    // and an `sh:minCount 1` under it. The record type has always had a
    // type-specific required field; nothing read it until `conditionName`
    // became a term, and this test asserted the opposite the whole time.
    // It moved down, to the two tests that say what the shape says.
  });

  describe('ProcedureRecord validation', () => {
    /**
     * SKIPPED, NOT DELETED, AND IT ASSERTS THE TRUTH — see #49.
     *
     * `validate()` returns `valid: true` for a procedure with no name.
     * `pyshacl` returns a Violation on the same record:
     *
     *   [Violation] (node-level): Procedure must have a name, as
     *   clinical:procedureName (canonical) or health:procedureName (deprecated
     *   import spelling, accepted during the clinical v1.15 migration window)
     *
     * NODE-LEVEL is why this is skipped rather than fixed here. The rule is an
     * `sh:or` across two paths on `clinical:ProcedureShape` — either spelling
     * satisfies it — so no per-field constraint states it and no term can carry
     * it. `minCountByType` on `procedureName` would demand the canonical
     * spelling and reject every C-CDA import the migration window exists to
     * accept, which is a worse answer than the current one.
     *
     * It needs `crossFieldFindings` on a `ProcedureValidator`, which is #49.
     * The same disjunction problem as the missing-coding warning, and #49 has
     * an open question about where a rule of that shape should live.
     *
     * The test this replaced said "a valid ProcedureRecord passes with only
     * base fields" and was green — a claim the shape contradicts, kept alive by
     * nothing reading the rule. Written the right way round and skipped, it is
     * a to-do that names its issue. Green and wrong, it was a to-do nobody knew
     * existed.
     */
    it.skip('a ProcedureRecord without a name is reported (#49)', () => {
      const result = validate(makeRecord('ProcedureRecord'));

      expect(result.valid).toBe(false);
      expect(errorFields(result)).toContain('procedureName');
    });

    it('a ProcedureRecord with a name passes', () => {
      const result = validate(makeRecord('ProcedureRecord', { procedureName: 'Appendectomy' }));
      expect(result.valid).toBe(true);
    });
  });

  describe('FamilyHistoryRecord validation', () => {
    it('a valid FamilyHistoryRecord passes with both required fields', () => {
      const result = validate(
        makeRecord('FamilyHistoryRecord', {
          conditionName: 'Type 2 diabetes',
          relationship: 'mother',
        }),
      );
      expect(result.valid).toBe(true);
    });

    it('a FamilyHistoryRecord without either required field reports BOTH', () => {
      // TWO, and asserting one was the bug in the first version of this test.
      // `health:FamilyHistoryRecordShape` gives `health:conditionName` and
      // `clinical:relationship` an `sh:minCount 1` each, at sh:Violation, and
      // `pyshacl` reports both on a bare record:
      //
      //   conditionName: Family history record must name exactly one condition
      //   relationship:  Family history record must state exactly one relationship
      //                  to the patient
      //
      // `toContain('conditionName')` passed while `relationship` went unjudged,
      // which is a test that looks thorough and checks half the shape. Asserting
      // the whole set is what makes a missed field fail rather than hide.
      const result = validate(makeRecord('FamilyHistoryRecord'));

      expect(result.valid).toBe(false);
      expect(errorFields(result).sort()).toEqual(['conditionName', 'relationship']);
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

/**
 * Which bucket a finding lands in, and how a caller reads a verdict.
 *
 * THE ARRAY IS THE ANSWER. Everything in `errors` says `'error'` and everything
 * in `warnings` says `'warning'`, so `severity` has been redundant with the
 * array it sits in. `sh:Info` breaks that: the vocabulary grades three levels
 * and this SDK shipped two, so an Info-graded finding had nowhere to go and was
 * reported as an error — `validate()` REJECTING a record spec grades a
 * suggestion. `cascade:AddressShape` says as much in its own message: "A postal
 * address is helpful for care coordination and correspondence."
 *
 * A third ARRAY rather than a third severity folded into `warnings`, because
 * the alternative is `result.warnings.filter(w => w.severity === 'info')` — a
 * distinction reachable only by filtering an array named for something else,
 * which nobody discovers without reading the type union.
 *
 * `valid` is unchanged and means what it always meant: no errors.
 */
describe('the three buckets a finding can land in', () => {
  const profile = (extra: Record<string, unknown> = {}) => ({
    id: 'urn:uuid:bucket-0001-aaaa-bbbb-ccccddddeeee',
    type: 'PatientProfile',
    givenName: 'Jane',
    familyName: 'Doe',
    dateOfBirth: '1985-03-12',
    biologicalSex: 'female',
    dataProvenance: 'SelfReported',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    ...extra,
  }) as unknown as CascadeRecord;

  const fields = (found: readonly { field: string }[]) => found.map((f) => f.field);

  it('puts a Violation-graded finding in errors, and only there', () => {
    // `cascade:biologicalSex` is `sh:minCount 1` on `cascade:PatientProfileShape`
    // at `sh:severity sh:Violation` (core.shapes.ttl:51). Absent is a defect, the
    // record is invalid, and nothing about it belongs in the other two buckets.
    //
    // A MISSING field rather than a duplicated one: `sh:maxCount 1` is also on
    // that shape and the term does not carry it (#39), so a two-value case would
    // be red for a defect this file is not about.
    const result = validate({ ...profile(), biologicalSex: undefined } as never);

    expect(fields(result.errors)).toContain('biologicalSex');
    expect(fields(result.warnings)).not.toContain('biologicalSex');
    expect(fields(result.info)).not.toContain('biologicalSex');
    expect(result.valid).toBe(false);
  });

  it('puts a Warning-graded finding in warnings, and only there', () => {
    // A schemaVersion behind the current one. Reported, never rejected.
    const result = validate(profile({ schemaVersion: '1.2' }));

    expect(fields(result.warnings)).toContain('schemaVersion');
    expect(fields(result.errors)).not.toContain('schemaVersion');
    expect(fields(result.info)).not.toContain('schemaVersion');
    expect(result.valid).toBe(true);
  });

  it('puts an Info-graded finding in info, and only there', () => {
    // `cascade:address` is `sh:maxCount 1` at `sh:severity sh:Info`
    // (core.shapes.ttl:136). Two addresses is worth saying and is not a defect,
    // so the record stays valid — this is the one that was reported as an error.
    const result = validate(profile({
      address: [{ addressCity: 'Portland' }, { addressCity: 'Seattle' }],
    }));

    expect(fields(result.info)).toContain('address');
    expect(fields(result.errors)).not.toContain('address');
    expect(fields(result.warnings)).not.toContain('address');
    expect(result.valid).toBe(true);
  });

  it('sorts all three at once, with nothing crossing buckets', () => {
    // THE ASSERTION THAT MATTERS. Each of the three above alone would pass on a
    // partition that routed by which function produced the finding rather than
    // by its severity; only a record carrying all three at once shows that each
    // array holds what its name says.
    const result = validate({ ...profile({
      schemaVersion: '1.2',
      address: [{ addressCity: 'Portland' }, { addressCity: 'Seattle' }],
    }), biologicalSex: undefined } as never);

    expect(fields(result.errors)).toContain('biologicalSex');
    expect(fields(result.warnings)).toContain('schemaVersion');
    expect(fields(result.info)).toContain('address');

    // Every finding's severity agrees with the array holding it. Asserted over
    // the whole result rather than per field, so a fourth severity added later
    // cannot be quietly filed into an existing bucket.
    expect(result.errors.every((e) => e.severity === 'error')).toBe(true);
    expect(result.warnings.every((e) => e.severity === 'warning')).toBe(true);
    expect(result.info.every((e) => e.severity === 'info')).toBe(true);

    expect(result.valid).toBe(false);
  });

  it('carries all three through validateAll', () => {
    const result = validateAll([
      { ...profile(), biologicalSex: undefined } as never,
      profile({ schemaVersion: '1.2' }),
      profile({ address: [{ addressCity: 'Portland' }, { addressCity: 'Seattle' }] }),
    ]);

    expect(fields(result.errors)).toContain('biologicalSex');
    expect(fields(result.warnings)).toContain('schemaVersion');
    expect(fields(result.info)).toContain('address');
    expect(result.valid).toBe(false);
  });
});
