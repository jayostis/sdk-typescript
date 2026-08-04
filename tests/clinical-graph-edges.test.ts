/**
 * Tests for clinical v1.10 through v1.13.
 *
 * Four vocabulary versions, two separable concerns:
 *
 * 1. Traversable graph edges (v1.10-v1.12): clinical:hasEncounter,
 *    clinical:indicationReference, clinical:parsedIndicationReference and
 *    clinical:linkedCondition, plus the deprecated
 *    clinical:linkedConditionIds literal they replace.
 *
 * 2. Four deprecated classes (v1.13). They were deprecated, NOT removed: the
 *    pod export path is still their sole emitter and existing pods contain
 *    them. The resulting asymmetry (readers accept both spellings, writers
 *    emit only the health: form) is asserted from both sides here, because a
 *    reader that accepts the type but drops every property is a data-loss bug
 *    that looks like a successful read.
 */

import { describe, it, expect } from 'vitest';
import { serialize } from '../src/serializer/turtle-serializer.js';
import { deserialize, deserializeOne } from '../src/deserializer/turtle-parser.js';
import { getContext } from '../src/jsonld/index.js';
import {
  DEPRECATED_TYPE_ALIASES,
  NAMESPACES,
  PROPERTY_PREDICATES,
  TYPE_MAPPING,
} from '../src/vocabularies/index.js';
import type { Condition } from '../src/models/condition.js';
import type { Medication } from '../src/models/medication.js';
import type { LabResult } from '../src/models/lab-result.js';
import type { Allergy } from '../src/models/allergy.js';
import type { Immunization } from '../src/models/immunization.js';

// ─── v1.10-v1.12: the graph edges ───────────────────────────────────────────

describe('clinical v1.10-v1.12 — traversable graph edges', () => {
  it('registers all five predicates', () => {
    expect(PROPERTY_PREDICATES['hasEncounter']).toBe('clinical:hasEncounter');
    expect(PROPERTY_PREDICATES['indicationReference']).toBe('clinical:indicationReference');
    expect(PROPERTY_PREDICATES['parsedIndicationReference']).toBe(
      'clinical:parsedIndicationReference',
    );
    expect(PROPERTY_PREDICATES['linkedCondition']).toBe('clinical:linkedCondition');
    expect(PROPERTY_PREDICATES['linkedConditionIds']).toBe('clinical:linkedConditionIds');
  });

  it('writes hasEncounter as an IRI a consumer can follow', () => {
    const med: Medication = {
      id: 'urn:uuid:med-0001',
      type: 'MedicationRecord',
      medicationName: 'Lisinopril',
      dataProvenance: 'EHRVerified',
      schemaVersion: '1.3',
      hasEncounter: 'urn:uuid:enc-0001',
    };
    const turtle = serialize(med);
    expect(turtle).toContain('clinical:hasEncounter <urn:uuid:enc-0001>');
    // A quoted literal here would make the edge untraversable, which is the
    // exact defect v1.10 was raised to fix.
    expect(turtle).not.toContain('clinical:hasEncounter "urn:uuid:enc-0001"');

    const result = deserializeOne<Medication>(turtle, 'MedicationRecord');
    expect(result!.hasEncounter).toBe('urn:uuid:enc-0001');
  });

  it('keeps stated and parsed indications distinguishable (v1.12)', () => {
    const med: Medication = {
      id: 'urn:uuid:med-0002',
      type: 'MedicationRecord',
      medicationName: 'Metformin',
      dataProvenance: 'EHRVerified',
      schemaVersion: '1.3',
      indication: 'Type 2 diabetes',
      indicationReference: ['urn:uuid:cond-0001'],
      parsedIndicationReference: ['urn:uuid:cond-0002', 'urn:uuid:cond-0003'],
    };
    const turtle = serialize(med);

    // The free-text literal is RETAINED alongside the edges, not replaced.
    expect(turtle).toContain('clinical:indication "Type 2 diabetes"');
    expect(turtle).toContain('clinical:indicationReference <urn:uuid:cond-0001>');
    expect(turtle).toContain('clinical:parsedIndicationReference <urn:uuid:cond-0002>');
    expect(turtle).toContain('clinical:parsedIndicationReference <urn:uuid:cond-0003>');

    const result = deserializeOne<Medication>(turtle, 'MedicationRecord');
    expect(result!.indication).toBe('Type 2 diabetes');
    expect(result!.indicationReference).toEqual(['urn:uuid:cond-0001']);
    expect(result!.parsedIndicationReference).toEqual([
      'urn:uuid:cond-0002',
      'urn:uuid:cond-0003',
    ]);
    // The two must not be merged. A parsed match is only as good as the code
    // or wording it matched on, so a consumer has to be able to label them
    // differently.
    expect(result!.indicationReference).not.toEqual(result!.parsedIndicationReference);
  });

  it('carries indication edges on a procedure, which is why v1.11 widened the domain', () => {
    const proc = {
      id: 'urn:uuid:proc-0001',
      type: 'ProcedureRecord',
      procedureName: 'Coronary angiography',
      dataProvenance: 'EHRVerified',
      schemaVersion: '1.3',
      indicationReference: ['urn:uuid:cond-0004'],
    };
    const turtle = serialize(proc as never);
    expect(turtle).toContain('clinical:indicationReference <urn:uuid:cond-0004>');
  });

  it('replaces the packed linkedConditionIds literal with traversable edges', () => {
    const condition: Condition = {
      id: 'urn:uuid:cond-0010',
      type: 'ConditionRecord',
      conditionName: 'Diabetic retinopathy',
      dataProvenance: 'EHRVerified',
      schemaVersion: '1.3',
      linkedCondition: ['urn:uuid:cond-0011', 'urn:uuid:cond-0012'],
    };
    const turtle = serialize(condition);
    expect(turtle).toContain('clinical:linkedCondition <urn:uuid:cond-0011>');
    expect(turtle).toContain('clinical:linkedCondition <urn:uuid:cond-0012>');

    const result = deserializeOne<Condition>(turtle, 'ConditionRecord');
    expect(result!.linkedCondition).toEqual(['urn:uuid:cond-0011', 'urn:uuid:cond-0012']);
  });

  it('still reads the deprecated linkedConditionIds literal', () => {
    // Retained for backward compatibility with data written before v1.10.
    // Dropping it on read would lose the only link those records carry.
    const turtle = [
      `@prefix cascade: <${NAMESPACES.cascade}> .`,
      `@prefix clinical: <${NAMESPACES.clinical}> .`,
      `@prefix health: <${NAMESPACES.health}> .`,
      '',
      '<urn:uuid:cond-0013> a health:ConditionRecord ;',
      '    health:conditionName "Neuropathy" ;',
      '    clinical:linkedConditionIds "abc-123 def-456" .',
    ].join('\n');

    const result = deserializeOne<Condition>(turtle, 'ConditionRecord');
    expect(result!.linkedConditionIds).toBe('abc-123 def-456');
  });

  it('exposes the edges in the JSON-LD context as IRI-valued sets', () => {
    const ctx = (getContext() as { '@context': Record<string, unknown> })['@context'];
    expect(ctx['hasEncounter']).toEqual({ '@id': 'clinical:hasEncounter', '@type': '@id' });
    for (const key of ['indicationReference', 'parsedIndicationReference', 'linkedCondition']) {
      expect(ctx[key]).toEqual({
        '@id': `clinical:${key}`,
        '@type': '@id',
        '@container': '@set',
      });
    }
  });
});

