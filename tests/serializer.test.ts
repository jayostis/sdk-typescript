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
import { parseTurtle, triples } from './support/graph.js';

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

    it('coverage-001: serializes an insurance plan in the coverage vocabulary', () => {
      // REWRITTEN, and it was red before it was touched. This asserted
      // `clinical:effectivePeriodStart "2020-01-01T00:00:00Z"^^xsd:dateTime` on
      // a fixture that has carried `effectiveStart` for some time and does not
      // carry `effectivePeriodStart` at all, so it failed on a field that is no
      // longer in the input rather than on the spelling it meant to pin.
      //
      // What it meant to pin is the defect (#26): this SDK writes the
      // deprecated `clinical:` spelling for a record the corpus says is a
      // `coverage:InsurancePlan`. `clinical:payorName` stays where it is —
      // coverage has no payor property distinct from `coverage:providerName`,
      // which is `sh:maxCount 1`, so it is a legitimate clinical predicate on
      // a plan and not one of the seven that move.
      const fixture = loadFixture('coverage-001');
      const result = serialize(fixture.input as unknown as CascadeRecord);

      expect(result).toContain('a coverage:InsurancePlan');
      expect(result).toContain('coverage:providerName "Blue Cross Blue Shield"');
      expect(result).toContain('coverage:effectiveStart "2020-01-01"^^xsd:date');
      expect(result).toContain('clinical:payorName "Blue Cross Blue Shield of Oregon"');
    });
  });

  describe('Fields no term claims', () => {
    // What `emitField` must keep doing once a term lookup is forked in ahead of
    // its type-driven chain (#2). `termFor` is undefined for all 252 registered
    // fields that no term module claims, and every one of them has to reach the
    // branch it reaches today — so the fork's job is to RETURN CONTROL, not to
    // become a new default.
    //
    // The first two are characterisation: they hold whether or not the fork
    // exists, so they are the guard on that change rather than the reason for
    // it, and only a mutation proves they can speak at all.
    //
    // The third is a different kind of claim. An ARRAY on a registered field no term claims
    // falls off the end of the type-driven chain and is written nowhere: every
    // branch below the fork tests for a string, a number, a boolean or an
    // object, so the value vanishes and the record serializes as though the
    // field had been absent. That is how `lab-013`'s two source codes were lost,
    // and adding one field to one arity table fixes that fixture without
    // closing the hole. The two silent cases above stay silent — a scalar with
    // no term keeps its default, and a stray key is still not an error — so
    // what is asserted here is narrow: an array is the one value the chain
    // cannot write, and it has to say so instead of dropping it.
    //
    // Asserted on the graph via `triples()` rather than with `toContain` on the
    // Turtle text, because the discriminator IS the datatype: a fork that
    // claimed this field under a `literal` rule would write "4.2" where the
    // serializer writes a bare 4.2, and both spellings contain the substring.

    const base: Record<string, unknown> = {
      id: 'urn:uuid:fork0000-aaaa-bbbb-cccc-ddddeeeeffff',
      type: 'LabResultRecord',
      testName: 'Serum Potassium',
      dataProvenance: 'EHRVerified',
      schemaVersion: '1.3',
    };

    const SUBJECT = '<urn:uuid:fork0000-aaaa-bbbb-cccc-ddddeeeeffff>';

    it('leaves a registered field with no term on its type-driven branch', () => {
      // `resultValue` is registered (health:resultValue) and no term module
      // claims it. A non-integer number takes the decimal branch, and RDF 1.1
      // types a bare 4.2 as xsd:decimal — the predicate and the datatype are
      // both written out here rather than derived from PROPERTY_PREDICATES,
      // which would make the test agree with the code by construction.
      const result = serialize({ ...base, resultValue: 4.2 } as unknown as CascadeRecord);

      expect(triples(result)).toContain(
        `${SUBJECT} <https://ns.cascadeprotocol.org/health/v1#resultValue> `
        + '"4.2"^^<http://www.w3.org/2001/XMLSchema#decimal>',
      );
    });

    it('skips a field with no registered predicate in silence', () => {
      // A stray non-Cascade key is not an error — `emitField` returns at
      // `if (!pred) return;` and writes nothing. The fork sits ABOVE that
      // guard, so a fork that threw, or that wrote a triple under a blank
      // predicate, would show up as a difference between these two graphs.
      // Comparing whole graphs rather than asserting one absence also catches a
      // fork that quietly changed some OTHER field on the way past.
      const withStray = serialize({ ...base, notAThing: 'ignore me' } as unknown as CascadeRecord);

      expect(triples(withStray)).toEqual(triples(serialize(base as unknown as CascadeRecord)));
    });

    it('writes every value of an array, whatever the vocabulary permits', () => {
      // `specimenType`, and the choice is the whole point of the test:
      // registered (health:specimenType), claimed by NO term, and in none of
      // the arity tables. It therefore reaches `emitField`'s member loop, which
      // is the code under test here.
      //
      // This assertion used `resultValue` and silently stopped covering
      // anything when that field was later termed — a term is forked to above
      // the type-driven chain, so the loop was never entered and mutating it to
      // write one member left the whole suite green. Any field named here has
      // to be checked against `termFor` before it is trusted.
      //
      // Two values are written anyway, in the order given, because a shape can
      // only judge what reached the graph: a writer that dropped one would hand
      // the validator a record with nothing left to violate.
      const result = serialize({
        ...base,
        specimenType: ['serum', 'plasma'],
      } as unknown as CascadeRecord);

      expect(triples(result).filter((t) => t.includes('#specimenType'))).toEqual([
        `${SUBJECT} <https://ns.cascadeprotocol.org/health/v1#specimenType> "serum"^^<http://www.w3.org/2001/XMLSchema#string>`,
        `${SUBJECT} <https://ns.cascadeprotocol.org/health/v1#specimenType> "plasma"^^<http://www.w3.org/2001/XMLSchema#string>`,
      ].sort());
    });

    it('writes nothing for an empty array, and no empty triple', () => {
      // One value per member means ZERO triples for zero members, and the
      // assertion is that nothing else appears either — not a blank literal,
      // not a predicate with no object. The case is a caller that normalises an
      // absent optional to `[]`, which is what `asArray` hands back.
      const withEmpty = serialize({ ...base, resultValue: [] } as unknown as CascadeRecord);

      expect(triples(withEmpty)).toEqual(triples(serialize(base as unknown as CascadeRecord)));
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

/**
 * A nested child whose predicate is not in this node's namespace.
 *
 * The faithful reader keeps it. `recoverableChildKey` returns the FULL IRI as
 * the child key when the predicate's namespace is not the one the node's
 * children are written under, because abbreviating
 * `<https://other.example.org/ns#wardCount>` as `cascade:wardCount` would
 * silently reassign the triple to a vocabulary that never declared it. The
 * writer has to be able to put back what the reader hands it.
 *
 * The TERMED path could — `childPredicateFor` writes an absolute-IRI key in
 * angle brackets. `serializeBlankNode`, which writes every nested field no term
 * claims yet, had `${nsPrefix}:${k}` inline and produced
 * `cascade:https://other.example.org/ns#wardCount`. That is not a wrong triple:
 * it is a document no parser will take back, and it fails on the whole record
 * rather than on the one field. Before the reader stopped skipping, the triple
 * was dropped on the way in and the writer never saw it.
 */
describe('a blank-node child from another namespace', () => {
  const manifest = (summaryKey: string) => ({
    id: 'urn:uuid:manifest-0001-aaaa-bbbb-ccccddddeeee',
    type: 'ExportManifest',
    title: 'Cascade export',
    created: '2026-08-29T00:00:00Z',
    schemaVersion: '3.4',
    [summaryKey]: {
      type: 'RecordSummary',
      domain: 'wellness',
      'https://other.example.org/ns#wardCount': 3,
    },
  }) as never;

  // `wellnessSummary` is the UNTERMED writer, `clinicalSummary` the termed one.
  // Both take their children from the same reader, so both have to spell this
  // the same way — the finding was that only one of them did.
  it.each(['wellnessSummary', 'clinicalSummary'])(
    '%s writes the full IRI in angle brackets, not under the node prefix',
    (key) => {
      const turtle = serialize(manifest(key));

      expect(turtle).toContain('<https://other.example.org/ns#wardCount> 3');
      expect(turtle).not.toContain('cascade:https://');
    },
  );

  it.each(['wellnessSummary', 'clinicalSummary'])('%s emits a document that parses', (key) => {
    // The assertion that names the real cost. A prefixed name whose local part
    // contains `://` is not valid Turtle, so the failure is not a mis-typed
    // triple a consumer could query around — it is the whole export.
    expect(() => parseTurtle(serialize(manifest(key)))).not.toThrow();
  });
});
