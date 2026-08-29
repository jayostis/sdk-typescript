/**
 * What a rule form produces, per record type.
 *
 * Declared against SYNTHETIC terms defined here, because no real term exists
 * yet: these say the rule vocabulary can express a distinction, NOT that the
 * SDK writes the right predicate for any given record. That second claim needs
 * a fixture serialized end to end.
 *
 * Every `key` below is a real entry in PROPERTY_PREDICATES — a term may not
 * invent vocabulary, and `requirePredicate` is the only way it gets one.
 */

import { describe, it, expect } from 'vitest';

import { defineTerm, requirePredicate } from '../../src/terms/term.js';
import type { Output } from '../../src/terms/term.js';

const SCT_URI = 'http://snomed.info/sct/271649006';

function childrenOf(outputs: Output[]): Output[] {
  return (outputs[0] as Extract<Output, { kind: 'blankNode' }>).children;
}

describe('outputsFor', () => {
  describe('form: literal', () => {
    it('writes a quoted literal', () => {
      const term = defineTerm({
        key: 'conditionName',
        predicate: requirePredicate('conditionName'),
        rule: { form: 'literal' },
      });

      expect(term.outputsFor({ type: 'Condition', conditionName: 'Hypertension' })).toEqual([
        { kind: 'literal', predicate: 'health:conditionName', value: 'Hypertension' },
      ]);
    });

    it('carries a declared datatype onto the output', () => {
      const term = defineTerm({
        key: 'byteSize',
        predicate: requirePredicate('byteSize'),
        rule: { form: 'literal', datatype: 'xsd:integer' },
      });

      expect(term.outputsFor({ type: 'Attachment', byteSize: 1024 })).toEqual([
        { kind: 'literal', predicate: 'cascade:byteSize', value: '1024', datatype: 'xsd:integer' },
      ]);
    });
  });

  describe('form: number', () => {
    // emitField writes a numeric field as a BARE token — `health:steps 8432`,
    // not `"8432"`. The quoted form is an xsd:string where every fixture has an
    // xsd:integer, so migrating a numeric field needs a form that says bare.

    it('writes an integer as a bare token', () => {
      const term = defineTerm({
        key: 'steps',
        predicate: requirePredicate('steps'),
        rule: { form: 'number' },
      });

      expect(term.outputsFor({ type: 'DailyActivitySnapshot', steps: 8432 })).toEqual([
        { kind: 'number', predicate: 'health:steps', value: 8432 },
      ]);
    });

    it('writes a decimal as a bare token too', () => {
      const term = defineTerm({
        key: 'durationHours',
        predicate: requirePredicate('durationHours'),
        rule: { form: 'number' },
      });

      expect(term.outputsFor({ type: 'DailySleepSnapshot', durationHours: 7.4 })).toEqual([
        { kind: 'number', predicate: 'health:durationHours', value: 7.4 },
      ]);
    });

    it('falls back to a quoted literal when the value is not a number', () => {
      // The same fall-through emitField takes: its numeric branch is guarded on
      // `typeof value === 'number'`, so a string keeps its quotes.
      const term = defineTerm({
        key: 'steps',
        predicate: requirePredicate('steps'),
        rule: { form: 'number' },
      });

      expect(term.outputsFor({ type: 'DailyActivitySnapshot', steps: 'many' })).toEqual([
        { kind: 'literal', predicate: 'health:steps', value: 'many' },
      ]);
    });
  });

  describe('form: boolean', () => {
    const term = defineTerm({
      key: 'isActive',
      predicate: requirePredicate('isActive'),
      rule: { form: 'boolean' },
    });

    it('writes a bare true/false', () => {
      expect(term.outputsFor({ type: 'Condition', isActive: true })).toEqual([
        { kind: 'boolean', predicate: 'clinical:status', value: true },
      ]);
    });

    it('falls back to a quoted literal when the value is not a boolean', () => {
      expect(term.outputsFor({ type: 'Condition', isActive: 'yes' })).toEqual([
        { kind: 'literal', predicate: 'clinical:status', value: 'yes' },
      ]);
    });
  });

  describe('form: iri', () => {
    it('writes a resource reference, not a quoted literal', () => {
      const term = defineTerm({
        key: 'hasEncounter',
        predicate: requirePredicate('hasEncounter'),
        rule: { form: 'iri' },
      });

      expect(term.outputsFor({ type: 'VitalSign', hasEncounter: 'urn:uuid:enc-1' })).toEqual([
        { kind: 'uri', predicate: 'clinical:hasEncounter', value: 'urn:uuid:enc-1' },
      ]);
    });
  });

  describe('form: iriList', () => {
    it('writes one ordered list holding every member, not one triple each', () => {
      const term = defineTerm({
        key: 'provenanceLayers',
        predicate: requirePredicate('provenanceLayers'),
        rule: { form: 'iriList' },
      });

      expect(
        term.outputsFor({
          type: 'ExportManifest',
          provenanceLayers: ['cascade:DeviceGenerated', 'urn:uuid:layer-2'],
        }),
      ).toEqual([
        {
          kind: 'uriList',
          predicate: 'cascade:provenanceLayers',
          items: ['cascade:DeviceGenerated', 'urn:uuid:layer-2'],
        },
      ]);
    });

    it('qualifies every member with the declared prefix', () => {
      // provenanceLayers is the one IRI_LIST_FIELDS entry the SDK writes, and
      // emitField maps each member to `cascade:${item}`. Unqualified, the
      // member is written `<DeviceGenerated>` — a relative IRI, which resolves
      // against whatever base the reader happens to have.
      const term = defineTerm({
        key: 'provenanceLayers',
        predicate: requirePredicate('provenanceLayers'),
        rule: { form: 'iriList', prefix: 'cascade' },
      });

      expect(
        term.outputsFor({
          type: 'ExportManifest',
          provenanceLayers: ['DeviceGenerated', 'UserEntered'],
        }),
      ).toEqual([
        {
          kind: 'uriList',
          predicate: 'cascade:provenanceLayers',
          items: ['cascade:DeviceGenerated', 'cascade:UserEntered'],
        },
      ]);
    });

    it('leaves members alone when the rule declares no prefix', () => {
      const term = defineTerm({
        key: 'deviceSources',
        predicate: requirePredicate('deviceSources'),
        rule: { form: 'iriList' },
      });

      expect(
        term.outputsFor({ type: 'ExportManifest', deviceSources: ['urn:uuid:dev-1'] }),
      ).toEqual([
        { kind: 'uriList', predicate: 'cascade:deviceSources', items: ['urn:uuid:dev-1'] },
      ]);
    });
  });

  describe('form: prefixedEnum', () => {
    it('qualifies a bare local name into a resource reference', () => {
      // `sleepQuality: 'Good'` is `health:sleepQuality health:Good`. There is no
      // prefixedEnum output KIND to go looking for: seven rule forms, six
      // output kinds, and the mismatch is not an omission.
      const term = defineTerm({
        key: 'sleepQuality',
        predicate: requirePredicate('sleepQuality'),
        rule: { form: 'prefixedEnum', prefix: 'health' },
      });

      expect(term.outputsFor({ type: 'DailySleepSnapshot', sleepQuality: 'Good' })).toEqual([
        { kind: 'uri', predicate: 'health:sleepQuality', value: 'health:Good' },
      ]);
    });
  });

  describe('form: blankNode', () => {
    const typed = defineTerm({
      key: 'clinicalSummary',
      predicate: requirePredicate('clinicalSummary'),
      rule: { form: 'blankNode', rdfType: 'cascade:RecordSummary' },
    });

    it('writes a typed node whose children are the nested fields', () => {
      expect(
        typed.outputsFor({
          type: 'ExportManifest',
          clinicalSummary: { domain: 'clinical', earliestRecord: '2024-01-02' },
        }),
      ).toEqual([
        {
          kind: 'blankNode',
          predicate: 'cascade:clinicalSummary',
          rdfType: 'cascade:RecordSummary',
          children: [
            { kind: 'literal', predicate: 'cascade:domain', value: 'clinical' },
            { kind: 'literal', predicate: 'cascade:earliestRecord', value: '2024-01-02' },
          ],
        },
      ]);
    });

    it('omits rdfType when the rule declares none, rather than carrying an empty one', () => {
      // An empty `a` is unparseable Turtle: it fails the whole document, not
      // just the node. serializeBlankNode has the same guard.
      const untyped = defineTerm({
        key: 'clinicalSummary',
        predicate: requirePredicate('clinicalSummary'),
        rule: { form: 'blankNode' },
      });

      expect(
        untyped.outputsFor({ type: 'ExportManifest', clinicalSummary: { domain: 'clinical' } }),
      ).toEqual([
        {
          kind: 'blankNode',
          predicate: 'cascade:clinicalSummary',
          children: [{ kind: 'literal', predicate: 'cascade:domain', value: 'clinical' }],
        },
      ]);
    });

    describe('children', () => {
      const record = {
        type: 'ExportManifest',
        clinicalSummary: {
          type: 'RecordSummary',
          id: 'urn:uuid:summary-1',
          domain: 'clinical',
          recordCount: 42,
          complete: true,
          meanPerDay: 1.5,
        },
      };

      it('skips type and id instead of inventing a triple for each', () => {
        expect(childrenOf(typed.outputsFor(record)).map((child) => child.predicate)).toEqual([
          'cascade:domain',
          'cascade:recordCount',
          'cascade:complete',
          'cascade:meanPerDay',
        ]);
      });

      it('keeps numbers and booleans bare rather than stringifying them', () => {
        // Stringifying turns a nested 42 from an xsd:integer into an
        // xsd:string, which is a different triple to every consumer.
        expect(childrenOf(typed.outputsFor(record))).toEqual([
          { kind: 'literal', predicate: 'cascade:domain', value: 'clinical' },
          { kind: 'number', predicate: 'cascade:recordCount', value: 42 },
          { kind: 'boolean', predicate: 'cascade:complete', value: true },
          { kind: 'number', predicate: 'cascade:meanPerDay', value: 1.5 },
        ]);
      });
    });
  });

  describe('an array value', () => {
    const term = defineTerm({
      key: 'snomedCode',
      predicate: requirePredicate('snomedCode'),
      rule: { form: 'literal' },
    });

    it('writes one output per member', () => {
      expect(
        term.outputsFor({ type: 'Condition', snomedCode: ['38341003', '59621000'] }),
      ).toEqual([
        { kind: 'literal', predicate: 'health:snomedCode', value: '38341003' },
        { kind: 'literal', predicate: 'health:snomedCode', value: '59621000' },
      ]);
    });

    it('takes a bare scalar as a one-member list', () => {
      expect(term.outputsFor({ type: 'Condition', snomedCode: '38341003' })).toEqual([
        { kind: 'literal', predicate: 'health:snomedCode', value: '38341003' },
      ]);
    });
  });

  describe('resolution by record type', () => {
    // health:ConditionRecordShape declares sh:path health:snomedCode at
    // sh:Violation; four clinical shapes declare clinical:snomedCode. A code
    // written under the wrong one is still valid Turtle in a file that still
    // parses, and every query asking `?condition health:snomedCode ?code` comes
    // back empty. A code no query can find is worth what an absent code is worth.

    const byPredicate = defineTerm({
      key: 'snomedCode',
      predicate: requirePredicate('snomedCode'),
      predicateByType: { VitalSign: 'clinical:snomedCode' },
      rule: { form: 'literal' },
    });

    it('takes the override predicate for the record type that declares one', () => {
      expect(byPredicate.outputsFor({ type: 'VitalSign', snomedCode: '271649006' })).toEqual([
        { kind: 'literal', predicate: 'clinical:snomedCode', value: '271649006' },
      ]);
    });

    it('falls back to the base predicate for every other record type', () => {
      expect(byPredicate.outputsFor({ type: 'Condition', snomedCode: '38341003' })).toEqual([
        { kind: 'literal', predicate: 'health:snomedCode', value: '38341003' },
      ]);
    });

    it('selects the RULE by record type too, not only the predicate', () => {
      const byRule = defineTerm({
        key: 'snomedCode',
        predicate: requirePredicate('snomedCode'),
        rule: { form: 'literal' },
        ruleByType: { VitalSign: { form: 'iri' } },
      });

      expect(byRule.outputsFor({ type: 'VitalSign', snomedCode: SCT_URI })).toEqual([
        { kind: 'uri', predicate: 'health:snomedCode', value: SCT_URI },
      ]);
      expect(byRule.outputsFor({ type: 'Condition', snomedCode: SCT_URI })).toEqual([
        { kind: 'literal', predicate: 'health:snomedCode', value: SCT_URI },
      ]);
    });
  });

  describe('an absent field', () => {
    it('produces no outputs, while a present one still produces some', () => {
      // Both halves on purpose: asserting only `[]` is satisfied by a term that
      // produces nothing at all, which is the failure this is meant to catch.
      const term = defineTerm({
        key: 'interpretation',
        predicate: requirePredicate('interpretation'),
        rule: { form: 'literal' },
      });

      expect(term.outputsFor({ type: 'LabResult', interpretation: 'High' })).toHaveLength(1);
      expect(term.outputsFor({ type: 'LabResult' })).toEqual([]);
    });
  });
});
