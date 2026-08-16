/**
 * Tests for the Pod builder module.
 *
 * Covers: file grouping (clinical/ vs wellness/), LDP BasicContainer index.ttl
 * generation, Turtle document merging with deduplicated prefixes, manifest
 * generation, and VitalSign provenance-based routing.
 */

import { describe, it, expect } from 'vitest';
import { PodBuilder } from '../src/pod/pod-builder.js';
import type { PodFile } from '../src/pod/pod-builder.js';
import type { Medication } from '../src/models/medication.js';
import type { Condition } from '../src/models/condition.js';
import type { VitalSign } from '../src/models/vital-sign.js';
import type { Allergy } from '../src/models/allergy.js';
import type { LabResult } from '../src/models/lab-result.js';
import type { Immunization } from '../src/models/immunization.js';
import type { Coverage } from '../src/models/coverage.js';
import type { PatientProfile } from '../src/models/patient-profile.js';
import type { Procedure } from '../src/models/procedure.js';
import type { FamilyHistory } from '../src/models/family-history.js';
import type { ActivitySnapshot } from '../src/models/activity-snapshot.js';
import type { SleepSnapshot } from '../src/models/sleep-snapshot.js';
import type { HealthProfile } from '../src/models/health-profile.js';

// ─── Test Data Factories ─────────────────────────────────────────────────────

function makeMedication(overrides: Partial<Medication> = {}): Medication {
  return {
    id: 'urn:uuid:test-med-1',
    type: 'MedicationRecord',
    dataProvenance: 'ClinicalGenerated',
    schemaVersion: '1.3',
    medicationName: 'Aspirin',
    isActive: true,
    ...overrides,
  };
}

function makeCondition(overrides: Partial<Condition> = {}): Condition {
  return {
    id: 'urn:uuid:test-cond-1',
    type: 'ConditionRecord',
    dataProvenance: 'ClinicalGenerated',
    schemaVersion: '1.3',
    conditionName: 'Hypertension',
    status: 'active',
    ...overrides,
  };
}

function makeVitalSign(overrides: Partial<VitalSign> = {}): VitalSign {
  return {
    id: 'urn:uuid:test-vital-1',
    type: 'VitalSign',
    dataProvenance: 'ClinicalGenerated',
    schemaVersion: '1.3',
    vitalType: 'heartRate',
    value: 72,
    unit: 'bpm',
    ...overrides,
  };
}

function makeAllergy(overrides: Partial<Allergy> = {}): Allergy {
  return {
    id: 'urn:uuid:test-allergy-1',
    type: 'AllergyRecord',
    dataProvenance: 'ClinicalGenerated',
    schemaVersion: '1.3',
    allergen: 'Penicillin',
    ...overrides,
  };
}

function makeLabResult(overrides: Partial<LabResult> = {}): LabResult {
  return {
    id: 'urn:uuid:test-lab-1',
    type: 'LabResultRecord',
    dataProvenance: 'ClinicalGenerated',
    schemaVersion: '1.3',
    testName: 'Hemoglobin A1c',
    ...overrides,
  };
}

function makeImmunization(overrides: Partial<Immunization> = {}): Immunization {
  return {
    id: 'urn:uuid:test-imm-1',
    type: 'ImmunizationRecord',
    dataProvenance: 'ClinicalGenerated',
    schemaVersion: '1.3',
    vaccineName: 'COVID-19 Vaccine',
    ...overrides,
  };
}

function makeCoverage(overrides: Partial<Coverage> = {}): Coverage {
  return {
    id: 'urn:uuid:test-cov-1',
    type: 'CoverageRecord',
    dataProvenance: 'ClinicalGenerated',
    schemaVersion: '1.3',
    providerName: 'Blue Cross',
    ...overrides,
  };
}

