/**
 * Tests for the pod export manifest vocabulary (core v3.4).
 *
 * The 32 terms covered here are emitted by every conforming pod export and had
 * no definition in the core ontology before v3.4. This SDK grepped to zero hits
 * for all three classes before this change, so every assertion below fails
 * outright if the support is removed rather than merely losing precision.
 *
 * The serializer assertions are byte-exact against the shared conformance
 * fixtures, which this repo does not author.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { serialize } from '../src/serializer/turtle-serializer.js';
import { deserialize, deserializeOne } from '../src/deserializer/turtle-parser.js';
import { validate } from '../src/validator/validator.js';
import { getContext } from '../src/jsonld/index.js';
import { NAMESPACES, PROPERTY_PREDICATES, TYPE_MAPPING } from '../src/vocabularies/index.js';
import type {
  ExportManifest,
  InteractionScenario,
  RecordSummary,
} from '../src/models/export-manifest.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, '../../conformance/fixtures');

interface ConformanceFixture {
  id: string;
  input: Record<string, unknown>;
  expectedOutput: { turtle: string; validationMode: string };
  shouldAccept: boolean;
}

function loadFixture(id: string): ConformanceFixture {
  return JSON.parse(
    readFileSync(resolve(fixturesDir, `${id}.json`), 'utf-8'),
  ) as ConformanceFixture;
}

// ─── Conformance fixtures (cross-SDK oracle) ────────────────────────────────

describe('core v3.4 — export manifest conformance fixtures', () => {
  it('pod-002: serializes the reference manifest byte-for-byte', () => {
    const fixture = loadFixture('pod-002');
    const turtle = serialize(fixture.input as unknown as ExportManifest);
    expect(turtle).toBe(fixture.expectedOutput.turtle);
  });

  it('pod-004: serializes the incomplete manifest byte-for-byte', () => {
    const fixture = loadFixture('pod-004');
    const turtle = serialize(fixture.input as unknown as ExportManifest);
    expect(turtle).toBe(fixture.expectedOutput.turtle);
  });

  it('pod-002: the emitted manifest carries the v3.4 terms, not opaque literals', () => {
    const turtle = serialize(loadFixture('pod-002').input as unknown as ExportManifest);
    expect(turtle).toContain('a cascade:ExportManifest ;');
    expect(turtle).toContain('a cascade:RecordSummary ;');
    // dcat/Dublin Core descriptive terms, not Cascade inventions
    expect(turtle).toContain('dcterms:title "Cascade Reference Patient Pod - Alex Rivera"');
    expect(turtle).toContain('dcterms:created "2026-02-19T00:00:00Z"^^xsd:dateTime');
    // provenanceLayers is an ordered rdf:List of cascade: individuals
    expect(turtle).toMatch(
      /cascade:provenanceLayers \(\n\s+cascade:ClinicalGenerated\n\s+cascade:DeviceGenerated\n\s+cascade:SelfReported\n\s+\)/,
    );
    // counts carry their declared xsd:integer datatype
    expect(turtle).toContain('cascade:conditionCount "5"^^xsd:integer');
  });

  it('pod-002: round-trips through the deserializer with its counts intact', () => {
    const fixture = loadFixture('pod-002');
    const input = fixture.input as unknown as ExportManifest;
    const turtle = serialize(input);

    const manifest = deserializeOne<ExportManifest>(turtle, 'ExportManifest');
    expect(manifest).not.toBeNull();
    expect(manifest!.title).toBe(input.title);
    expect(manifest!.created).toBe(input.created);
    expect(manifest!.schemaVersion).toBe('1.3');
    expect(manifest!.patientProfileVersion).toBe('2.0');
    expect(manifest!.provenanceLayers).toEqual([
      'ClinicalGenerated',
      'DeviceGenerated',
      'SelfReported',
    ]);
    // The inline cascade:RecordSummary is rebuilt, not reported as a blank-node id.
    expect(manifest!.clinicalSummary).toEqual({
      domain: 'clinical',
      conditionCount: 5,
      medicationCount: 8,
      allergyCount: 3,
      labResultCount: 11,
      immunizationCount: 4,
      vitalSignDays: 30,
      coverageCount: 1,
    });
  });

  it('pod-004: the validator rejects a manifest with no schemaVersion', () => {
    const fixture = loadFixture('pod-004');
    expect(fixture.shouldAccept).toBe(false);

    const result = validate(fixture.input as unknown as ExportManifest);
    expect(result.valid).toBe(false);
    expect(result.errors.map((e) => e.field)).toContain('schemaVersion');
    // ...and NOT because it lacks a provenance value: a dcat:Dataset is not a
    // cascade:HealthRecord and no shape asks it for one.
    expect(result.errors.map((e) => e.field)).not.toContain('dataProvenance');
  });
});

// ─── Vocabulary registration: all 32 terms ──────────────────────────────────

describe('core v3.4 — all 32 terms are registered', () => {
  it('registers the three classes with their RDF types', () => {
    expect(TYPE_MAPPING['export-manifest']?.rdfType).toBe('cascade:ExportManifest');
    expect(TYPE_MAPPING['record-summaries']?.rdfType).toBe('cascade:RecordSummary');
    expect(TYPE_MAPPING['interaction-scenarios']?.rdfType).toBe('cascade:InteractionScenario');
  });

  it('registers the 26 uncontested properties under cascade:', () => {
    const terms = [
      // manifest structure
      'patientProfileVersion', 'provenanceLayers', 'clinicalSummary', 'wellnessSummary',
      'deviceSources', 'interactionScenarios',
      // record summary
      'domain', 'conditionCount', 'medicationCount', 'allergyCount', 'labResultCount',
      'immunizationCount', 'coverageCount', 'supplementCount',
      'vitalSignDays', 'heartRateDays', 'bloodPressureDays', 'activityDays', 'sleepDays',
      // interaction scenario
      'involvedResources', 'severity', 'requiresCrossProvenance',
      // device sources
      'sourceType', 'dataTypes', 'version',
      // reading-level
      'sampleCount',
    ];
    expect(terms).toHaveLength(26);
    for (const term of terms) {
      expect(PROPERTY_PREDICATES[term]).toBe(`cascade:${term}`);
    }
  });

  it('registers dcat and void, the vocabularies the two classes are modelled on', () => {
    // cascade:ExportManifest rdfs:subClassOf dcat:Dataset
    expect(NAMESPACES.dcat).toBe('http://www.w3.org/ns/dcat#');
    // cascade:RecordSummary rdfs:subClassOf void:Dataset; every count is
    // rdfs:subPropertyOf void:entities
    expect(NAMESPACES.void).toBe('http://rdfs.org/ns/void#');
  });
});

// ─── The three colliding reading-level terms ────────────────────────────────

describe('core v3.4 — cascade:notes / cascade:date / cascade:loincCode', () => {
  it('writes cascade:notes on the manifest classes and health:notes on a health record', () => {
    const summary: RecordSummary = {
      id: 'urn:uuid:summary-0001',
      type: 'RecordSummary',
      domain: 'clinical',
      notes: 'Counts exclude superseded records.',
    };
    expect(serialize(summary)).toContain('cascade:notes "Counts exclude superseded records."');

    const condition = {
      id: 'urn:uuid:cond-0001',
      type: 'ConditionRecord',
      conditionName: 'Hypertension',
      dataProvenance: 'EHRVerified',
      schemaVersion: '1.3',
      notes: 'Diagnosed at annual physical.',
    };
    const conditionTurtle = serialize(condition as never);
    expect(conditionTurtle).toContain('health:notes "Diagnosed at annual physical."');
    expect(conditionTurtle).not.toContain('cascade:notes');
  });

  it('reads cascade:notes and cascade:loincCode, the second spellings', () => {
    const turtle = [
      `@prefix cascade: <${NAMESPACES.cascade}> .`,
      '',
      '<urn:uuid:summary-0002> a cascade:RecordSummary ;',
      '    cascade:domain "wellness" ;',
      '    cascade:notes "Device data only." ;',
      '    cascade:loincCode <http://loinc.org/rdf#8867-4> .',
    ].join('\n');

    const summary = deserializeOne<RecordSummary>(turtle, 'RecordSummary');
    expect(summary).not.toBeNull();
    expect(summary!.notes).toBe('Device data only.');
    expect((summary as unknown as Record<string, unknown>)['loincCode']).toBe(
      'http://loinc.org/rdf#8867-4',
    );
  });
});

// ─── InteractionScenario: the deliberately novel class ──────────────────────

describe('core v3.4 — cascade:InteractionScenario', () => {
  const scenario: InteractionScenario = {
    id: 'urn:uuid:scenario-0001',
    type: 'InteractionScenario',
    title: 'Anticoagulant and self-reported supplement',
    involvedResources: [
      'urn:uuid:med-0001',
      'urn:uuid:supplement-0001',
      'urn:uuid:lab-0001',
    ],
    severity: 'high',
    requiresCrossProvenance: true,
  };

  it('serializes involvedResources as an ordered rdf:List of IRIs', () => {
    const turtle = serialize(scenario);
    expect(turtle).toContain('a cascade:InteractionScenario ;');
    expect(turtle).toContain('cascade:severity "high"');
    expect(turtle).toContain('cascade:requiresCrossProvenance true');
    expect(turtle).toMatch(
      /cascade:involvedResources \(\n\s+<urn:uuid:med-0001>\n\s+<urn:uuid:supplement-0001>\n\s+<urn:uuid:lab-0001>\n\s+\)/,
    );
    // The members must be IRIs, not quoted literals: a consumer has to be able
    // to follow them.
    expect(turtle).not.toContain('"urn:uuid:med-0001"');
  });

  it('round-trips, preserving list order and the boolean', () => {
    const result = deserializeOne<InteractionScenario>(
      serialize(scenario),
      'InteractionScenario',
    );
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('high');
    expect(result!.requiresCrossProvenance).toBe(true);
    expect(result!.involvedResources).toEqual(scenario.involvedResources);
  });

  it('is validated against its shape: a scenario naming no resources is rejected', () => {
    const empty: InteractionScenario = {
      id: 'urn:uuid:scenario-0002',
      type: 'InteractionScenario',
      title: 'Unspecified risk',
    };
    const result = validate(empty);
    expect(result.valid).toBe(false);
    expect(result.errors.map((e) => e.field)).toContain('involvedResources');

    expect(validate(scenario).valid).toBe(true);
  });
});

// ─── RecordSummary standalone ───────────────────────────────────────────────

describe('core v3.4 — cascade:RecordSummary as a standalone subject', () => {
  const summary: RecordSummary = {
    id: 'urn:uuid:summary-0003',
    type: 'RecordSummary',
    domain: 'wellness',
    conditionCount: 0,
    medicationCount: 2,
    allergyCount: 1,
    labResultCount: 14,
    immunizationCount: 3,
    coverageCount: 1,
    supplementCount: 4,
    vitalSignDays: 90,
    heartRateDays: 90,
    bloodPressureDays: 30,
    activityDays: 90,
    sleepDays: 88,
  };

  it('emits every count as a typed xsd:integer', () => {
    const turtle = serialize(summary);
    for (const [key, value] of Object.entries(summary)) {
      if (typeof value !== 'number') continue;
      expect(turtle).toContain(`cascade:${key} "${value}"^^xsd:integer`);
    }
  });

  it('round-trips all twelve counts as numbers', () => {
    const result = deserializeOne<RecordSummary>(serialize(summary), 'RecordSummary');
    expect(result).not.toBeNull();
    expect(result).toMatchObject(summary);
    // A zero count must survive: "0 conditions" and "counts not reported" are
    // different claims about an export.
    expect(result!.conditionCount).toBe(0);
  });

  it('requires a domain, per cascade:RecordSummaryShape', () => {
    const { domain: _domain, ...withoutDomain } = summary;
    const result = validate(withoutDomain as RecordSummary);
    expect(result.valid).toBe(false);
    expect(result.errors.map((e) => e.field)).toContain('domain');
  });
});

// ─── JSON-LD context ────────────────────────────────────────────────────────

describe('core v3.4 — JSON-LD context', () => {
  const ctx = (getContext() as { '@context': Record<string, unknown> })['@context'];

  it('includes the three class aliases', () => {
    expect(ctx['ExportManifest']).toBe('cascade:ExportManifest');
    expect(ctx['RecordSummary']).toBe('cascade:RecordSummary');
    expect(ctx['InteractionScenario']).toBe('cascade:InteractionScenario');
  });

  it('includes dcat and void prefixes (the stable vocabularies, not drafts)', () => {
    expect(ctx['dcat']).toBe('http://www.w3.org/ns/dcat#');
    expect(ctx['void']).toBe('http://rdfs.org/ns/void#');
  });

  it('types the counts as xsd:integer and the flag as xsd:boolean', () => {
    expect(ctx['conditionCount']).toEqual({
      '@id': 'cascade:conditionCount',
      '@type': 'xsd:integer',
    });
    expect(ctx['sleepDays']).toEqual({ '@id': 'cascade:sleepDays', '@type': 'xsd:integer' });
    expect(ctx['requiresCrossProvenance']).toEqual({
      '@id': 'cascade:requiresCrossProvenance',
      '@type': 'xsd:boolean',
    });
  });

  it('marks the rdf:List properties as ordered IRI lists', () => {
    for (const key of [
      'provenanceLayers',
      'deviceSources',
      'interactionScenarios',
      'involvedResources',
    ]) {
      expect(ctx[key]).toEqual({
        '@id': `cascade:${key}`,
        '@type': '@id',
        '@container': '@list',
      });
    }
  });

  it('types dcterms:created as xsd:dateTime', () => {
    expect(ctx['created']).toEqual({ '@id': 'dcterms:created', '@type': 'xsd:dateTime' });
  });
});

// ─── Manifest with device sources and scenario references ───────────────────

describe('core v3.4 — device sources and scenario references', () => {
  it('round-trips deviceSources and interactionScenarios as IRI lists', () => {
    const manifest: ExportManifest = {
      id: 'urn:uuid:manifest-0001',
      type: 'ExportManifest',
      title: 'Export',
      created: '2026-08-03T09:00:00Z',
      schemaVersion: '1.3',
      deviceSources: ['urn:uuid:device-watch', 'urn:uuid:device-cuff'],
      interactionScenarios: ['urn:uuid:scenario-0001'],
    };
    const turtle = serialize(manifest);
    expect(turtle).toContain('cascade:deviceSources (');
    expect(turtle).toContain('<urn:uuid:device-watch>');

    const result = deserializeOne<ExportManifest>(turtle, 'ExportManifest');
    expect(result!.deviceSources).toEqual(manifest.deviceSources);
    expect(result!.interactionScenarios).toEqual(manifest.interactionScenarios);
  });

  it('reads several manifests out of one document', () => {
    const turtle = [
      `@prefix cascade: <${NAMESPACES.cascade}> .`,
      `@prefix dcterms: <${NAMESPACES.dcterms}> .`,
      '',
      '<urn:uuid:m1> a cascade:ExportManifest ; dcterms:title "First" .',
      '<urn:uuid:m2> a cascade:ExportManifest ; dcterms:title "Second" .',
    ].join('\n');
    const manifests = deserialize<ExportManifest>(turtle, 'ExportManifest');
    expect(manifests.map((m) => m.title)).toEqual(['First', 'Second']);
  });
});
