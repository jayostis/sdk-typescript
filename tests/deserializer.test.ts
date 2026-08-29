/**
 * Tests for the Turtle deserializer.
 *
 * For each conformance fixture, serializes the input to Turtle, then
 * deserializes it back and verifies round-trip fidelity.
 * Also tests edge cases and parser robustness.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { serialize } from '../src/serializer/turtle-serializer.js';
import { deserialize, deserializeOne } from '../src/deserializer/turtle-parser.js';
import type { CascadeRecord } from '../src/models/common.js';
import type { Medication } from '../src/models/medication.js';
import type { Condition } from '../src/models/condition.js';
import type { Allergy } from '../src/models/allergy.js';
import type { LabResult } from '../src/models/lab-result.js';
import type { VitalSign } from '../src/models/vital-sign.js';
import type { Immunization } from '../src/models/immunization.js';
import type { Coverage } from '../src/models/coverage.js';
import type { PatientProfile } from '../src/models/patient-profile.js';
import { cascade, parseTurtle } from './support/graph.js';

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
 * Map from fixture dataType to the type string used by deserialize().
 */
const DATA_TYPE_TO_RECORD_TYPE: Record<string, string> = {
  Medication: 'MedicationRecord',
  Condition: 'ConditionRecord',
  Allergy: 'AllergyRecord',
  LabResult: 'LabResultRecord',
  VitalSign: 'VitalSign',
  Immunization: 'ImmunizationRecord',
  Procedure: 'ProcedureRecord',
  FamilyHistory: 'FamilyHistoryRecord',
  Coverage: 'CoverageRecord',
  PatientProfile: 'PatientProfile',
  ActivitySnapshot: 'ActivitySnapshot',
  SleepSnapshot: 'SleepSnapshot',
};

// Fields that don't survive round-trip because they're not in the
// reverse predicate map or have different representations.
const SKIP_ROUND_TRIP_FIELDS = new Set([
  'type', // reconstructed from rdf:type
]);

// ─── Round-Trip Tests ───────────────────────────────────────────────────────

