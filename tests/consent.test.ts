/**
 * Tests for the consent filtering module.
 *
 * Covers: applyConsent() with full-access, no-access, and clinical-only
 * policies; custom policies with category allow/deny and provenance filters;
 * edge cases (empty profile, single record type, provenance filter excluding
 * all records); and explicit coverage of procedures and familyHistory.
 */

import { describe, it, expect } from 'vitest';
import {
  applyConsent,
  clinicalOnlyPolicy,
  fullAccessPolicy,
  noAccessPolicy,
} from '../src/consent/consent-filter.js';
import type { ConsentPolicy } from '../src/consent/consent-filter.js';
import type { HealthProfile } from '../src/models/health-profile.js';
import type { ProvenanceType } from '../src/models/common.js';
import type { Medication } from '../src/models/medication.js';
import type { Condition } from '../src/models/condition.js';
import type { Allergy } from '../src/models/allergy.js';
import type { LabResult } from '../src/models/lab-result.js';
import type { VitalSign } from '../src/models/vital-sign.js';
import type { Immunization } from '../src/models/immunization.js';
import type { Procedure } from '../src/models/procedure.js';
import type { FamilyHistory } from '../src/models/family-history.js';
import type { Coverage } from '../src/models/coverage.js';
import type { PatientProfile } from '../src/models/patient-profile.js';
import type { ActivitySnapshot } from '../src/models/activity-snapshot.js';
import type { SleepSnapshot } from '../src/models/sleep-snapshot.js';

// ─── Test Helpers ──────────────────────────────────────────────────────────

let idCounter = 0;

function nextId(): string {
  idCounter += 1;
  return `urn:uuid:test-${idCounter}`;
}

function makeMedication(provenance: ProvenanceType = 'ClinicalGenerated'): Medication {
  return {
    id: nextId(),
    type: 'MedicationRecord',
    dataProvenance: provenance,
    schemaVersion: '1.3',
    medicationName: 'Lisinopril',
    isActive: true,
  };
}

function makeCondition(provenance: ProvenanceType = 'ClinicalGenerated'): Condition {
  return {
    id: nextId(),
    type: 'ConditionRecord',
    dataProvenance: provenance,
    schemaVersion: '1.3',
    conditionName: 'Hypertension',
    status: 'active',
  };
}

function makeAllergy(provenance: ProvenanceType = 'ClinicalGenerated'): Allergy {
  return {
    id: nextId(),
    type: 'AllergyRecord',
    dataProvenance: provenance,
    schemaVersion: '1.3',
    allergen: 'Penicillin',
  };
}

function makeLabResult(provenance: ProvenanceType = 'ClinicalGenerated'): LabResult {
  return {
    id: nextId(),
    type: 'LabResultRecord',
    dataProvenance: provenance,
    schemaVersion: '1.3',
    testName: 'Hemoglobin A1c',
  };
}

function makeVitalSign(provenance: ProvenanceType = 'ClinicalGenerated'): VitalSign {
  return {
    id: nextId(),
    type: 'VitalSign',
    dataProvenance: provenance,
    schemaVersion: '1.3',
    vitalType: 'heartRate',
    value: 72,
    unit: 'bpm',
  };
}

function makeImmunization(provenance: ProvenanceType = 'ClinicalGenerated'): Immunization {
  return {
    id: nextId(),
    type: 'ImmunizationRecord',
    dataProvenance: provenance,
    schemaVersion: '1.3',
    vaccineName: 'COVID-19 mRNA',
  };
}

function makeProcedure(provenance: ProvenanceType = 'ClinicalGenerated'): Procedure {
  return {
    id: nextId(),
    type: 'ProcedureRecord',
    dataProvenance: provenance,
    schemaVersion: '1.3',
    procedureName: 'Appendectomy',
  };
}

function makeFamilyHistory(provenance: ProvenanceType = 'SelfReported'): FamilyHistory {
  return {
    id: nextId(),
    type: 'FamilyHistoryRecord',
    dataProvenance: provenance,
    schemaVersion: '1.3',
    relationship: 'mother',
    conditionName: 'Breast Cancer',
  };
}

function makeCoverage(provenance: ProvenanceType = 'ClinicalGenerated'): Coverage {
  return {
    id: nextId(),
    type: 'InsurancePlan',
    dataProvenance: provenance,
    schemaVersion: '1.3',
    providerName: 'Blue Cross Blue Shield',
  };
}

