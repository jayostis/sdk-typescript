/**
 * Tests for JSON-LD conversion (toJsonLd / fromJsonLd).
 *
 * For each conformance fixture input, converts to JSON-LD and back,
 * verifying round-trip fidelity and correct JSON-LD structure.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { toJsonLd, fromJsonLd, CONTEXT_URI, getContext } from '../src/jsonld/index.js';
import type { CascadeRecord } from '../src/models/common.js';
import type { Medication } from '../src/models/medication.js';
import type { VitalSign } from '../src/models/vital-sign.js';
import { serialize } from '../src/serializer/turtle-serializer.js';
import { NAMESPACES } from '../src/vocabularies/namespaces.js';
import { loadCascadeRecordFixture } from './support/fixtures.js';
import { coverage as coverageNs, parseTurtle } from './support/graph.js';

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
    validationMode: string;
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
 * Record types that can be serialized through the toJsonLd path
 * (must have a TYPE_MAPPING entry).
 */
const SERIALIZABLE_INPUT_TYPES = new Set([
  'MedicationRecord',
  'ConditionRecord',
  'AllergyRecord',
  'LabResultRecord',
  'ImmunizationRecord',
  'VitalSign',
  'ProcedureRecord',
  'FamilyHistoryRecord',
  'CoverageRecord',
  'InsurancePlan',
  'PatientProfile',
  'ActivitySnapshot',
  'SleepSnapshot',
]);

// ─── JSON-LD Round-Trip Tests ───────────────────────────────────────────────

