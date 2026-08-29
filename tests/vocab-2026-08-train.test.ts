/**
 * core v3.6 / health v2.7 / clinical v1.15.
 *
 * Four rulings land in this SDK:
 *
 * 1. `cascade:dataAbsentReason` (and the long-missing `cascade:sourceSystem`)
 *    become registered predicates, so they survive serialization instead of
 *    being dropped on the floor.
 * 2. `interpretationSourceCode` in both spellings: the source's own code,
 *    verbatim, when it is a member of neither ratified value set.
 * 3. The interpretation value set goes from 60 to 74 values.
 * 4. Procedure records retarget onto `clinical:Procedure` /
 *    `clinical:procedureName`, with `health:procedureName` accepted for the
 *    migration window.
 *
 * Several of these are about output the previous suite could not see: the
 * fixtures involved carry `validationMode: 'shacl-valid'`, whose assertion is
 * "non-empty, has prefixes, mentions the class". A field silently dropped by
 * the serializer passes that check, which is why the assertions below compare
 * against the fixture's own expected Turtle instead.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

import { serialize } from '../src/serializer/turtle-serializer.js';
import { deserialize } from '../src/deserializer/turtle-parser.js';
import { getContext } from '../src/jsonld/context.js';
import {
  LAB_INTERPRETATION_VALUES,
  LAB_INTERPRETATION_CHECKSUM,
} from '../src/models/common.js';
import { PROPERTY_PREDICATES, TYPE_MAPPING } from '../src/vocabularies/namespaces.js';
import { clinical, parseTurtle } from './support/graph.js';
import type { CascadeRecord } from '../src/models/common.js';
import type { VitalSign } from '../src/models/vital-sign.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, '../../conformance/fixtures');

interface Fixture {
  id: string;
  input: Record<string, unknown>;
  expectedOutput: { turtle: string; validationMode: string };
  shouldAccept: boolean;
}

function loadFixture(id: string): Fixture {
  return JSON.parse(readFileSync(resolve(fixturesDir, `${id}.json`), 'utf-8')) as Fixture;
}

function serializeFixture(id: string): string {
  return serialize(loadFixture(id).input as unknown as CascadeRecord);
}

/** The term map inside the generated context wrapper. */
function contextTerms(): Record<string, unknown> {
  const wrapper = getContext() as { '@context': Record<string, unknown> };
  return wrapper['@context'];
}

// ─── 1. The value set: 60 to 74 ──────────────────────────────────────────────

describe('interpretation value set (health v2.7 / clinical v1.15)', () => {
  const DATA_ABSENT_REASON_CODES = [
    'unknown', 'asked-unknown', 'temp-unknown', 'not-asked',
    'asked-declined', 'masked', 'not-applicable', 'unsupported',
    'as-text', 'error', 'not-a-number', 'negative-infinity',
    'positive-infinity', 'not-performed', 'not-permitted',
  ];

  it('has 74 distinct values', () => {
    expect(LAB_INTERPRETATION_VALUES).toHaveLength(74);
    expect(new Set(LAB_INTERPRETATION_VALUES).size).toBe(74);
  });

  it('carries all 15 data-absent-reason codes, in the shape order', () => {
    expect(LAB_INTERPRETATION_VALUES.slice(49, 64)).toEqual(DATA_ABSENT_REASON_CODES);
  });

  it('keeps the 49 code-system codes first and the 10 retained words last', () => {
    expect(LAB_INTERPRETATION_VALUES[0]).toBe('EX');
    expect(LAB_INTERPRETATION_VALUES[48]).toBe('SYN-S');
    expect(LAB_INTERPRETATION_VALUES.slice(64)).toEqual([
      'normal', 'high', 'low', 'abnormal', 'critical',
      'Normal', 'High', 'Low', 'Abnormal', 'Critical',
    ]);
  });

  it('matches the re-pinned checksum, and not the previous one', () => {
    const digest = createHash('sha256')
      .update(LAB_INTERPRETATION_VALUES.join('\n'), 'utf8')
      .digest('hex');
    expect(digest).toBe(LAB_INTERPRETATION_CHECKSUM);
    expect(digest).not.toBe(
      '2da0a308329c92456edf7f46d1529c1a2971b79294d0776025328d04773695f2',
    );
  });
});

