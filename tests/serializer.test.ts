/**
 * Tests for the Turtle serializer.
 *
 * Loads each conformance fixture, serializes the input, and compares
 * against the expected Turtle output.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { serialize } from '../src/serializer/turtle-serializer.js';
import type { CascadeRecord } from '../src/models/common.js';

// ─── Fixture Loading ────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, '../../conformance/fixtures');

interface ConformanceFixture {
  id: string;
  description: string;
  dataType: string;
  vocabulary: string;
  input: Record<string, unknown>;
  expectedOutput: {
    turtle: string;
    validationMode: 'exact-match' | 'shacl-valid';
  };
  shouldAccept: boolean;
  tags: string[];
  notes: string;
}

function loadFixture(id: string): ConformanceFixture {
  const filePath = resolve(fixturesDir, `${id}.json`);
  const content = readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as ConformanceFixture;
}

function loadFixturesByPrefix(prefix: string): ConformanceFixture[] {
  const files = readdirSync(fixturesDir).filter(
    (f) => f.startsWith(prefix) && f.endsWith('.json'),
  );
  return files.map((f) => {
    const content = readFileSync(resolve(fixturesDir, f), 'utf-8');
    return JSON.parse(content) as ConformanceFixture;
  });
}

/**
 * The serializer handles standard Cascade record types (Medication, Condition, etc.)
 * but NOT pod-level structures (BasicContainer, ExportManifest) which require
 * a separate pod builder. Filter to only serializable types.
 */
const SERIALIZABLE_TYPES = new Set([
  'MedicationRecord',
  'ConditionRecord',
  'AllergyRecord',
  'LabResultRecord',
  'ImmunizationRecord',
  'VitalSign',
  'ProcedureRecord',
  'FamilyHistoryRecord',
  'CoverageRecord',
  'PatientProfile',
  'ActivitySnapshot',
  'SleepSnapshot',
]);

// ─── Medication Fixtures ────────────────────────────────────────────────────