describe('JSON-LD Conversion', () => {
  describe('Medication round-trip', () => {
    const fixtures = loadFixturesByPrefix('med-');

    for (const fixture of fixtures) {
      if (!SERIALIZABLE_INPUT_TYPES.has(fixture.input['type'] as string)) continue;

      it(`${fixture.id}: toJsonLd -> fromJsonLd round-trip`, () => {
        const input = fixture.input as unknown as CascadeRecord;
        const jsonld = toJsonLd(input) as Record<string, unknown>;
        const roundTripped = fromJsonLd<Medication>(jsonld);

        expect(roundTripped.id).toBe(input.id);
        expect(roundTripped.type).toBe(input.type);
        expect(roundTripped.medicationName).toBe(input.medicationName);
        expect(roundTripped.dataProvenance).toBe(input.dataProvenance);
        expect(roundTripped.schemaVersion).toBe(input.schemaVersion);
      });
    }
  });

  describe('Vital sign round-trip', () => {
    const fixtures = loadFixturesByPrefix('vital-');

    for (const fixture of fixtures) {
      if (!SERIALIZABLE_INPUT_TYPES.has(fixture.input['type'] as string)) continue;

      it(`${fixture.id}: toJsonLd -> fromJsonLd round-trip`, () => {
        const input = fixture.input as unknown as CascadeRecord;
        const jsonld = toJsonLd(input) as Record<string, unknown>;
        const roundTripped = fromJsonLd<VitalSign>(jsonld);

        expect(roundTripped.id).toBe(input.id);
        expect(roundTripped.type).toBe(input.type);
        expect(roundTripped.vitalType).toBe(input.vitalType);
        expect(roundTripped.dataProvenance).toBe(input.dataProvenance);
      });
    }
  });

  describe('All fixture types round-trip', () => {
    const prefixes = ['cond-', 'allergy-', 'lab-', 'imm-', 'profile-', 'coverage-'];

    for (const prefix of prefixes) {
      const fixtures = loadFixturesByPrefix(prefix);

      for (const fixture of fixtures) {
        if (!SERIALIZABLE_INPUT_TYPES.has(fixture.input['type'] as string)) continue;

        it(`${fixture.id}: toJsonLd -> fromJsonLd preserves id and type`, () => {
          const input = fixture.input as unknown as CascadeRecord;
          const jsonld = toJsonLd(input) as Record<string, unknown>;
          const roundTripped = fromJsonLd<CascadeRecord>(jsonld);

          expect(roundTripped.id).toBe(input.id);
          expect(roundTripped.type).toBe(input.type);
          expect(roundTripped.dataProvenance).toBe(input.dataProvenance);
          expect(roundTripped.schemaVersion).toBe(input.schemaVersion);
        });
      }
    }
  });

  // ─── Structure Tests ────────────────────────────────────────────────────

  describe('JSON-LD document structure', () => {
    it('includes @context field', () => {
      const med: Medication = {
        id: 'urn:uuid:test-001',
        type: 'MedicationRecord',
        medicationName: 'Test',
        isActive: true,
        dataProvenance: 'SelfReported',
        schemaVersion: '1.3',
      };

      const result = toJsonLd(med) as Record<string, unknown>;
      expect(result['@context']).toBe(CONTEXT_URI);
    });

    it('includes @id field set to record id', () => {
      const med: Medication = {
        id: 'urn:uuid:test-002',
        type: 'MedicationRecord',
        medicationName: 'Test',
        isActive: true,
        dataProvenance: 'SelfReported',
        schemaVersion: '1.3',
      };

      const result = toJsonLd(med) as Record<string, unknown>;
      expect(result['@id']).toBe('urn:uuid:test-002');
    });

    it('includes @type field with correct RDF type', () => {
      const med: Medication = {
        id: 'urn:uuid:test-003',
        type: 'MedicationRecord',
        medicationName: 'Test',
        isActive: true,
        dataProvenance: 'SelfReported',
        schemaVersion: '1.3',
      };

      const result = toJsonLd(med) as Record<string, unknown>;
      expect(result['@type']).toBe('clinical:Medication');
    });

    it('type URIs are correctly expanded for VitalSign', () => {
      const vital: VitalSign = {
        id: 'urn:uuid:test-vs-001',
        type: 'VitalSign',
        vitalType: 'heartRate',
        value: 72,
        unit: 'bpm',
        dataProvenance: 'DeviceGenerated',
        schemaVersion: '1.3',
      };

      const result = toJsonLd(vital) as Record<string, unknown>;
      expect(result['@type']).toBe('clinical:VitalSign');
    });

    it('dataProvenance is prefixed with cascade:', () => {
      const med: Medication = {
        id: 'urn:uuid:test-dp',
        type: 'MedicationRecord',
        medicationName: 'Test',
        isActive: true,
        dataProvenance: 'ClinicalGenerated',
        schemaVersion: '1.3',
      };

      const result = toJsonLd(med) as Record<string, unknown>;
      expect(result['dataProvenance']).toBe('cascade:ClinicalGenerated');
    });

    it('preserves primitive field values', () => {
      const med: Medication = {
        id: 'urn:uuid:test-fields',
        type: 'MedicationRecord',
        medicationName: 'Aspirin',
        isActive: true,
        dose: '81 mg',
        frequency: 'once daily',
        dataProvenance: 'SelfReported',
        schemaVersion: '1.3',
      };

      const result = toJsonLd(med) as Record<string, unknown>;
      expect(result['medicationName']).toBe('Aspirin');
      expect(result['isActive']).toBe(true);
      expect(result['dose']).toBe('81 mg');
      expect(result['frequency']).toBe('once daily');
    });
  });

  // ─── Patient-profile sub-structures ──────────────────────────

  describe('Patient-profile sub-structures in the context', () => {
    // A nested key with no term in the context is not a lossy mapping, it is a
    // dropped triple: the object expands to a node with zero statements, and
    // `toJsonLd` reports nothing wrong because it passed the value through
    // faithfully. The context is where that is visible, so it is where this is
    // asked.
    //
    // The generated context is answerable to `spec/contexts/v1/cascade.jsonld`,
    // which defines all thirteen of these as plain top-level terms. Predicates
    // are written out by hand here rather than read from any table, so a
    // re-namespaced child fails instead of agreeing with the code.
    //
    // `addressType` is the thirteenth, and it is here because the WRITER emits
    // it: the context has to define every child a term declares, or `toJsonLd`
    // passes the value through into a node with zero statements and reports
    // nothing wrong. The published context has carried it all along.
    const profile002 = loadFixturesByPrefix('profile-002')[0]!;

    function contextTerms(): Record<string, unknown> {
      return (getContext() as { '@context': Record<string, unknown> })['@context'];
    }

    it('defines each child of the contact, the address and the pharmacy', () => {
      const ctx = contextTerms();
      const children = [
        'contactName',
        'contactRelationship',
        'contactPhone',
        'addressLine',
        'addressCity',
        'addressState',
        'addressPostalCode',
        'addressCountry',
        'addressUse',
        'addressType',
        'pharmacyName',
        'pharmacyAddress',
        'pharmacyPhone',
      ];

      expect(Object.fromEntries(children.map((key) => [key, ctx[key]]))).toEqual({
        contactName: 'cascade:contactName',
        contactRelationship: 'cascade:contactRelationship',
        contactPhone: 'cascade:contactPhone',
        addressLine: 'cascade:addressLine',
        addressCity: 'cascade:addressCity',
        addressState: 'cascade:addressState',
        addressPostalCode: 'cascade:addressPostalCode',
        addressCountry: 'cascade:addressCountry',
        addressUse: 'cascade:addressUse',
        addressType: 'cascade:addressType',
        pharmacyName: 'cascade:pharmacyName',
        pharmacyAddress: 'cascade:pharmacyAddress',
        pharmacyPhone: 'cascade:pharmacyPhone',
      });
    });

    it('leaves no key of what toJsonLd actually writes without one', () => {
      // The list above is a list, and a list can be right about twelve names
      // and still miss the thirteenth thing the writer emits. This asks the
      // writer instead: every key of the document, at both levels, resolves.
      const ctx = contextTerms();
      const doc = toJsonLd(profile002.input as unknown as CascadeRecord) as Record<
        string,
        unknown
      >;

      const unresolved: string[] = [];
      for (const [key, value] of Object.entries(doc)) {
        if (key.startsWith('@')) continue;
        if (ctx[key] === undefined) unresolved.push(key);
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          for (const nestedKey of Object.keys(value as Record<string, unknown>)) {
            // Keywords are skipped at BOTH levels, as they are at the top one
            // above. A nested node carries `@type` — the class its term
            // declares, written by `jsonLdFor` — and a keyword is not a term:
            // it has no context entry and cannot be given one. Only the child
            // property names are this check's business.
            if (nestedKey.startsWith('@')) continue;
            if (ctx[nestedKey] === undefined) unresolved.push(`${key}.${nestedKey}`);
          }
        }
      }

      expect(unresolved).toEqual([]);
    });
  });

  // ─── Error Handling ───────────────────────────────────────────────────────

  // ─── The two serializations, typed the same way ─────────────────────────

  describe('Context datatypes agree with what the Turtle writer stamps', () => {
    // One record has two published serializations, and nothing in the code
    // makes them answer the datatype question together: the Turtle writer reads
    // `DATE_ONLY_FIELDS` in `src/serializer/turtle-serializer.ts`, the context
    // reads `dateOnlyFields` / `dateTimeFields` in `src/jsonld/context.ts`. Two
    // hand-maintained lists of one fact, and moving a field in one of them is
    // silent in the other.
    //
    // When they disagree the JSON-LD half is not merely different, it is
    // ill-typed. A term declared `@type: xsd:dateTime` expands `"2024-01-01"` —
    // the value coverage-002 carries, and what `serialize()` writes `^^xsd:date`
    // — to `"2024-01-01"^^xsd:dateTime`, which is not a valid `xsd:dateTime`
    // lexical form and violates the `sh:datatype xsd:date` on
    // `coverage:InsurancePlanShape`. Nothing throws: a consumer just gets, from
    // the JSON-LD path, a graph the shapes reject for a record the Turtle path
    // writes cleanly.
    //
    // Asked of the PAIR rather than of the context alone. Asserting the context
    // on its own pins a second copy of the answer and says nothing about
    // whether the two copies still agree, which is the only thing that went
    // wrong here.
    const plan = loadCascadeRecordFixture('coverage-002');

    it.each(['effectiveStart', 'effectiveEnd'])('%s is xsd:date in both', (field) => {
      const node = parseTurtle(serialize(plan.input)).namedNode(plan.input.id as string);
      const written = node.out(coverageNs[field]).term?.datatype?.value;

      // The Turtle side first: it is the half the fixture corpus pins, so if it
      // is what moved, the whole-graph comparison in
      // `tests/conformance/coverage.test.ts` has already gone red and this
      // assertion just says which datatype rather than which triple.
      expect(written).toBe(NAMESPACES.xsd + 'date');

      // `getContext()` returns the wrapper document, not the term map.
      const { '@context': context } = getContext() as {
        '@context': Record<string, unknown>;
      };
      expect(context[field]).toEqual({ '@id': 'coverage:' + field, '@type': 'xsd:date' });
    });
  });

  describe('Error handling', () => {
    it('throws on unknown record type in toJsonLd', () => {
      expect(() =>
        toJsonLd({
          id: 'urn:uuid:test',
          type: 'UnknownType',
          dataProvenance: 'SelfReported',
          schemaVersion: '1.0',
        }),
      ).toThrow('Unknown record type');
    });

    it('fromJsonLd handles missing @type gracefully', () => {
      const doc = {
        '@context': CONTEXT_URI,
        '@id': 'urn:uuid:test-notype',
        medicationName: 'Test',
      };

      const result = fromJsonLd(doc);
      expect(result.id).toBe('urn:uuid:test-notype');
    });

    it('fromJsonLd handles missing @id gracefully', () => {
      const doc = {
        '@context': CONTEXT_URI,
        '@type': 'clinical:Medication',
        medicationName: 'Test',
      };

      const result = fromJsonLd(doc);
      expect(result.id).toBe('');
    });
  });
});