// ─── v1.13: four deprecated classes, still readable ─────────────────────────

describe('clinical v1.13 — deprecated classes', () => {
  it('maps exactly the four deprecated classes to their health: successors', () => {
    expect(DEPRECATED_TYPE_ALIASES).toEqual({
      [`${NAMESPACES.clinical}LabResult`]: `${NAMESPACES.health}LabResultRecord`,
      [`${NAMESPACES.clinical}Condition`]: `${NAMESPACES.health}ConditionRecord`,
      [`${NAMESPACES.clinical}Allergy`]: `${NAMESPACES.health}AllergyRecord`,
      [`${NAMESPACES.clinical}Immunization`]: `${NAMESPACES.health}ImmunizationRecord`,
    });
  });

  it('never writes a deprecated spelling: no TYPE_MAPPING entry produces one', () => {
    const emitted = Object.values(TYPE_MAPPING).map((m) => m.rdfType);
    for (const deprecated of ['LabResult', 'Condition', 'Allergy', 'Immunization']) {
      expect(emitted).not.toContain(`clinical:${deprecated}`);
    }
  });

  it('writers prefer the health: form', () => {
    const lab: LabResult = {
      id: 'urn:uuid:lab-0001',
      type: 'LabResultRecord',
      testName: 'Hemoglobin A1c',
      resultValue: '6.8',
      resultUnit: '%',
      dataProvenance: 'EHRVerified',
      schemaVersion: '1.3',
    };
    const turtle = serialize(lab);
    expect(turtle).toContain('a health:LabResultRecord ;');
    expect(turtle).not.toContain('clinical:LabResult');
  });

  // Readers accept BOTH spellings, with the deprecated properties too.
  const deprecatedFixtures: {
    label: string;
    requestType: string;
    turtle: string;
    expect: (record: Record<string, unknown>) => void;
  }[] = [
    {
      label: 'clinical:LabResult',
      requestType: 'LabResultRecord',
      turtle: [
        `@prefix cascade: <${NAMESPACES.cascade}> .`,
        `@prefix clinical: <${NAMESPACES.clinical}> .`,
        '',
        '<urn:uuid:legacy-lab-0001> a clinical:LabResult ;',
        '    clinical:testName "Hemoglobin A1c" ;',
        '    clinical:referenceRange "4.0 - 5.6" ;',
        '    clinical:specimenType "Whole Blood" ;',
        '    cascade:dataProvenance cascade:EHRVerified .',
      ].join('\n'),
      expect: (r) => {
        expect(r['testName']).toBe('Hemoglobin A1c');
        expect(r['referenceRange']).toBe('4.0 - 5.6');
        expect(r['specimenType']).toBe('Whole Blood');
      },
    },
    {
      label: 'clinical:Condition',
      requestType: 'ConditionRecord',
      turtle: [
        `@prefix cascade: <${NAMESPACES.cascade}> .`,
        `@prefix clinical: <${NAMESPACES.clinical}> .`,
        `@prefix xsd: <${NAMESPACES.xsd}> .`,
        '',
        '<urn:uuid:legacy-cond-0001> a clinical:Condition ;',
        '    clinical:conditionName "Hypertension" ;',
        '    clinical:onsetDate "2019-04-02T00:00:00Z"^^xsd:dateTime ;',
        '    cascade:dataProvenance cascade:EHRVerified .',
      ].join('\n'),
      expect: (r) => {
        expect(r['conditionName']).toBe('Hypertension');
        expect(r['onsetDate']).toBe('2019-04-02T00:00:00Z');
      },
    },
    {
      label: 'clinical:Allergy',
      requestType: 'AllergyRecord',
      turtle: [
        `@prefix cascade: <${NAMESPACES.cascade}> .`,
        `@prefix clinical: <${NAMESPACES.clinical}> .`,
        '',
        '<urn:uuid:legacy-allergy-0001> a clinical:Allergy ;',
        '    clinical:allergen "Penicillin" ;',
        '    clinical:reaction "Hives (urticaria)" ;',
        '    clinical:allergyCategory "medication" ;',
        '    cascade:dataProvenance cascade:EHRVerified .',
      ].join('\n'),
      expect: (r) => {
        expect(r['allergen']).toBe('Penicillin');
        expect(r['reaction']).toBe('Hives (urticaria)');
        expect(r['allergyCategory']).toBe('medication');
      },
    },
    {
      label: 'clinical:Immunization',
      requestType: 'ImmunizationRecord',
      turtle: [
        `@prefix cascade: <${NAMESPACES.cascade}> .`,
        `@prefix clinical: <${NAMESPACES.clinical}> .`,
        '',
        '<urn:uuid:legacy-imm-0001> a clinical:Immunization ;',
        '    clinical:vaccineName "Influenza, seasonal" ;',
        '    clinical:vaccineCode "150" ;',
        '    clinical:lotNumber "AJ4821" ;',
        '    cascade:dataProvenance cascade:EHRVerified .',
      ].join('\n'),
      expect: (r) => {
        expect(r['vaccineName']).toBe('Influenza, seasonal');
        expect(r['vaccineCode']).toBe('150');
        expect(r['lotNumber']).toBe('AJ4821');
      },
    },
  ];

  for (const fixture of deprecatedFixtures) {
    it(`reads a pod that spells the class ${fixture.label}, with its data`, () => {
      const results = deserialize<Record<string, unknown> & { id: string; type: string }>(
        fixture.turtle,
        fixture.requestType,
      );
      expect(results).toHaveLength(1);
      const record = results[0]!;
      // The record is reported under the current type name, not the old one.
      expect(record.type).toBe(fixture.requestType);
      expect(record.dataProvenance).toBe('EHRVerified');
      // ...and it carries its data. A record with an id and nothing else is a
      // silent data loss, not a successful read.
      fixture.expect(record);
    });
  }

  it('returns both spellings from a single call on a mixed document', () => {
    const turtle = [
      `@prefix cascade: <${NAMESPACES.cascade}> .`,
      `@prefix clinical: <${NAMESPACES.clinical}> .`,
      `@prefix health: <${NAMESPACES.health}> .`,
      '',
      '<urn:uuid:lab-new> a health:LabResultRecord ;',
      '    health:testName "Ferritin" .',
      '<urn:uuid:lab-old> a clinical:LabResult ;',
      '    clinical:testName "Vitamin D" .',
    ].join('\n');

    const results = deserialize<LabResult>(turtle, 'LabResultRecord');
    expect(results.map((r) => r.id)).toEqual(['urn:uuid:lab-new', 'urn:uuid:lab-old']);
    expect(results.map((r) => r.testName)).toEqual(['Ferritin', 'Vitamin D']);
  });

  it('does not alias a class that was never deprecated', () => {
    // clinical:Medication, clinical:VitalSign and clinical:Procedure are alive
    // and are not superseded by anything; aliasing them would be wrong.
    const turtle = [
      `@prefix clinical: <${NAMESPACES.clinical}> .`,
      '',
      '<urn:uuid:med-x> a clinical:Medication ; clinical:drugName "Aspirin" .',
    ].join('\n');
    expect(deserialize<Allergy>(turtle, 'AllergyRecord')).toHaveLength(0);
    expect(deserialize<Immunization>(turtle, 'ImmunizationRecord')).toHaveLength(0);
    expect(deserialize<Medication>(turtle, 'MedicationRecord')).toHaveLength(1);
  });
});