function makePatientProfile(provenance: ProvenanceType = 'SelfReported'): PatientProfile {
  return {
    id: nextId(),
    type: 'PatientProfile',
    dataProvenance: provenance,
    schemaVersion: '1.3',
    dateOfBirth: '1990-05-15',
    biologicalSex: 'female',
    name: 'Jane Doe',
  };
}

function makeActivitySnapshot(provenance: ProvenanceType = 'DeviceGenerated'): ActivitySnapshot {
  return {
    id: nextId(),
    type: 'ActivitySnapshot',
    dataProvenance: provenance,
    schemaVersion: '1.3',
    date: '2026-02-20',
    steps: 8500,
  };
}

function makeSleepSnapshot(provenance: ProvenanceType = 'DeviceGenerated'): SleepSnapshot {
  return {
    id: nextId(),
    type: 'SleepSnapshot',
    dataProvenance: provenance,
    schemaVersion: '1.3',
    date: '2026-02-20',
    totalSleepMinutes: 420,
  };
}

/** Build a HealthProfile populated with one record of each type. */
function buildFullProfile(): HealthProfile {
  return {
    patientProfile: makePatientProfile(),
    medications: [makeMedication()],
    conditions: [makeCondition()],
    allergies: [makeAllergy()],
    labResults: [makeLabResult()],
    vitalSigns: [makeVitalSign()],
    immunizations: [makeImmunization()],
    procedures: [makeProcedure()],
    familyHistory: [makeFamilyHistory()],
    coverage: [makeCoverage()],
    activitySnapshots: [makeActivitySnapshot()],
    sleepSnapshots: [makeSleepSnapshot()],
  };
}