function makePatientProfile(overrides: Partial<PatientProfile> = {}): PatientProfile {
  return {
    id: 'urn:uuid:test-patient-1',
    type: 'PatientProfile',
    dataProvenance: 'ClinicalGenerated',
    schemaVersion: '1.3',
    dateOfBirth: '1990-01-15',
    biologicalSex: 'male',
    ...overrides,
  };
}

function makeActivitySnapshot(overrides: Partial<ActivitySnapshot> = {}): ActivitySnapshot {
  return {
    id: 'urn:uuid:test-activity-1',
    type: 'ActivitySnapshot',
    dataProvenance: 'DeviceGenerated',
    schemaVersion: '1.3',
    date: '2026-02-21',
    steps: 8000,
    ...overrides,
  };
}

function makeSleepSnapshot(overrides: Partial<SleepSnapshot> = {}): SleepSnapshot {
  return {
    id: 'urn:uuid:test-sleep-1',
    type: 'SleepSnapshot',
    dataProvenance: 'DeviceGenerated',
    schemaVersion: '1.3',
    date: '2026-02-21',
    totalSleepMinutes: 420,
    ...overrides,
  };
}

function makeProcedure(overrides: Partial<Procedure> = {}): Procedure {
  return {
    id: 'urn:uuid:test-proc-1',
    type: 'ProcedureRecord',
    dataProvenance: 'ClinicalGenerated',
    schemaVersion: '1.3',
    procedureName: 'Appendectomy',
    ...overrides,
  };
}

function makeFamilyHistory(overrides: Partial<FamilyHistory> = {}): FamilyHistory {
  return {
    id: 'urn:uuid:test-fam-1',
    type: 'FamilyHistoryRecord',
    dataProvenance: 'ClinicalGenerated',
    schemaVersion: '1.3',
    relationship: 'Mother',
    conditionName: 'Type 2 Diabetes',
    ...overrides,
  };
}

// ─── Helper ──────────────────────────────────────────────────────────────────

/** Find a PodFile by path in an array, or fail. */
function findFile(files: PodFile[], path: string): PodFile {
  const file = files.find((f) => f.path === path);
  if (!file) {
    throw new Error(
      `Expected file "${path}" not found. Available: ${files.map((f) => f.path).join(', ')}`,
    );
  }
  return file;
}