describe('Turtle Serializer', () => {
  describe('Medication records', () => {
    const fixtures = loadFixturesByPrefix('med-');

    for (const fixture of fixtures) {
      it(`${fixture.id}: ${fixture.description}`, () => {
        const input = fixture.input as unknown as CascadeRecord;
        const result = serialize(input);

        if (fixture.expectedOutput.validationMode === 'exact-match') {
          expect(result).toBe(fixture.expectedOutput.turtle);
        } else {
          // shacl-valid: verify non-empty and contains expected prefixes
          expect(result.length).toBeGreaterThan(0);
          expect(result).toContain('@prefix');
          expect(result).toContain('clinical:Medication');
        }
      });
    }
  });

  describe('Condition records', () => {
    const fixtures = loadFixturesByPrefix('cond-');

    for (const fixture of fixtures) {
      it(`${fixture.id}: ${fixture.description}`, () => {
        const input = fixture.input as unknown as CascadeRecord;
        const result = serialize(input);

        if (fixture.expectedOutput.validationMode === 'exact-match') {
          expect(result).toBe(fixture.expectedOutput.turtle);
        } else {
          expect(result.length).toBeGreaterThan(0);
          expect(result).toContain('@prefix');
          expect(result).toContain('health:ConditionRecord');
        }
      });
    }
  });

  describe('Allergy records', () => {
    const fixtures = loadFixturesByPrefix('allergy-');

    for (const fixture of fixtures) {
      it(`${fixture.id}: ${fixture.description}`, () => {
        const input = fixture.input as unknown as CascadeRecord;
        const result = serialize(input);

        if (fixture.expectedOutput.validationMode === 'exact-match') {
          expect(result).toBe(fixture.expectedOutput.turtle);
        } else {
          expect(result.length).toBeGreaterThan(0);
          expect(result).toContain('@prefix');
          expect(result).toContain('health:AllergyRecord');
        }
      });
    }
  });

  describe('Lab result records', () => {
    const fixtures = loadFixturesByPrefix('lab-');

    for (const fixture of fixtures) {
      it(`${fixture.id}: ${fixture.description}`, () => {
        const input = fixture.input as unknown as CascadeRecord;
        const result = serialize(input);

        if (fixture.expectedOutput.validationMode === 'exact-match') {
          expect(result).toBe(fixture.expectedOutput.turtle);
        } else {
          expect(result.length).toBeGreaterThan(0);
          expect(result).toContain('@prefix');
          expect(result).toContain('health:LabResultRecord');
        }
      });
    }
  });

  describe('Vital sign records', () => {
    const fixtures = loadFixturesByPrefix('vital-');

    for (const fixture of fixtures) {
      it(`${fixture.id}: ${fixture.description}`, () => {
        const input = fixture.input as unknown as CascadeRecord;
        const result = serialize(input);

        if (fixture.expectedOutput.validationMode === 'exact-match') {
          expect(result).toBe(fixture.expectedOutput.turtle);
        } else {
          expect(result.length).toBeGreaterThan(0);
          expect(result).toContain('@prefix');
          expect(result).toContain('clinical:VitalSign');
        }
      });
    }
  });

  describe('Immunization records', () => {
    const fixtures = loadFixturesByPrefix('imm-');

    for (const fixture of fixtures) {
      it(`${fixture.id}: ${fixture.description}`, () => {
        const input = fixture.input as unknown as CascadeRecord;
        const result = serialize(input);

        if (fixture.expectedOutput.validationMode === 'exact-match') {
          expect(result).toBe(fixture.expectedOutput.turtle);
        } else {
          expect(result.length).toBeGreaterThan(0);
          expect(result).toContain('@prefix');
          expect(result).toContain('health:ImmunizationRecord');
        }
      });
    }
  });

  describe('Patient profile records', () => {
    const fixtures = loadFixturesByPrefix('profile-');

    for (const fixture of fixtures) {
      it(`${fixture.id}: ${fixture.description}`, () => {
        const input = fixture.input as unknown as CascadeRecord;
        const result = serialize(input);

        if (fixture.expectedOutput.validationMode === 'exact-match') {
          expect(result).toBe(fixture.expectedOutput.turtle);
        } else {
          expect(result.length).toBeGreaterThan(0);
          expect(result).toContain('@prefix');
          expect(result).toContain('cascade:PatientProfile');
        }
      });
    }
  });

  describe('Coverage records', () => {
    const fixtures = loadFixturesByPrefix('coverage-');

    for (const fixture of fixtures) {
      it(`${fixture.id}: ${fixture.description}`, () => {
        const input = fixture.input as unknown as CascadeRecord;
        const result = serialize(input);

        if (fixture.expectedOutput.validationMode === 'exact-match') {
          expect(result).toBe(fixture.expectedOutput.turtle);
        } else {
          expect(result.length).toBeGreaterThan(0);
          expect(result).toContain('@prefix');
          expect(result).toContain('clinical:CoverageRecord');
        }
      });
    }
  });

  describe('Procedure records', () => {
    const fixtures = loadFixturesByPrefix('proc-');

    for (const fixture of fixtures) {
      it(`${fixture.id}: ${fixture.description}`, () => {
        const input = fixture.input as unknown as CascadeRecord;
        const result = serialize(input);

        if (fixture.expectedOutput.validationMode === 'exact-match') {
          expect(result).toBe(fixture.expectedOutput.turtle);
        } else {
          expect(result.length).toBeGreaterThan(0);
          expect(result).toContain('@prefix');
          expect(result).toContain('clinical:Procedure');
        }
      });
    }
  });

  describe('Family history records', () => {
    const fixtures = loadFixturesByPrefix('fam-');

    for (const fixture of fixtures) {
      it(`${fixture.id}: ${fixture.description}`, () => {
        const input = fixture.input as unknown as CascadeRecord;
        const result = serialize(input);

        if (fixture.expectedOutput.validationMode === 'exact-match') {
          expect(result).toBe(fixture.expectedOutput.turtle);
        } else {
          expect(result.length).toBeGreaterThan(0);
          expect(result).toContain('@prefix');
          expect(result).toContain('health:FamilyHistoryRecord');
        }
      });
    }
  });

  describe('Specific fixture validation', () => {
    it('med-001: serializes Lisinopril with correct prefixes and fields', () => {
      const fixture = loadFixture('med-001');
      const result = serialize(fixture.input as unknown as CascadeRecord);

      expect(result).toContain('@prefix cascade:');
      expect(result).toContain('@prefix health:');
      expect(result).toContain('@prefix xsd:');
      expect(result).toContain('clinical:drugName "Lisinopril"');
      expect(result).toContain('clinical:status true');
      expect(result).toContain('cascade:dataProvenance cascade:ClinicalGenerated');
      expect(result).toContain('clinical:dosage "20 mg"');
      expect(result).toContain('health:startDate "2024-06-15T00:00:00Z"^^xsd:dateTime');
      expect(result).toContain('clinical:rxNormCode <http://www.nlm.nih.gov/research/umls/rxnorm/197884>');
    });

    it('vital-001: serializes vital sign with LOINC URI containing # character', () => {
      const fixture = loadFixture('vital-001');
      const result = serialize(fixture.input as unknown as CascadeRecord);

      expect(result).toContain('clinical:loincCode <http://loinc.org/rdf#8480-6>');
      expect(result).toContain('clinical:snomedCode <http://snomed.info/sct/271649006>');
      expect(result).toContain('clinical:value 134');
    });

    it('cond-001: serializes condition with RDF list for monitoredVitalSigns', () => {
      const fixture = loadFixture('cond-001');
      const result = serialize(fixture.input as unknown as CascadeRecord);

      expect(result).toContain('health:monitoredVitalSigns');
      expect(result).toContain('"bloodPressure"');
      expect(result).toContain('"heartRate"');
    });

    it('med-005: serializes medication with clinical enrichment fields and affectsVitalSigns list', () => {
      const fixture = loadFixture('med-005');
      const result = serialize(fixture.input as unknown as CascadeRecord);

      // affectsVitalSigns is serialized as an RDF list via the ARRAY_FIELDS path
      expect(result).toContain('health:affectsVitalSigns');
      expect(result).toContain('"respiratoryRate"');
      expect(result).toContain('"heartRate"');

      // Clinical enrichment fields are present
      expect(result).toContain('clinical:clinicalIntent "prescribed"');
      expect(result).toContain('clinical:asNeeded true');
      expect(result).toContain('clinical:medicationForm "inhaler"');
    });

    it('profile-001: serializes patient profile with xsd:date for dateOfBirth', () => {
      const fixture = loadFixture('profile-001');
      const result = serialize(fixture.input as unknown as CascadeRecord);

      expect(result).toContain('cascade:dateOfBirth "1973-08-15"^^xsd:date');
      expect(result).toContain('cascade:computedAge "52"^^xsd:integer');
      expect(result).toContain('foaf:name "Alex Rivera"');
    });

    it('coverage-001: serializes coverage with effectivePeriodStart as dateTime', () => {
      const fixture = loadFixture('coverage-001');
      const result = serialize(fixture.input as unknown as CascadeRecord);

      expect(result).toContain('clinical:effectivePeriodStart "2020-01-01T00:00:00Z"^^xsd:dateTime');
      expect(result).toContain('clinical:providerName "Blue Cross Blue Shield"');
    });
  });

  describe('Error handling', () => {
    it('throws on unknown record type', () => {
      expect(() =>
        serialize({
          id: 'urn:uuid:test',
          type: 'UnknownType',
          dataProvenance: 'SelfReported',
          schemaVersion: '1.0',
        }),
      ).toThrow('Unknown record type');
    });
  });
});