/** Build a completely empty HealthProfile. */
function buildEmptyProfile(): HealthProfile {
  return {
    patientProfile: undefined,
    medications: [],
    conditions: [],
    allergies: [],
    labResults: [],
    vitalSigns: [],
    immunizations: [],
    procedures: [],
    familyHistory: [],
    coverage: [],
    activitySnapshots: [],
    sleepSnapshots: [],
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('Consent Filtering', () => {
  describe('Full access policy', () => {
    it('fullAccessPolicy allows all record types', () => {
      const profile = buildFullProfile();
      const result = applyConsent(profile, fullAccessPolicy());

      expect(result.patientProfile).toBeDefined();
      expect(result.medications).toHaveLength(1);
      expect(result.conditions).toHaveLength(1);
      expect(result.allergies).toHaveLength(1);
      expect(result.labResults).toHaveLength(1);
      expect(result.vitalSigns).toHaveLength(1);
      expect(result.immunizations).toHaveLength(1);
      expect(result.procedures).toHaveLength(1);
      expect(result.familyHistory).toHaveLength(1);
      expect(result.coverage).toHaveLength(1);
      expect(result.activitySnapshots).toHaveLength(1);
      expect(result.sleepSnapshots).toHaveLength(1);
    });

    it('fullAccessPolicy preserves all fields', () => {
      const med = makeMedication();
      med.dose = '10 mg';
      med.frequency = 'once daily';
      const profile: HealthProfile = {
        ...buildEmptyProfile(),
        medications: [med],
      };

      const result = applyConsent(profile, fullAccessPolicy());

      expect(result.medications).toHaveLength(1);
      expect(result.medications[0]!.medicationName).toBe('Lisinopril');
      expect(result.medications[0]!.dose).toBe('10 mg');
      expect(result.medications[0]!.frequency).toBe('once daily');
    });

    it('fullAccessPolicy returns the same number of records', () => {
      const profile: HealthProfile = {
        ...buildEmptyProfile(),
        medications: [makeMedication(), makeMedication('SelfReported'), makeMedication('DeviceGenerated')],
        conditions: [makeCondition(), makeCondition('EHRVerified')],
      };

      const result = applyConsent(profile, fullAccessPolicy());

      expect(result.medications).toHaveLength(3);
      expect(result.conditions).toHaveLength(2);
    });
  });

  describe('No access policy', () => {
    it('noAccessPolicy removes all records', () => {
      const profile = buildFullProfile();
      const result = applyConsent(profile, noAccessPolicy());

      expect(result.patientProfile).toBeUndefined();
      expect(result.medications).toHaveLength(0);
      expect(result.conditions).toHaveLength(0);
      expect(result.allergies).toHaveLength(0);
      expect(result.labResults).toHaveLength(0);
      expect(result.vitalSigns).toHaveLength(0);
      expect(result.immunizations).toHaveLength(0);
      expect(result.procedures).toHaveLength(0);
      expect(result.familyHistory).toHaveLength(0);
      expect(result.coverage).toHaveLength(0);
      expect(result.activitySnapshots).toHaveLength(0);
      expect(result.sleepSnapshots).toHaveLength(0);
    });

    it('noAccessPolicy returns empty arrays for all categories', () => {
      const profile: HealthProfile = {
        ...buildEmptyProfile(),
        patientProfile: makePatientProfile(),
        medications: [makeMedication(), makeMedication(), makeMedication()],
        vitalSigns: [makeVitalSign(), makeVitalSign()],
      };

      const result = applyConsent(profile, noAccessPolicy());

      expect(result.patientProfile).toBeUndefined();
      expect(result.medications).toEqual([]);
      expect(result.vitalSigns).toEqual([]);
    });
  });

  describe('Clinical-only policy', () => {
    it('clinicalOnlyPolicy allows Medication records', () => {
      const profile: HealthProfile = {
        ...buildEmptyProfile(),
        medications: [makeMedication('ClinicalGenerated'), makeMedication('SelfReported')],
      };

      const result = applyConsent(profile, clinicalOnlyPolicy());

      // medications has no provenanceFilter in clinicalOnlyPolicy, so all pass through
      expect(result.medications).toHaveLength(2);
    });

    it('clinicalOnlyPolicy allows Condition records', () => {
      const profile: HealthProfile = {
        ...buildEmptyProfile(),
        conditions: [makeCondition('ClinicalGenerated'), makeCondition('DeviceGenerated')],
      };

      const result = applyConsent(profile, clinicalOnlyPolicy());

      expect(result.conditions).toHaveLength(2);
    });

    it('clinicalOnlyPolicy allows Allergy records', () => {
      const profile: HealthProfile = {
        ...buildEmptyProfile(),
        allergies: [makeAllergy('ClinicalGenerated')],
      };

      const result = applyConsent(profile, clinicalOnlyPolicy());

      expect(result.allergies).toHaveLength(1);
    });

    it('clinicalOnlyPolicy allows LabResult records', () => {
      const profile: HealthProfile = {
        ...buildEmptyProfile(),
        labResults: [makeLabResult('ClinicalGenerated'), makeLabResult('EHRVerified')],
      };

      const result = applyConsent(profile, clinicalOnlyPolicy());

      expect(result.labResults).toHaveLength(2);
    });

    it('clinicalOnlyPolicy allows Immunization records', () => {
      const profile: HealthProfile = {
        ...buildEmptyProfile(),
        immunizations: [makeImmunization('ClinicalGenerated')],
      };

      const result = applyConsent(profile, clinicalOnlyPolicy());

      expect(result.immunizations).toHaveLength(1);
    });

    it('clinicalOnlyPolicy filters VitalSign records by provenance', () => {
      const profile: HealthProfile = {
        ...buildEmptyProfile(),
        vitalSigns: [
          makeVitalSign('ClinicalGenerated'),
          makeVitalSign('DeviceGenerated'),
          makeVitalSign('EHRVerified'),
          makeVitalSign('SelfReported'),
        ],
      };

      const result = applyConsent(profile, clinicalOnlyPolicy());

      // Only ClinicalGenerated and EHRVerified pass the provenance filter
      expect(result.vitalSigns).toHaveLength(2);
      expect(result.vitalSigns.map((v) => v.dataProvenance)).toEqual([
        'ClinicalGenerated',
        'EHRVerified',
      ]);
    });

    it('clinicalOnlyPolicy allows Coverage records', () => {
      const profile: HealthProfile = {
        ...buildEmptyProfile(),
        coverage: [makeCoverage('ClinicalGenerated')],
      };

      const result = applyConsent(profile, clinicalOnlyPolicy());

      expect(result.coverage).toHaveLength(1);
    });

    it('clinicalOnlyPolicy filters out ActivitySnapshot records', () => {
      const profile: HealthProfile = {
        ...buildEmptyProfile(),
        activitySnapshots: [makeActivitySnapshot(), makeActivitySnapshot()],
      };

      const result = applyConsent(profile, clinicalOnlyPolicy());

      expect(result.activitySnapshots).toHaveLength(0);
    });

    it('clinicalOnlyPolicy filters out SleepSnapshot records', () => {
      const profile: HealthProfile = {
        ...buildEmptyProfile(),
        sleepSnapshots: [makeSleepSnapshot(), makeSleepSnapshot(), makeSleepSnapshot()],
      };

      const result = applyConsent(profile, clinicalOnlyPolicy());

      expect(result.sleepSnapshots).toHaveLength(0);
    });
  });

  describe('Custom policies', () => {
    it('custom policy with specific category allowlist blocks unlisted categories', () => {
      const policy: ConsentPolicy = {
        defaultAllow: false,
        rules: [
          { category: 'medications', allowed: true },
          { category: 'conditions', allowed: true },
        ],
      };

      const profile = buildFullProfile();
      const result = applyConsent(profile, policy);

      expect(result.medications).toHaveLength(1);
      expect(result.conditions).toHaveLength(1);
      // Everything else should be blocked by defaultAllow: false
      expect(result.patientProfile).toBeUndefined();
      expect(result.allergies).toHaveLength(0);
      expect(result.labResults).toHaveLength(0);
      expect(result.vitalSigns).toHaveLength(0);
      expect(result.immunizations).toHaveLength(0);
      expect(result.procedures).toHaveLength(0);
      expect(result.familyHistory).toHaveLength(0);
      expect(result.coverage).toHaveLength(0);
      expect(result.activitySnapshots).toHaveLength(0);
      expect(result.sleepSnapshots).toHaveLength(0);
    });

    it('custom policy can explicitly deny a category while defaultAllow is true', () => {
      const policy: ConsentPolicy = {
        defaultAllow: true,
        rules: [
          { category: 'medications', allowed: false },
        ],
      };

      const profile: HealthProfile = {
        ...buildEmptyProfile(),
        medications: [makeMedication()],
        conditions: [makeCondition()],
      };

      const result = applyConsent(profile, policy);

      expect(result.medications).toHaveLength(0);
      expect(result.conditions).toHaveLength(1);
    });

    it('custom policy can filter based on data provenance', () => {
      const policy: ConsentPolicy = {
        defaultAllow: true,
        rules: [
          { category: 'medications', allowed: true, provenanceFilter: ['EHRVerified'] },
        ],
      };

      const profile: HealthProfile = {
        ...buildEmptyProfile(),
        medications: [
          makeMedication('ClinicalGenerated'),
          makeMedication('EHRVerified'),
          makeMedication('SelfReported'),
        ],
      };

      const result = applyConsent(profile, policy);

      expect(result.medications).toHaveLength(1);
      expect(result.medications[0]!.dataProvenance).toBe('EHRVerified');
    });
  });

  describe('Procedures and FamilyHistory categories', () => {
    it('procedures category is allowed by fullAccessPolicy', () => {
      const profile: HealthProfile = {
        ...buildEmptyProfile(),
        procedures: [makeProcedure('ClinicalGenerated'), makeProcedure('EHRVerified')],
      };

      const result = applyConsent(profile, fullAccessPolicy());

      expect(result.procedures).toHaveLength(2);
    });

    it('procedures category is blocked by noAccessPolicy', () => {
      const profile: HealthProfile = {
        ...buildEmptyProfile(),
        procedures: [makeProcedure()],
      };

      const result = applyConsent(profile, noAccessPolicy());

      expect(result.procedures).toHaveLength(0);
    });

    it('procedures category works with custom provenance filter', () => {
      const policy: ConsentPolicy = {
        defaultAllow: false,
        rules: [
          { category: 'procedures', allowed: true, provenanceFilter: ['EHRVerified'] },
        ],
      };

      const profile: HealthProfile = {
        ...buildEmptyProfile(),
        procedures: [
          makeProcedure('ClinicalGenerated'),
          makeProcedure('EHRVerified'),
          makeProcedure('SelfReported'),
        ],
      };

      const result = applyConsent(profile, policy);

      expect(result.procedures).toHaveLength(1);
      expect(result.procedures[0]!.dataProvenance).toBe('EHRVerified');
    });

    it('familyHistory category is allowed by fullAccessPolicy', () => {
      const profile: HealthProfile = {
        ...buildEmptyProfile(),
        familyHistory: [makeFamilyHistory('SelfReported'), makeFamilyHistory('ClinicalGenerated')],
      };

      const result = applyConsent(profile, fullAccessPolicy());

      expect(result.familyHistory).toHaveLength(2);
    });

    it('familyHistory category is blocked by noAccessPolicy', () => {
      const profile: HealthProfile = {
        ...buildEmptyProfile(),
        familyHistory: [makeFamilyHistory()],
      };

      const result = applyConsent(profile, noAccessPolicy());

      expect(result.familyHistory).toHaveLength(0);
    });

    it('familyHistory category works with custom provenance filter', () => {
      const policy: ConsentPolicy = {
        defaultAllow: false,
        rules: [
          { category: 'familyHistory', allowed: true, provenanceFilter: ['SelfReported', 'AIExtracted'] },
        ],
      };

      const profile: HealthProfile = {
        ...buildEmptyProfile(),
        familyHistory: [
          makeFamilyHistory('SelfReported'),
          makeFamilyHistory('ClinicalGenerated'),
          makeFamilyHistory('AIExtracted'),
        ],
      };

      const result = applyConsent(profile, policy);

      expect(result.familyHistory).toHaveLength(2);
      expect(result.familyHistory.map((fh) => fh.dataProvenance)).toEqual([
        'SelfReported',
        'AIExtracted',
      ]);
    });
  });

  describe('Edge cases', () => {
    it('applying full access to an empty HealthProfile returns an empty profile', () => {
      const profile = buildEmptyProfile();
      const result = applyConsent(profile, fullAccessPolicy());

      expect(result.patientProfile).toBeUndefined();
      expect(result.medications).toEqual([]);
      expect(result.conditions).toEqual([]);
      expect(result.allergies).toEqual([]);
      expect(result.labResults).toEqual([]);
      expect(result.vitalSigns).toEqual([]);
      expect(result.immunizations).toEqual([]);
      expect(result.procedures).toEqual([]);
      expect(result.familyHistory).toEqual([]);
      expect(result.coverage).toEqual([]);
      expect(result.activitySnapshots).toEqual([]);
      expect(result.sleepSnapshots).toEqual([]);
    });

    it('applying no access to an empty HealthProfile returns an empty profile', () => {
      const profile = buildEmptyProfile();
      const result = applyConsent(profile, noAccessPolicy());

      expect(result.patientProfile).toBeUndefined();
      expect(result.medications).toEqual([]);
    });

    it('profile with only one record type filters correctly', () => {
      const profile: HealthProfile = {
        ...buildEmptyProfile(),
        labResults: [makeLabResult('ClinicalGenerated'), makeLabResult('DeviceGenerated')],
      };

      const policy: ConsentPolicy = {
        defaultAllow: false,
        rules: [
          { category: 'labResults', allowed: true, provenanceFilter: ['ClinicalGenerated'] },
        ],
      };

      const result = applyConsent(profile, policy);

      expect(result.labResults).toHaveLength(1);
      expect(result.labResults[0]!.dataProvenance).toBe('ClinicalGenerated');
      // All other categories remain empty
      expect(result.medications).toEqual([]);
      expect(result.conditions).toEqual([]);
    });

    it('provenance filter that excludes all records returns an empty array', () => {
      const profile: HealthProfile = {
        ...buildEmptyProfile(),
        medications: [
          makeMedication('ClinicalGenerated'),
          makeMedication('SelfReported'),
          makeMedication('DeviceGenerated'),
        ],
      };

      const policy: ConsentPolicy = {
        defaultAllow: true,
        rules: [
          { category: 'medications', allowed: true, provenanceFilter: ['AIGenerated'] },
        ],
      };

      const result = applyConsent(profile, policy);

      // No medications have AIGenerated provenance, so all are filtered out
      expect(result.medications).toHaveLength(0);
    });

    it('patientProfile is returned when allowed by policy', () => {
      const profile: HealthProfile = {
        ...buildEmptyProfile(),
        patientProfile: makePatientProfile(),
      };

      const policy: ConsentPolicy = {
        defaultAllow: false,
        rules: [
          { category: 'patientProfile', allowed: true },
        ],
      };

      const result = applyConsent(profile, policy);

      expect(result.patientProfile).toBeDefined();
      expect(result.patientProfile!.name).toBe('Jane Doe');
    });

    it('patientProfile is undefined when blocked by policy', () => {
      const profile: HealthProfile = {
        ...buildEmptyProfile(),
        patientProfile: makePatientProfile(),
      };

      const policy: ConsentPolicy = {
        defaultAllow: true,
        rules: [
          { category: 'patientProfile', allowed: false },
        ],
      };

      const result = applyConsent(profile, policy);

      expect(result.patientProfile).toBeUndefined();
    });

    it('applyConsent returns a new object and does not mutate the original', () => {
      const profile = buildFullProfile();
      const originalMedCount = profile.medications.length;

      const result = applyConsent(profile, noAccessPolicy());

      // Original should be untouched
      expect(profile.medications).toHaveLength(originalMedCount);
      expect(profile.patientProfile).toBeDefined();
      // Result should be empty
      expect(result.medications).toHaveLength(0);
      expect(result.patientProfile).toBeUndefined();
    });

    it('fullAccessPolicy returns copied arrays, not references to the originals', () => {
      const profile = buildFullProfile();

      const result = applyConsent(profile, fullAccessPolicy());

      // Arrays should be different references (spread creates new array)
      expect(result.medications).not.toBe(profile.medications);
      expect(result.medications).toEqual(profile.medications);
    });
  });

  describe('Pre-built policy structure', () => {
    it('fullAccessPolicy has defaultAllow true and no rules', () => {
      const policy = fullAccessPolicy();

      expect(policy.defaultAllow).toBe(true);
      expect(policy.rules).toHaveLength(0);
    });

    it('noAccessPolicy has defaultAllow false and no rules', () => {
      const policy = noAccessPolicy();

      expect(policy.defaultAllow).toBe(false);
      expect(policy.rules).toHaveLength(0);
    });

    it('clinicalOnlyPolicy has defaultAllow true with three rules', () => {
      const policy = clinicalOnlyPolicy();

      expect(policy.defaultAllow).toBe(true);
      expect(policy.rules).toHaveLength(3);

      const activityRule = policy.rules.find((r) => r.category === 'activitySnapshots');
      expect(activityRule).toBeDefined();
      expect(activityRule!.allowed).toBe(false);

      const sleepRule = policy.rules.find((r) => r.category === 'sleepSnapshots');
      expect(sleepRule).toBeDefined();
      expect(sleepRule!.allowed).toBe(false);

      const vitalsRule = policy.rules.find((r) => r.category === 'vitalSigns');
      expect(vitalsRule).toBeDefined();
      expect(vitalsRule!.allowed).toBe(true);
      expect(vitalsRule!.provenanceFilter).toEqual(['ClinicalGenerated', 'EHRVerified']);
    });
  });

  describe('Multiple provenance types in a single category', () => {
    it('filters vitals with mixed provenance correctly under clinicalOnlyPolicy', () => {
      const profile: HealthProfile = {
        ...buildEmptyProfile(),
        vitalSigns: [
          makeVitalSign('ClinicalGenerated'),
          makeVitalSign('DeviceGenerated'),
          makeVitalSign('SelfReported'),
          makeVitalSign('AIExtracted'),
          makeVitalSign('AIGenerated'),
          makeVitalSign('EHRVerified'),
        ],
      };

      const result = applyConsent(profile, clinicalOnlyPolicy());

      expect(result.vitalSigns).toHaveLength(2);
      const provenances = result.vitalSigns.map((v) => v.dataProvenance);
      expect(provenances).toContain('ClinicalGenerated');
      expect(provenances).toContain('EHRVerified');
      expect(provenances).not.toContain('DeviceGenerated');
      expect(provenances).not.toContain('SelfReported');
      expect(provenances).not.toContain('AIExtracted');
      expect(provenances).not.toContain('AIGenerated');
    });

    it('custom policy with multiple provenance types in filter allows matching records', () => {
      const policy: ConsentPolicy = {
        defaultAllow: false,
        rules: [
          {
            category: 'conditions',
            allowed: true,
            provenanceFilter: ['ClinicalGenerated', 'EHRVerified', 'AIExtracted'],
          },
        ],
      };

      const profile: HealthProfile = {
        ...buildEmptyProfile(),
        conditions: [
          makeCondition('ClinicalGenerated'),
          makeCondition('DeviceGenerated'),
          makeCondition('EHRVerified'),
          makeCondition('SelfReported'),
          makeCondition('AIExtracted'),
        ],
      };

      const result = applyConsent(profile, policy);

      expect(result.conditions).toHaveLength(3);
      const provenances = result.conditions.map((c) => c.dataProvenance);
      expect(provenances).toEqual(['ClinicalGenerated', 'EHRVerified', 'AIExtracted']);
    });
  });
});