describe('Turtle Deserializer', () => {
  describe('Medication round-trip', () => {
    const fixtures = loadFixturesByPrefix('med-');

    for (const fixture of fixtures) {
      it(`${fixture.id}: serialize -> deserialize round-trip`, () => {
        const input = fixture.input as unknown as CascadeRecord;
        const turtle = serialize(input);
        const recordType = DATA_TYPE_TO_RECORD_TYPE[fixture.dataType];
        if (!recordType) return; // skip non-serializable types

        const results = deserialize<Medication>(turtle, recordType);
        expect(results.length).toBe(1);

        const result = results[0]!;
        expect(result.id).toBe(input.id);
        expect(result.medicationName).toBe(input.medicationName);
        expect(result.dataProvenance).toBe(input.dataProvenance);
        expect(result.schemaVersion).toBe(input.schemaVersion);

        if (input.isActive !== undefined) {
          expect(result.isActive).toBe(input.isActive);
        }
        if (input.dose !== undefined) {
          expect(result.dose).toBe(input.dose);
        }
      });
    }
  });

  describe('Condition round-trip', () => {
    const fixtures = loadFixturesByPrefix('cond-');

    for (const fixture of fixtures) {
      it(`${fixture.id}: serialize -> deserialize round-trip`, () => {
        const input = fixture.input as unknown as CascadeRecord;
        const turtle = serialize(input);
        const recordType = DATA_TYPE_TO_RECORD_TYPE[fixture.dataType];
        if (!recordType) return;

        const results = deserialize<Condition>(turtle, recordType);
        expect(results.length).toBe(1);

        const result = results[0]!;
        expect(result.id).toBe(input.id);
        expect(result.conditionName).toBe(input.conditionName);
        expect(result.dataProvenance).toBe(input.dataProvenance);
      });
    }
  });

  describe('Allergy round-trip', () => {
    const fixtures = loadFixturesByPrefix('allergy-');

    for (const fixture of fixtures) {
      it(`${fixture.id}: serialize -> deserialize round-trip`, () => {
        const input = fixture.input as unknown as CascadeRecord;
        const turtle = serialize(input);
        const recordType = DATA_TYPE_TO_RECORD_TYPE[fixture.dataType];
        if (!recordType) return;

        const results = deserialize<Allergy>(turtle, recordType);
        expect(results.length).toBe(1);

        const result = results[0]!;
        expect(result.id).toBe(input.id);
        expect(result.allergen).toBe(input.allergen);
        expect(result.dataProvenance).toBe(input.dataProvenance);
      });
    }
  });

  describe('Lab result round-trip', () => {
    const fixtures = loadFixturesByPrefix('lab-');

    for (const fixture of fixtures) {
      it(`${fixture.id}: serialize -> deserialize round-trip`, () => {
        const input = fixture.input as unknown as CascadeRecord;
        const turtle = serialize(input);
        const recordType = DATA_TYPE_TO_RECORD_TYPE[fixture.dataType];
        if (!recordType) return;

        const results = deserialize<LabResult>(turtle, recordType);
        expect(results.length).toBe(1);

        const result = results[0]!;
        expect(result.id).toBe(input.id);
        expect(result.testName).toBe(input.testName);
        expect(result.dataProvenance).toBe(input.dataProvenance);
      });
    }
  });

  describe('Vital sign round-trip', () => {
    const fixtures = loadFixturesByPrefix('vital-');

    for (const fixture of fixtures) {
      it(`${fixture.id}: serialize -> deserialize round-trip`, () => {
        const input = fixture.input as unknown as CascadeRecord;
        const turtle = serialize(input);
        const recordType = DATA_TYPE_TO_RECORD_TYPE[fixture.dataType];
        if (!recordType) return;

        const results = deserialize<VitalSign>(turtle, recordType);
        expect(results.length).toBe(1);

        const result = results[0]!;
        expect(result.id).toBe(input.id);
        expect(result.vitalType).toBe(input.vitalType);
        expect(result.value).toBe(input.value);
        expect(result.unit).toBe(input.unit);
        expect(result.dataProvenance).toBe(input.dataProvenance);
      });
    }
  });

  describe('Immunization round-trip', () => {
    const fixtures = loadFixturesByPrefix('imm-');

    for (const fixture of fixtures) {
      it(`${fixture.id}: serialize -> deserialize round-trip`, () => {
        const input = fixture.input as unknown as CascadeRecord;
        const turtle = serialize(input);
        const recordType = DATA_TYPE_TO_RECORD_TYPE[fixture.dataType];
        if (!recordType) return;

        const results = deserialize<Immunization>(turtle, recordType);
        expect(results.length).toBe(1);

        const result = results[0]!;
        expect(result.id).toBe(input.id);
        expect(result.vaccineName).toBe(input.vaccineName);
        expect(result.dataProvenance).toBe(input.dataProvenance);
      });
    }
  });

  describe('Coverage round-trip', () => {
    const fixtures = loadFixturesByPrefix('coverage-');

    for (const fixture of fixtures) {
      it(`${fixture.id}: serialize -> deserialize round-trip`, () => {
        const input = fixture.input as unknown as CascadeRecord;
        const turtle = serialize(input);
        const recordType = DATA_TYPE_TO_RECORD_TYPE[fixture.dataType];
        if (!recordType) return;

        const results = deserialize<Coverage>(turtle, recordType);
        expect(results.length).toBe(1);

        const result = results[0]!;
        expect(result.id).toBe(input.id);
        expect(result.providerName).toBe(input.providerName);
        expect(result.dataProvenance).toBe(input.dataProvenance);
      });
    }
  });

  describe('Patient profile round-trip', () => {
    const fixtures = loadFixturesByPrefix('profile-');

    for (const fixture of fixtures) {
      it(`${fixture.id}: serialize -> deserialize round-trip`, () => {
        const input = fixture.input as unknown as CascadeRecord;
        const turtle = serialize(input);
        const recordType = DATA_TYPE_TO_RECORD_TYPE[fixture.dataType];
        if (!recordType) return;

        const results = deserialize<PatientProfile>(turtle, recordType);
        expect(results.length).toBe(1);

        const result = results[0]!;
        expect(result.id).toBe(input.id);
        expect(result.dataProvenance).toBe(input.dataProvenance);

        if (input.name !== undefined) {
          expect(result.name).toBe(input.name);
        }
      });
    }
  });

  describe('a nested predicate no ontology declares', () => {
    // `cascade:contactEmail` is not vocabulary. `grep -rn contactEmail spec/`
    // returns one prose aside in `ontologies/checkup/v1/checkup.ttl`;
    // `core/v1/core.ttl` declares `contactName`, `contactRelationship` and
    // `contactPhone` on `cascade:EmergencyContact` and nothing else, its
    // rdfs:comment names exactly those three, `cascade:EmergencyContactShape`
    // has no `sh:path` for an email, and no context in `spec/contexts/`
    // defines the term.
    //
    // Resolving one on read is not a harmless kindness, which is why this is
    // asserted rather than left to the reverse map: `childrenOf` writes every
    // key of the rebuilt object straight back out, so a pod carrying the
    // non-standard triple would round-trip into a document where THIS SDK
    // emits a predicate with no domain, no range and no shape.
    const profileWithContactEmail = `
@prefix cascade: <https://ns.cascadeprotocol.org/core/v1#> .

<urn:uuid:profile-contact-email> a cascade:PatientProfile ;
    cascade:schemaVersion "2.0" ;
    cascade:emergencyContact [
        a cascade:EmergencyContact ;
        cascade:contactName "Maria Rivera" ;
        cascade:contactRelationship "spouse" ;
        cascade:contactPhone "555-0142" ;
        cascade:contactEmail "maria.rivera@example.org"
    ] .
`;

    it('is dropped rather than rebuilt as a key of the nested object', () => {
      const parsed = deserializeOne<PatientProfile>(profileWithContactEmail, 'PatientProfile');

      // The whole object, not just the absent key: the three declared children
      // have to survive the drop, or this would pass just as well on a reader
      // that lost the contact altogether.
      expect(parsed?.emergencyContact).toEqual({
        contactName: 'Maria Rivera',
        contactRelationship: 'spouse',
        contactPhone: '555-0142',
      });
    });

    it('is not written back out when the record it was read into is serialized', () => {
      const parsed = deserializeOne<PatientProfile>(profileWithContactEmail, 'PatientProfile');
      const contact = parseTurtle(serialize(parsed as unknown as CascadeRecord))
        .namedNode('urn:uuid:profile-contact-email')
        .out(cascade.emergencyContact);

      expect(contact.out(cascade.contactEmail).values).toEqual([]);
      expect(contact.out(cascade.contactPhone).values).toEqual(['555-0142']);
    });
  });

  // ─── Edge Cases ─────────────────────────────────────────────────────────

  describe('Edge cases', () => {
    it('returns empty array for empty string input', () => {
      const results = deserialize('', 'MedicationRecord');
      expect(results).toEqual([]);
    });

    it('returns empty array for Turtle with no matching type', () => {
      const turtle = `
@prefix health: <https://ns.cascadeprotocol.org/health/v1#> .
@prefix cascade: <https://ns.cascadeprotocol.org/core/v1#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<urn:uuid:test-001> a health:ConditionRecord ;
    health:conditionName "Test" ;
    cascade:dataProvenance cascade:SelfReported ;
    cascade:schemaVersion "1.3" .
`;
      const results = deserialize(turtle, 'MedicationRecord');
      expect(results).toEqual([]);
    });

    it('throws on unknown record type string', () => {
      expect(() => deserialize('', 'TotallyFakeType')).toThrow('Unknown record type');
    });

    it('correctly parses URIs with # characters (LOINC codes)', () => {
      const turtle = `
@prefix cascade: <https://ns.cascadeprotocol.org/core/v1#> .
@prefix clinical: <https://ns.cascadeprotocol.org/clinical/v1#> .
@prefix loinc: <http://loinc.org/rdf#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<urn:uuid:vs-test-001> a clinical:VitalSign ;
    clinical:vitalType "heartRate" ;
    clinical:value 72 ;
    clinical:unit "bpm" ;
    clinical:loincCode <http://loinc.org/rdf#8867-4> ;
    cascade:dataProvenance cascade:DeviceGenerated ;
    cascade:schemaVersion "1.3" .
`;
      const results = deserialize<VitalSign>(turtle, 'VitalSign');
      expect(results.length).toBe(1);
      expect(results[0]!.loincCode).toBe('http://loinc.org/rdf#8867-4');
    });

    it('correctly parses URIs with . characters (domain names)', () => {
      const turtle = `
@prefix cascade: <https://ns.cascadeprotocol.org/core/v1#> .
@prefix clinical: <https://ns.cascadeprotocol.org/clinical/v1#> .
@prefix health: <https://ns.cascadeprotocol.org/health/v1#> .
@prefix rxnorm: <http://www.nlm.nih.gov/research/umls/rxnorm/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<urn:uuid:med-test-001> a clinical:Medication ;
    clinical:drugName "Test Med" ;
    clinical:status true ;
    clinical:rxNormCode <http://www.nlm.nih.gov/research/umls/rxnorm/197884> ;
    cascade:dataProvenance cascade:ClinicalGenerated ;
    cascade:schemaVersion "1.3" .
`;
      const results = deserialize<Medication>(turtle, 'MedicationRecord');
      expect(results.length).toBe(1);
      expect(results[0]!.rxNormCode).toBe(
        'http://www.nlm.nih.gov/research/umls/rxnorm/197884',
      );
    });

    it('handles missing prefixes gracefully (falls back to well-known prefixes)', () => {
      // Minimal Turtle without some prefix declarations
      const turtle = `
@prefix cascade: <https://ns.cascadeprotocol.org/core/v1#> .
@prefix clinical: <https://ns.cascadeprotocol.org/clinical/v1#> .
@prefix health: <https://ns.cascadeprotocol.org/health/v1#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<urn:uuid:med-minimal> a clinical:Medication ;
    clinical:drugName "Aspirin" ;
    clinical:status true ;
    cascade:dataProvenance cascade:SelfReported ;
    cascade:schemaVersion "1.0" .
`;
      const results = deserialize<Medication>(turtle, 'MedicationRecord');
      expect(results.length).toBe(1);
      expect(results[0]!.medicationName).toBe('Aspirin');
    });
  });

  // ─── deserializeOne ───────────────────────────────────────────────────────

  describe('deserializeOne', () => {
    it('returns the first matching record', () => {
      const turtle = `
@prefix cascade: <https://ns.cascadeprotocol.org/core/v1#> .
@prefix clinical: <https://ns.cascadeprotocol.org/clinical/v1#> .
@prefix health: <https://ns.cascadeprotocol.org/health/v1#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<urn:uuid:med-one> a clinical:Medication ;
    clinical:drugName "TestMed" ;
    clinical:status true ;
    cascade:dataProvenance cascade:SelfReported ;
    cascade:schemaVersion "1.3" .
`;
      const result = deserializeOne<Medication>(turtle, 'MedicationRecord');
      expect(result).not.toBeNull();
      expect(result!.medicationName).toBe('TestMed');
    });

    it('returns null when no matching record is found', () => {
      const turtle = `
@prefix cascade: <https://ns.cascadeprotocol.org/core/v1#> .
@prefix health: <https://ns.cascadeprotocol.org/health/v1#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<urn:uuid:cond-one> a health:ConditionRecord ;
    health:conditionName "Test" ;
    cascade:dataProvenance cascade:SelfReported ;
    cascade:schemaVersion "1.3" .
`;
      const result = deserializeOne<Medication>(turtle, 'MedicationRecord');
      expect(result).toBeNull();
    });
  });
});