// ─── 2. Newly registered predicates ──────────────────────────────────────────

describe('core v3.6 predicates', () => {
  it('registers cascade:dataAbsentReason', () => {
    expect(PROPERTY_PREDICATES['dataAbsentReason']).toBe('cascade:dataAbsentReason');
  });

  it('registers cascade:sourceSystem, the INGESTION axis', () => {
    // It has been in the published JSON-LD context since core v3.0 and was
    // never registered here, so the ingestion axis could not round-trip while
    // the origin axis could.
    expect(PROPERTY_PREDICATES['sourceSystem']).toBe('cascade:sourceSystem');
  });

  it('puts both into the generated JSON-LD context', () => {
    const context = contextTerms();
    expect(context['dataAbsentReason']).toBe('cascade:dataAbsentReason');
    expect(context['sourceSystem']).toBe('cascade:sourceSystem');
  });

  it('serializes an absence reason instead of dropping it', () => {
    const turtle = serializeFixture('absent-001');
    expect(turtle).toContain('cascade:dataAbsentReason');
  });
});

describe('interpretationSourceCode (health v2.7 / clinical v1.15)', () => {
  it('registers the health: spelling as the default', () => {
    expect(PROPERTY_PREDICATES['interpretationSourceCode']).toBe(
      'health:interpretationSourceCode',
    );
  });

  it('is in the generated JSON-LD context', () => {
    expect(contextTerms()['interpretationSourceCode']).toBe(
      'health:interpretationSourceCode',
    );
  });

  it('writes the clinical: spelling on a vital sign', () => {
    // The escape hatch has to follow the property it explains. Writing the
    // health: spelling here would put the source code on a different predicate
    // from its interpretation, and a consumer reading one would not find the
    // other.
    const turtle = serializeFixture('vital-001');
    expect(turtle).toContain('clinical:interpretationSourceCode "elevated"');
    expect(turtle).not.toContain('health:interpretationSourceCode');
  });

  it('declares the clinical: prefix on a record whose only clinical: field is this one', () => {
    // The `toContain` above passes whether or not the matching `@prefix` line
    // is in the header, and on vital-001 it could not fail either way:
    // `snomedCode` re-prefixes to clinical: on a VitalSign too, so the
    // declaration is there regardless of what this field does. The case that
    // can fail is a record carrying no other clinical: field, and the way to
    // ask it is to PARSE rather than string-match — an undeclared prefix is
    // invisible to `toContain` and fatal to a reader, so `parseTurtle`
    // throwing is itself the assertion, and the values are what it should say
    // once it parses.
    //
    // Worth keeping past this issue: every future per-type predicate has to
    // resolve the same way in the header as in the subject block, and this is
    // the shape that notices when it does not.
    const turtle = serialize({
      id: 'urn:uuid:00000000-0000-4000-8000-0000000000bb',
      type: 'VitalSign',
      interpretationSourceCode: 'elevated',
      dataProvenance: 'ClinicalGenerated',
      schemaVersion: '1.3',
    } as unknown as CascadeRecord);

    const node = parseTurtle(turtle).namedNode('urn:uuid:00000000-0000-4000-8000-0000000000bb');
    expect(node.out(clinical.interpretationSourceCode).values).toEqual(['elevated']);
  });

  it('writes the health: spelling on a lab result', () => {
    const turtle = serialize({
      id: 'urn:uuid:00000000-0000-4000-8000-0000000000aa',
      type: 'LabResultRecord',
      testName: 'Ferritin',
      interpretation: 'A',
      interpretationSourceCode: 'HIGH-LOCAL',
      dataProvenance: 'EHRVerified',
      schemaVersion: '1.3',
    } as unknown as CascadeRecord);
    expect(turtle).toContain('health:interpretationSourceCode "HIGH-LOCAL"');
  });

  it.each(['vital-001', 'vital-004'])(
    'reproduces the fixture Turtle for %s byte for byte',
    (id) => {
      // The fixture is shacl-valid mode, so the suite's generic assertion is
      // "non-empty, has prefixes, mentions the class". That passes while the
      // source code is silently dropped, which is what it was doing.
      expect(serializeFixture(id)).toBe(loadFixture(id).expectedOutput.turtle);
    },
  );
});

