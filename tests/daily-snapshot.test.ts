/**
 * Tests for health v2.5.
 *
 * v2.5 was mostly a gap-check rather than a set of new classes: the five
 * clinical record classes it defined were already emitted and already
 * supported here. What was genuinely missing was the single-day snapshot
 * properties, the four sleep-quality individuals, and the six wellness
 * container subclass declarations. Those are what this file covers, plus an
 * audit that all 40 v2.5 properties are registered.
 *
 * The serializer assertions are byte-exact against the shared conformance
 * fixtures, which this repo does not author.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { serialize } from '../src/serializer/turtle-serializer.js';
import { deserializeOne } from '../src/deserializer/turtle-parser.js';
import { getContext } from '../src/jsonld/index.js';
import {
  NAMESPACES,
  PROPERTY_PREDICATES,
  SLEEP_QUALITY_VALUES,
  TYPE_MAPPING,
  WELLNESS_CONTAINER_SUBCLASSES,
  isHealthProfileType,
} from '../src/vocabularies/index.js';
import type {
  DailyActivitySnapshot,
  DailySleepSnapshot,
} from '../src/models/daily-snapshot.js';
import type { ActivitySnapshot } from '../src/models/activity-snapshot.js';
import type { SleepSnapshot } from '../src/models/sleep-snapshot.js';

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

describe('health v2.5 — daily snapshot conformance fixtures', () => {
  for (const id of [
    'dailyactivity-001',
    'dailyactivity-002',
    'dailysleep-001',
    'dailysleep-002',
  ]) {
    it(`${id}: serializes byte-for-byte`, () => {
      const fixture = loadFixture(id);
      expect(serialize(fixture.input as unknown as DailyActivitySnapshot)).toBe(
        fixture.expectedOutput.turtle,
      );
    });
  }

  it('dailyactivity-001: round-trips every v2.5 activity property', () => {
    const input = loadFixture('dailyactivity-001').input as unknown as DailyActivitySnapshot;
    const result = deserializeOne<DailyActivitySnapshot>(
      serialize(input),
      'DailyActivitySnapshot',
    );
    expect(result).not.toBeNull();
    expect(result!.date).toBe('2026-01-20T00:00:00Z');
    expect(result!.steps).toBe(8432);
    expect(result!.activeEnergyKcal).toBe(412.5);
    expect(result!.exerciseMinutes).toBe(37);
    expect(result!.standHours).toBe(11);
    expect(result!.dataProvenance).toBe('DeviceGenerated');
  });

  it('dailysleep-001: round-trips duration and the sleep-quality individual', () => {
    const input = loadFixture('dailysleep-001').input as unknown as DailySleepSnapshot;
    const result = deserializeOne<DailySleepSnapshot>(serialize(input), 'DailySleepSnapshot');
    expect(result).not.toBeNull();
    expect(result!.durationHours).toBe(7.4);
    expect(result!.sleepQuality).toBe('Good');
  });
});

// ─── cascade:date vs health:date ────────────────────────────────────────────

describe('health v2.5 — the two date spellings', () => {
  const daily: DailyActivitySnapshot = {
    id: 'urn:uuid:dact-0100',
    type: 'DailyActivitySnapshot',
    date: '2026-03-01T00:00:00Z',
    steps: 5000,
    dataProvenance: 'DeviceGenerated',
    schemaVersion: '1.3',
  };

  const aggregate: ActivitySnapshot = {
    id: 'urn:uuid:act-0100',
    type: 'ActivitySnapshot',
    date: '2026-03-01',
    steps: 5000,
    dataProvenance: 'DeviceGenerated',
    schemaVersion: '1.3',
  };

  it('writes cascade:date on a daily snapshot, per its shape', () => {
    const turtle = serialize(daily);
    expect(turtle).toContain('cascade:date "2026-03-01T00:00:00Z"^^xsd:dateTime');
    expect(turtle).not.toContain('health:date');
  });

  it('still writes health:date on the 7-day aggregate snapshot', () => {
    const turtle = serialize(aggregate);
    expect(turtle).toContain('health:date "2026-03-01"');
    expect(turtle).not.toContain('cascade:date');
  });

  it('reads BOTH spellings back to the same field', () => {
    const withCascadeDate = [
      `@prefix cascade: <${NAMESPACES.cascade}> .`,
      `@prefix health: <${NAMESPACES.health}> .`,
      `@prefix xsd: <${NAMESPACES.xsd}> .`,
      '',
      '<urn:uuid:d1> a health:DailyActivitySnapshot ;',
      '    cascade:date "2026-03-02T00:00:00Z"^^xsd:dateTime .',
    ].join('\n');
    const withHealthDate = withCascadeDate
      .replace('cascade:date', 'health:date')
      .replace('<urn:uuid:d1>', '<urn:uuid:d2>');

    expect(
      deserializeOne<DailyActivitySnapshot>(withCascadeDate, 'DailyActivitySnapshot')!.date,
    ).toBe('2026-03-02T00:00:00Z');
    expect(
      deserializeOne<DailyActivitySnapshot>(withHealthDate, 'DailyActivitySnapshot')!.date,
    ).toBe('2026-03-02T00:00:00Z');
  });
});

// ─── Sleep quality individuals ──────────────────────────────────────────────

describe('health v2.5 — the four sleep-quality individuals', () => {
  it('defines exactly Excellent, Good, Fair, Poor', () => {
    expect([...SLEEP_QUALITY_VALUES]).toEqual(['Excellent', 'Good', 'Fair', 'Poor']);
  });

  for (const quality of SLEEP_QUALITY_VALUES) {
    it(`writes ${quality} as an IRI and reads it back as a local name`, () => {
      const record: DailySleepSnapshot = {
        id: `urn:uuid:dslp-${quality}`,
        type: 'DailySleepSnapshot',
        date: '2026-03-01T00:00:00Z',
        sleepQuality: quality,
        dataProvenance: 'DeviceGenerated',
        schemaVersion: '1.3',
      };
      const turtle = serialize(record);
      expect(turtle).toContain(`health:sleepQuality health:${quality}`);
      // NOT a string literal: health:DailySleepSnapshotShape's sh:in ranges
      // over the four individuals, and a literal would never match it.
      expect(turtle).not.toContain(`health:sleepQuality "${quality}"`);

      const result = deserializeOne<DailySleepSnapshot>(turtle, 'DailySleepSnapshot');
      expect(result!.sleepQuality).toBe(quality);
    });
  }

  it('applies to the 7-day SleepSnapshot as well', () => {
    const record: SleepSnapshot = {
      id: 'urn:uuid:slp-0100',
      type: 'SleepSnapshot',
      date: '2026-03-01',
      totalSleepMinutes: 444,
      sleepQuality: 'Fair',
      dataProvenance: 'DeviceGenerated',
      schemaVersion: '1.3',
    };
    expect(serialize(record)).toContain('health:sleepQuality health:Fair');
  });
});

// ─── Wellness container subclasses ──────────────────────────────────────────

describe('health v2.5 — the six wellness container classes', () => {
  const containers = [
    'ActivityData',
    'SleepData',
    'HeartRateData',
    'BloodPressureData',
    'HRVData',
    'BodyMeasurements',
  ];

  it('declares all six as subclasses of health:HealthProfile', () => {
    expect(Object.keys(WELLNESS_CONTAINER_SUBCLASSES)).toHaveLength(6);
    for (const name of containers) {
      expect(WELLNESS_CONTAINER_SUBCLASSES[`${NAMESPACES.health}${name}`]).toBe(
        `${NAMESPACES.health}HealthProfile`,
      );
    }
  });

  it('isHealthProfileType is true for the containers and for HealthProfile itself', () => {
    expect(isHealthProfileType(`${NAMESPACES.health}HealthProfile`)).toBe(true);
    for (const name of containers) {
      expect(isHealthProfileType(`${NAMESPACES.health}${name}`)).toBe(true);
    }
  });

  it('isHealthProfileType is false for classes that are not health profiles', () => {
    // The subclass relation is the whole point: an equality check against
    // health:HealthProfile would answer "no" for all six containers, and a
    // check that answers "yes" to everything is worth nothing.
    expect(isHealthProfileType(`${NAMESPACES.health}LabResultRecord`)).toBe(false);
    expect(isHealthProfileType(`${NAMESPACES.health}DailySleepSnapshot`)).toBe(false);
    expect(isHealthProfileType(`${NAMESPACES.clinical}Medication`)).toBe(false);
    expect(isHealthProfileType('')).toBe(false);
  });
});

// ─── The 40-property audit ──────────────────────────────────────────────────

describe('health v2.5 — all 40 properties are registered', () => {
  // Exactly the properties health v2.5 defines, grouped as the ontology groups
  // them. Every one must resolve to a health: predicate of the same local name.
  const V25_PROPERTIES = [
    // shared across the record classes (5)
    'notes', 'sourceRecordId', 'status', 'onsetDate', 'conditionName',
    // lab result (12)
    'testName', 'resultValue', 'resultUnit', 'interpretation', 'performedDate',
    'reportedDate', 'testCode', 'labCategory', 'referenceRange', 'specimenType',
    'orderingProvider', 'performingLab',
    // condition (3)
    'icd10Code', 'conditionClass', 'monitoredVitalSigns',
    // allergy (4)
    'allergen', 'allergyCategory', 'reaction', 'allergySeverity',
    // immunization (10)
    'vaccineName', 'administrationDate', 'vaccineCode', 'manufacturer', 'lotNumber',
    'doseQuantity', 'route', 'site', 'administeringProvider', 'administeringLocation',
    // family history (1)
    'onsetAge',
    // daily snapshot (5)
    'steps', 'activeEnergyKcal', 'exerciseMinutes', 'standHours', 'durationHours',
  ];

  it('covers exactly 40 properties', () => {
    expect(V25_PROPERTIES).toHaveLength(40);
    expect(new Set(V25_PROPERTIES).size).toBe(40);
  });

  for (const name of V25_PROPERTIES) {
    it(`registers health:${name}`, () => {
      expect(PROPERTY_PREDICATES[name]).toBe(`health:${name}`);
    });
  }
});

// ─── The five record classes were already supported ─────────────────────────

describe('health v2.5 — the five record classes', () => {
  it('are all typed under health:, which is what v2.5 ratified', () => {
    expect(TYPE_MAPPING['lab-results']?.rdfType).toBe('health:LabResultRecord');
    expect(TYPE_MAPPING['conditions']?.rdfType).toBe('health:ConditionRecord');
    expect(TYPE_MAPPING['allergies']?.rdfType).toBe('health:AllergyRecord');
    expect(TYPE_MAPPING['immunizations']?.rdfType).toBe('health:ImmunizationRecord');
    expect(TYPE_MAPPING['family-history']?.rdfType).toBe('health:FamilyHistoryRecord');
  });

  it('registers the two single-day snapshot classes', () => {
    expect(TYPE_MAPPING['daily-activity']?.rdfType).toBe('health:DailyActivitySnapshot');
    expect(TYPE_MAPPING['daily-sleep']?.rdfType).toBe('health:DailySleepSnapshot');
    // ...WITHOUT collapsing them into the 7-day aggregates, which are a
    // different class with a different shape.
    expect(TYPE_MAPPING['activity']?.rdfType).toBe('health:ActivitySnapshot');
    expect(TYPE_MAPPING['sleep']?.rdfType).toBe('health:SleepSnapshot');
  });
});

// ─── JSON-LD context ────────────────────────────────────────────────────────

describe('health v2.5 — JSON-LD context', () => {
  const ctx = (getContext() as { '@context': Record<string, unknown> })['@context'];

  it('includes the two daily snapshot class aliases', () => {
    expect(ctx['DailyActivitySnapshot']).toBe('health:DailyActivitySnapshot');
    expect(ctx['DailySleepSnapshot']).toBe('health:DailySleepSnapshot');
  });

  it('types the daily snapshot numerics per their declared ranges', () => {
    expect(ctx['exerciseMinutes']).toEqual({
      '@id': 'health:exerciseMinutes',
      '@type': 'xsd:integer',
    });
    expect(ctx['standHours']).toEqual({ '@id': 'health:standHours', '@type': 'xsd:integer' });
    expect(ctx['activeEnergyKcal']).toEqual({
      '@id': 'health:activeEnergyKcal',
      '@type': 'xsd:decimal',
    });
    expect(ctx['durationHours']).toEqual({
      '@id': 'health:durationHours',
      '@type': 'xsd:decimal',
    });
  });

  it('marks sleepQuality as an IRI reference, not a string', () => {
    expect(ctx['sleepQuality']).toEqual({ '@id': 'health:sleepQuality', '@type': '@id' });
  });
});