/** Return the set of file paths from a build result. */
function filePaths(files: PodFile[]): string[] {
  return files.map((f) => f.path);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Pod Builder', () => {
  describe('Single record pods', () => {
    it('builds a pod with one medication record', () => {
      const builder = new PodBuilder({ title: 'Test Pod' });
      builder.addMedication(makeMedication());
      const files = builder.build();

      const paths = filePaths(files);
      expect(paths).toContain('clinical/medications.ttl');
      expect(paths).toContain('index.ttl');

      const medFile = findFile(files, 'clinical/medications.ttl');
      expect(medFile.content).toContain('clinical:Medication');
      expect(medFile.content).toContain('urn:uuid:test-med-1');
      expect(medFile.content).toContain('Aspirin');
    });

    it('builds a pod with one condition record', () => {
      const builder = new PodBuilder({ title: 'Test Pod' });
      builder.addCondition(makeCondition());
      const files = builder.build();

      const paths = filePaths(files);
      expect(paths).toContain('clinical/conditions.ttl');
      expect(paths).toContain('index.ttl');

      const condFile = findFile(files, 'clinical/conditions.ttl');
      expect(condFile.content).toContain('health:ConditionRecord');
      expect(condFile.content).toContain('urn:uuid:test-cond-1');
      expect(condFile.content).toContain('Hypertension');
    });

    it('builds a pod with one vital sign record', () => {
      const builder = new PodBuilder({ title: 'Test Pod' });
      builder.addVitalSign(makeVitalSign());
      const files = builder.build();

      const paths = filePaths(files);
      expect(paths).toContain('clinical/vital-signs.ttl');
      expect(paths).toContain('index.ttl');

      const vitalFile = findFile(files, 'clinical/vital-signs.ttl');
      expect(vitalFile.content).toContain('clinical:VitalSign');
      expect(vitalFile.content).toContain('urn:uuid:test-vital-1');
      expect(vitalFile.content).toContain('"heartRate"');
    });

    it('builds a pod with one procedure record', () => {
      const builder = new PodBuilder({ title: 'Test Pod' });
      builder.addProcedure(makeProcedure());
      const files = builder.build();

      const paths = filePaths(files);
      expect(paths).toContain('clinical/procedures.ttl');
      expect(paths).toContain('index.ttl');

      const procFile = findFile(files, 'clinical/procedures.ttl');
      expect(procFile.content).toContain('clinical:Procedure');
      expect(procFile.content).toContain('urn:uuid:test-proc-1');
      expect(procFile.content).toContain('Appendectomy');
    });

    it('builds a pod with one family history record', () => {
      const builder = new PodBuilder({ title: 'Test Pod' });
      builder.addFamilyHistory(makeFamilyHistory());
      const files = builder.build();

      const paths = filePaths(files);
      expect(paths).toContain('clinical/family-history.ttl');
      expect(paths).toContain('index.ttl');

      const famFile = findFile(files, 'clinical/family-history.ttl');
      expect(famFile.content).toContain('health:FamilyHistoryRecord');
      expect(famFile.content).toContain('urn:uuid:test-fam-1');
      expect(famFile.content).toContain('Type 2 Diabetes');
    });
  });

  describe('Full health profile pods', () => {
    it('builds a pod with a complete HealthProfile', () => {
      const profile: HealthProfile = {
        patientProfile: makePatientProfile(),
        medications: [makeMedication()],
        conditions: [makeCondition()],
        allergies: [makeAllergy()],
        labResults: [makeLabResult()],
        vitalSigns: [
          makeVitalSign(),
          makeVitalSign({
            id: 'urn:uuid:test-vital-device',
            dataProvenance: 'DeviceGenerated',
            vitalType: 'heartRate',
            value: 68,
          }),
        ],
        immunizations: [makeImmunization()],
        procedures: [makeProcedure()],
        familyHistory: [makeFamilyHistory()],
        coverage: [makeCoverage()],
        activitySnapshots: [makeActivitySnapshot()],
        sleepSnapshots: [makeSleepSnapshot()],
      };

      const builder = new PodBuilder({ title: 'Full Profile Pod' });
      builder.addHealthProfile(profile);
      const files = builder.build();
      const paths = filePaths(files);

      expect(paths).toContain('clinical/medications.ttl');
      expect(paths).toContain('clinical/conditions.ttl');
      expect(paths).toContain('clinical/allergies.ttl');
      expect(paths).toContain('clinical/lab-results.ttl');
      expect(paths).toContain('clinical/vital-signs.ttl');
      expect(paths).toContain('clinical/immunizations.ttl');
      expect(paths).toContain('clinical/procedures.ttl');
      expect(paths).toContain('clinical/family-history.ttl');
      expect(paths).toContain('clinical/insurance.ttl');
      expect(paths).toContain('clinical/patient-profile.ttl');
      expect(paths).toContain('wellness/vital-signs.ttl');
      expect(paths).toContain('wellness/activity.ttl');
      expect(paths).toContain('wellness/sleep.ttl');
      expect(paths).toContain('index.ttl');
    });

    it('includes patient-profile.ttl when PatientProfile is present', () => {
      const profile: HealthProfile = {
        patientProfile: makePatientProfile(),
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

      const builder = new PodBuilder({ title: 'Profile Pod' });
      builder.addHealthProfile(profile);
      const files = builder.build();
      const paths = filePaths(files);

      expect(paths).toContain('clinical/patient-profile.ttl');

      const profileFile = findFile(files, 'clinical/patient-profile.ttl');
      expect(profileFile.content).toContain('cascade:PatientProfile');
      expect(profileFile.content).toContain('1990-01-15');
    });

    it('includes medications.ttl when medications are present', () => {
      const profile: HealthProfile = {
        medications: [makeMedication()],
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

      const builder = new PodBuilder({ title: 'Med Pod' });
      builder.addHealthProfile(profile);
      const files = builder.build();
      const paths = filePaths(files);

      expect(paths).toContain('clinical/medications.ttl');
      expect(paths).not.toContain('clinical/conditions.ttl');
      expect(paths).not.toContain('clinical/allergies.ttl');
    });

    it('includes conditions.ttl when conditions are present', () => {
      const profile: HealthProfile = {
        medications: [],
        conditions: [makeCondition()],
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

      const builder = new PodBuilder({ title: 'Cond Pod' });
      builder.addHealthProfile(profile);
      const files = builder.build();
      const paths = filePaths(files);

      expect(paths).toContain('clinical/conditions.ttl');
      expect(paths).not.toContain('clinical/medications.ttl');
    });
  });

  describe('Index generation', () => {
    it('generates index.ttl with ldp:BasicContainer type', () => {
      const builder = new PodBuilder({ title: 'Index Test' });
      builder.addMedication(makeMedication());
      const files = builder.build();

      const indexFile = findFile(files, 'index.ttl');
      expect(indexFile.content).toContain('ldp:BasicContainer');
      expect(indexFile.content).toContain('<> a ldp:BasicContainer');
    });

    it('index.ttl contains ldp:contains for each resource file', () => {
      const builder = new PodBuilder({ title: 'Index Test' });
      builder.addMedication(makeMedication());
      builder.addCondition(makeCondition());
      builder.addActivitySnapshot(makeActivitySnapshot());
      const files = builder.build();

      const indexFile = findFile(files, 'index.ttl');
      expect(indexFile.content).toContain('ldp:contains');
      expect(indexFile.content).toContain('<clinical/medications.ttl>');
      expect(indexFile.content).toContain('<clinical/conditions.ttl>');
      expect(indexFile.content).toContain('<wellness/activity.ttl>');
      // index.ttl should NOT list itself
      expect(indexFile.content).not.toContain('<index.ttl>');
    });

    it('index.ttl includes dcterms:title and dcterms:created', () => {
      const builder = new PodBuilder({ title: 'My Health Pod' });
      builder.addMedication(makeMedication());
      const files = builder.build();

      const indexFile = findFile(files, 'index.ttl');
      expect(indexFile.content).toContain('dcterms:title "My Health Pod"');
      expect(indexFile.content).toContain('dcterms:created');
      expect(indexFile.content).toContain('xsd:dateTime');
    });
  });

  describe('File grouping', () => {
    it('medications go to clinical/medications.ttl', () => {
      const builder = new PodBuilder({ title: 'Test' });
      builder.addMedication(makeMedication());
      const files = builder.build();

      const medFile = findFile(files, 'clinical/medications.ttl');
      expect(medFile.content).toContain('clinical:Medication');
    });

    it('conditions go to clinical/conditions.ttl', () => {
      const builder = new PodBuilder({ title: 'Test' });
      builder.addCondition(makeCondition());
      const files = builder.build();

      const condFile = findFile(files, 'clinical/conditions.ttl');
      expect(condFile.content).toContain('health:ConditionRecord');
    });

    it('allergies go to clinical/allergies.ttl', () => {
      const builder = new PodBuilder({ title: 'Test' });
      builder.addAllergy(makeAllergy());
      const files = builder.build();

      const allergyFile = findFile(files, 'clinical/allergies.ttl');
      expect(allergyFile.content).toContain('health:AllergyRecord');
      expect(allergyFile.content).toContain('Penicillin');
    });

    it('lab results go to clinical/lab-results.ttl', () => {
      const builder = new PodBuilder({ title: 'Test' });
      builder.addLabResult(makeLabResult());
      const files = builder.build();

      const labFile = findFile(files, 'clinical/lab-results.ttl');
      expect(labFile.content).toContain('health:LabResultRecord');
      expect(labFile.content).toContain('Hemoglobin A1c');
    });

    it('vital signs go to clinical/vital-signs.ttl', () => {
      const builder = new PodBuilder({ title: 'Test' });
      builder.addVitalSign(makeVitalSign({ dataProvenance: 'ClinicalGenerated' }));
      const files = builder.build();

      const vitalFile = findFile(files, 'clinical/vital-signs.ttl');
      expect(vitalFile.content).toContain('clinical:VitalSign');
    });

    it('immunizations go to clinical/immunizations.ttl', () => {
      const builder = new PodBuilder({ title: 'Test' });
      builder.addImmunization(makeImmunization());
      const files = builder.build();

      const immFile = findFile(files, 'clinical/immunizations.ttl');
      expect(immFile.content).toContain('health:ImmunizationRecord');
      expect(immFile.content).toContain('COVID-19 Vaccine');
    });

    it('procedures go to clinical/procedures.ttl', () => {
      const builder = new PodBuilder({ title: 'Test' });
      builder.addProcedure(makeProcedure());
      const files = builder.build();

      const procFile = findFile(files, 'clinical/procedures.ttl');
      expect(procFile.content).toContain('clinical:Procedure');
      expect(procFile.content).toContain('Appendectomy');
    });

    it('family history goes to clinical/family-history.ttl', () => {
      const builder = new PodBuilder({ title: 'Test' });
      builder.addFamilyHistory(makeFamilyHistory());
      const files = builder.build();

      const famFile = findFile(files, 'clinical/family-history.ttl');
      expect(famFile.content).toContain('health:FamilyHistoryRecord');
      expect(famFile.content).toContain('Type 2 Diabetes');
    });

    it('coverage records go to clinical/insurance.ttl', () => {
      const builder = new PodBuilder({ title: 'Test' });
      builder.addCoverage(makeCoverage());
      const files = builder.build();

      const covFile = findFile(files, 'clinical/insurance.ttl');
      expect(covFile.content).toContain('clinical:CoverageRecord');
      expect(covFile.content).toContain('Blue Cross');
    });

    it('patient profile goes to clinical/patient-profile.ttl', () => {
      const builder = new PodBuilder({ title: 'Test' });
      builder.addPatientProfile(makePatientProfile());
      const files = builder.build();

      const profileFile = findFile(files, 'clinical/patient-profile.ttl');
      expect(profileFile.content).toContain('cascade:PatientProfile');
      expect(profileFile.content).toContain('1990-01-15');
    });

    it('activity snapshots go to wellness/activity.ttl', () => {
      const builder = new PodBuilder({ title: 'Test' });
      builder.addActivitySnapshot(makeActivitySnapshot());
      const files = builder.build();

      const activityFile = findFile(files, 'wellness/activity.ttl');
      expect(activityFile.content).toContain('health:ActivitySnapshot');
      expect(activityFile.content).toContain('2026-02-21');
    });

    it('sleep snapshots go to wellness/sleep.ttl', () => {
      const builder = new PodBuilder({ title: 'Test' });
      builder.addSleepSnapshot(makeSleepSnapshot());
      const files = builder.build();

      const sleepFile = findFile(files, 'wellness/sleep.ttl');
      expect(sleepFile.content).toContain('health:SleepSnapshot');
      expect(sleepFile.content).toContain('2026-02-21');
    });
  });

  describe('Manifest generation', () => {
    it('generates manifest with correct title and schemaVersion', () => {
      const builder = new PodBuilder({
        title: 'Manifest Test',
        description: 'A test pod',
        schemaVersion: '1.3',
      });
      builder.addMedication(makeMedication());
      const manifest = builder.buildManifest();

      expect(manifest.title).toBe('Manifest Test');
      expect(manifest.description).toBe('A test pod');
      expect(manifest.schemaVersion).toBe('1.3');
    });

    it('manifest files list excludes index.ttl', () => {
      const builder = new PodBuilder({ title: 'Manifest Test' });
      builder.addMedication(makeMedication());
      builder.addCondition(makeCondition());
      const manifest = builder.buildManifest();

      expect(manifest.files).toContain('clinical/medications.ttl');
      expect(manifest.files).toContain('clinical/conditions.ttl');
      expect(manifest.files).not.toContain('index.ttl');
    });

    it('manifest created is a valid ISO 8601 date string', () => {
      const builder = new PodBuilder({ title: 'Manifest Test' });
      builder.addMedication(makeMedication());
      const manifest = builder.buildManifest();

      // Should parse as a valid date
      const date = new Date(manifest.created);
      expect(date.getTime()).not.toBeNaN();
      // ISO 8601 format check
      expect(manifest.created).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('VitalSign provenance-based routing', () => {
    it('routes ClinicalGenerated vital signs to clinical/vital-signs.ttl', () => {
      const builder = new PodBuilder({ title: 'Provenance Test' });
      builder.addVitalSign(makeVitalSign({ dataProvenance: 'ClinicalGenerated' }));
      const files = builder.build();
      const paths = filePaths(files);

      expect(paths).toContain('clinical/vital-signs.ttl');
      expect(paths).not.toContain('wellness/vital-signs.ttl');
    });

    it('routes DeviceGenerated vital signs to wellness/vital-signs.ttl', () => {
      const builder = new PodBuilder({ title: 'Provenance Test' });
      builder.addVitalSign(makeVitalSign({
        id: 'urn:uuid:test-vital-device',
        dataProvenance: 'DeviceGenerated',
      }));
      const files = builder.build();
      const paths = filePaths(files);

      expect(paths).toContain('wellness/vital-signs.ttl');
      expect(paths).not.toContain('clinical/vital-signs.ttl');
    });

    it('routes SelfReported vital signs to clinical/vital-signs.ttl', () => {
      const builder = new PodBuilder({ title: 'Provenance Test' });
      builder.addVitalSign(makeVitalSign({ dataProvenance: 'SelfReported' }));
      const files = builder.build();
      const paths = filePaths(files);

      expect(paths).toContain('clinical/vital-signs.ttl');
      expect(paths).not.toContain('wellness/vital-signs.ttl');
    });

    it('routes EHRVerified vital signs to clinical/vital-signs.ttl', () => {
      const builder = new PodBuilder({ title: 'Provenance Test' });
      builder.addVitalSign(makeVitalSign({ dataProvenance: 'EHRVerified' }));
      const files = builder.build();
      const paths = filePaths(files);

      expect(paths).toContain('clinical/vital-signs.ttl');
      expect(paths).not.toContain('wellness/vital-signs.ttl');
    });

    it('splits mixed-provenance vital signs into separate files', () => {
      const builder = new PodBuilder({ title: 'Split Provenance Test' });
      builder.addVitalSign(makeVitalSign({
        id: 'urn:uuid:clinical-vital',
        dataProvenance: 'ClinicalGenerated',
        vitalType: 'bloodPressureSystolic',
        value: 120,
        unit: 'mmHg',
      }));
      builder.addVitalSign(makeVitalSign({
        id: 'urn:uuid:device-vital',
        dataProvenance: 'DeviceGenerated',
        vitalType: 'heartRate',
        value: 68,
        unit: 'bpm',
      }));
      const files = builder.build();
      const paths = filePaths(files);

      expect(paths).toContain('clinical/vital-signs.ttl');
      expect(paths).toContain('wellness/vital-signs.ttl');

      const clinicalFile = findFile(files, 'clinical/vital-signs.ttl');
      expect(clinicalFile.content).toContain('urn:uuid:clinical-vital');
      expect(clinicalFile.content).not.toContain('urn:uuid:device-vital');

      const wellnessFile = findFile(files, 'wellness/vital-signs.ttl');
      expect(wellnessFile.content).toContain('urn:uuid:device-vital');
      expect(wellnessFile.content).not.toContain('urn:uuid:clinical-vital');
    });
  });

  describe('Turtle merge behavior', () => {
    it('merges multiple medications into a single file with deduplicated prefixes', () => {
      const builder = new PodBuilder({ title: 'Merge Test' });
      builder.addMedication(makeMedication({
        id: 'urn:uuid:med-1',
        medicationName: 'Aspirin',
      }));
      builder.addMedication(makeMedication({
        id: 'urn:uuid:med-2',
        medicationName: 'Lisinopril',
      }));
      const files = builder.build();

      // Should be a single medications file, not two
      const medFiles = files.filter((f) => f.path === 'clinical/medications.ttl');
      expect(medFiles).toHaveLength(1);

      const content = medFiles[0]!.content;

      // Both records should be present
      expect(content).toContain('urn:uuid:med-1');
      expect(content).toContain('urn:uuid:med-2');
      expect(content).toContain('Aspirin');
      expect(content).toContain('Lisinopril');

      // Prefixes should not be duplicated: count occurrences of @prefix cascade:
      const cascadePrefixMatches = content.match(/@prefix cascade:/g);
      expect(cascadePrefixMatches).toHaveLength(1);

      // clinical: prefix should also appear only once
      const clinicalPrefixMatches = content.match(/@prefix clinical:/g);
      expect(clinicalPrefixMatches).toHaveLength(1);
    });

    it('merges multiple conditions into a single file', () => {
      const builder = new PodBuilder({ title: 'Merge Test' });
      builder.addCondition(makeCondition({
        id: 'urn:uuid:cond-1',
        conditionName: 'Hypertension',
      }));
      builder.addCondition(makeCondition({
        id: 'urn:uuid:cond-2',
        conditionName: 'Diabetes Type 2',
      }));
      const files = builder.build();

      const condFile = findFile(files, 'clinical/conditions.ttl');
      expect(condFile.content).toContain('Hypertension');
      expect(condFile.content).toContain('Diabetes Type 2');
      expect(condFile.content).toContain('urn:uuid:cond-1');
      expect(condFile.content).toContain('urn:uuid:cond-2');
    });

    it('preserves all record bodies after merging', () => {
      const builder = new PodBuilder({ title: 'Body Merge Test' });
      builder.addMedication(makeMedication({
        id: 'urn:uuid:med-a',
        medicationName: 'Drug A',
        isActive: true,
      }));
      builder.addMedication(makeMedication({
        id: 'urn:uuid:med-b',
        medicationName: 'Drug B',
        isActive: false,
      }));
      const files = builder.build();
      const content = findFile(files, 'clinical/medications.ttl').content;

      // Both record URIs and their type declarations should be present
      expect(content).toContain('<urn:uuid:med-a>');
      expect(content).toContain('<urn:uuid:med-b>');
      expect(content).toContain('"Drug A"');
      expect(content).toContain('"Drug B"');
    });
  });

  describe('Index file format', () => {
    it('includes LDP and dcterms prefix declarations', () => {
      const builder = new PodBuilder({ title: 'Prefix Test' });
      builder.addMedication(makeMedication());
      const files = builder.build();
      const index = findFile(files, 'index.ttl');

      expect(index.content).toContain('@prefix ldp:');
      expect(index.content).toContain('@prefix dcterms:');
      expect(index.content).toContain('@prefix cascade:');
      expect(index.content).toContain('@prefix xsd:');
    });

    it('includes schemaVersion in the index', () => {
      const builder = new PodBuilder({ title: 'Version Test', schemaVersion: '1.3' });
      builder.addMedication(makeMedication());
      const files = builder.build();
      const index = findFile(files, 'index.ttl');

      expect(index.content).toContain('cascade:schemaVersion "1.3"');
    });

    it('defaults schemaVersion to 1.3 when not specified', () => {
      const builder = new PodBuilder({ title: 'Default Version' });
      builder.addMedication(makeMedication());
      const files = builder.build();
      const index = findFile(files, 'index.ttl');

      expect(index.content).toContain('cascade:schemaVersion "1.3"');
    });

    it('lists single file with ldp:contains on same line', () => {
      const builder = new PodBuilder({ title: 'Single File Index' });
      builder.addMedication(makeMedication());
      const files = builder.build();
      const index = findFile(files, 'index.ttl');

      // With a single data file, ldp:contains should be on a single line with period
      expect(index.content).toContain('ldp:contains <clinical/medications.ttl> .');
    });

    it('lists multiple files with comma-separated ldp:contains', () => {
      const builder = new PodBuilder({ title: 'Multi File Index' });
      builder.addMedication(makeMedication());
      builder.addCondition(makeCondition());
      const files = builder.build();
      const index = findFile(files, 'index.ttl');

      // With multiple data files, should use comma-separated list
      expect(index.content).toContain('ldp:contains');
      expect(index.content).toContain('<clinical/medications.ttl>');
      expect(index.content).toContain('<clinical/conditions.ttl>');
    });

    it('escapes special characters in title', () => {
      const builder = new PodBuilder({ title: 'My "Special" Pod' });
      builder.addMedication(makeMedication());
      const files = builder.build();
      const index = findFile(files, 'index.ttl');

      // Double quotes in the title should be escaped
      expect(index.content).toContain('My \\"Special\\" Pod');
    });
  });

  describe('Edge cases', () => {
    it('builds a pod with no records (only index.ttl)', () => {
      const builder = new PodBuilder({ title: 'Empty Pod' });
      const files = builder.build();

      expect(files).toHaveLength(1);
      expect(files[0]!.path).toBe('index.ttl');
      expect(files[0]!.content).toContain('ldp:BasicContainer');
      // No ldp:contains when there are no data files
      expect(files[0]!.content).not.toContain('ldp:contains');
    });

    it('manifest for empty pod has empty files array', () => {
      const builder = new PodBuilder({ title: 'Empty Pod' });
      const manifest = builder.buildManifest();

      expect(manifest.files).toHaveLength(0);
      expect(manifest.title).toBe('Empty Pod');
    });

    it('builder methods return this for chaining', () => {
      const builder = new PodBuilder({ title: 'Chain Test' });
      const result = builder
        .addMedication(makeMedication())
        .addCondition(makeCondition())
        .addAllergy(makeAllergy())
        .addLabResult(makeLabResult())
        .addVitalSign(makeVitalSign())
        .addImmunization(makeImmunization())
        .addCoverage(makeCoverage())
        .addPatientProfile(makePatientProfile())
        .addActivitySnapshot(makeActivitySnapshot())
        .addSleepSnapshot(makeSleepSnapshot());

      expect(result).toBe(builder);
    });

    it('manifest defaults schemaVersion to 1.3 when not specified', () => {
      const builder = new PodBuilder({ title: 'Default Schema' });
      builder.addMedication(makeMedication());
      const manifest = builder.buildManifest();

      expect(manifest.schemaVersion).toBe('1.3');
    });

    it('manifest description is undefined when not provided', () => {
      const builder = new PodBuilder({ title: 'No Desc' });
      builder.addMedication(makeMedication());
      const manifest = builder.buildManifest();

      expect(manifest.description).toBeUndefined();
    });

    it('index.ttl is always the last file in the build output', () => {
      const builder = new PodBuilder({ title: 'Order Test' });
      builder.addMedication(makeMedication());
      builder.addActivitySnapshot(makeActivitySnapshot());
      const files = builder.build();

      expect(files[files.length - 1]!.path).toBe('index.ttl');
    });
  });
});