// ─── 3. The procedure retarget and its migration window ──────────────────────

describe('procedure records (clinical v1.15)', () => {
  it('is typed clinical:Procedure, the class a shape actually targets', () => {
    expect(TYPE_MAPPING['procedures']?.rdfType).toBe('clinical:Procedure');
    expect(TYPE_MAPPING['procedures']?.namePred).toBe('clinical:procedureName');
  });

  it('writes the canonical name spelling', () => {
    const turtle = serializeFixture('proc-001');
    expect(turtle).toContain('a clinical:Procedure');
    expect(turtle).toContain('clinical:procedureName "Cardiac Catheterization"');
  });

  it('preserves a name carried only on the deprecated spelling', () => {
    // This is what a C-CDA import path emits today. Before the migration
    // window the field was unregistered, so the name was dropped entirely and
    // the record serialized with no name at all.
    const turtle = serializeFixture('proc-004');
    expect(turtle).toContain('health:procedureName "Screening Colonoscopy"');
  });

  it('registers both name spellings', () => {
    expect(PROPERTY_PREDICATES['procedureName']).toBe('clinical:procedureName');
    expect(PROPERTY_PREDICATES['healthProcedureName']).toBe('health:procedureName');
  });
});

// ─── 4. The narrowed vital interpretation type ───────────────────────────────

describe('VitalSign.interpretation is no longer an open binding', () => {
  it('accepts a ratified code', () => {
    const vital: VitalSign = {
      id: 'urn:uuid:00000000-0000-4000-8000-0000000000bb',
      type: 'VitalSign',
      vitalType: 'bloodPressureSystolic',
      value: 134,
      unit: 'mmHg',
      dataProvenance: 'ClinicalGenerated',
      schemaVersion: '1.3',
      interpretation: 'H',
      interpretationSourceCode: 'elevated',
    };
    expect(vital.interpretation).toBe('H');
  });

  it('rejects a value outside the set at the type level', () => {
    // @ts-expect-error clinical v1.15 binds this property, so an arbitrary
    // string is no longer assignable. A value in neither ratified set belongs
    // on interpretationSourceCode with the nearest ratified reading here.
    //
    // This assertion is only meaningful under tsconfig.typecheck.json, which
    // is what includes tests in the typecheck: vitest does not typecheck, and
    // the build config excludes test files.
    const bad: VitalSign['interpretation'] = 'quite high';
    expect(bad).toBe('quite high');
  });

  it('accepts every one of the 74 values', () => {
    for (const code of LAB_INTERPRETATION_VALUES) {
      const v: VitalSign['interpretation'] = code;
      expect(v).toBe(code);
    }
  });
});

// ─── 5. Round trips ──────────────────────────────────────────────────────────

describe('the new fields survive a round trip', () => {
  it('reads back a vital source code written under the clinical: spelling', () => {
    // A reader has to accept every live spelling; only the writer picks one.
    // A reverse map that knew only the health: spelling serialized the source
    // code and then dropped it on read.
    const turtle = serializeFixture('vital-001');
    const records = deserialize(turtle, 'VitalSign') as unknown as Array<Record<string, unknown>>;
    expect(records).toHaveLength(1);
    expect(records[0]?.['interpretation']).toBe('H');
    expect(records[0]?.['interpretationSourceCode']).toBe('elevated');
  });

  it('reads back an absence reason', () => {
    const turtle = serializeFixture('absent-001');
    const records = deserialize(turtle, 'LabResultRecord') as unknown as Array<Record<string, unknown>>;
    expect(records).toHaveLength(1);
    expect(records[0]?.['dataAbsentReason']).toBeDefined();
  });
});
