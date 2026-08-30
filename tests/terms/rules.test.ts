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

  describe('form: literalList', () => {
    // The quoted counterpart of iriList. emitField's ARRAY_FIELDS branch writes
    // `clinical:drugCode ( "RX1" "RX2" )` — one ordered list — and iriList
    // cannot express it, because uriList emits resources. Without this form
    // drugCodes could only migrate as `literal`, and members() would expand it
    // into repeated triples: the same codes, a different output shape, and no
    // error anywhere to say the list stopped being a list.

    const term = defineTerm({
      key: 'drugCodes',
      predicate: requirePredicate('drugCodes'),
      rule: { form: 'literalList' },
    });

    it('writes one ordered list holding every member, not one triple each', () => {
      expect(
        term.outputsFor({ type: 'InteractionScenario', drugCodes: ['RX1', 'RX2'] }),
      ).toEqual([{ kind: 'list', predicate: 'clinical:drugCode', items: ['RX1', 'RX2'] }]);
    });

    it('writes nothing for an empty list rather than an empty pair of parens', () => {
      expect(term.outputsFor({ type: 'InteractionScenario', drugCodes: [] })).toEqual([]);
    });
  });

  describe('form: prefixedEnum', () => {
    it('qualifies a bare local name into a resource reference', () => {
      // `sleepQuality: 'Good'` is `health:sleepQuality health:Good`. There is no
      // prefixedEnum output KIND to go looking for: eight rule forms, seven
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

      it('writes one triple per member of an array child, not one joined literal', () => {
        // String(['a','b']) is "a,b" — one literal no consumer can split back
        // apart. serializeBlankNode writes a 0..* nested field as repeated
        // predicates, and the arity is the whole content of the field.
        //
        // Declared on clinicalSummary because the emergency contact that
        // motivates it is not in PROPERTY_PREDICATES yet, and a term may not
        // invent vocabulary to make a test convenient. The shape under test is
        // the array, not which field carries it.
        expect(
          childrenOf(
            typed.outputsFor({
              type: 'ExportManifest',
              clinicalSummary: { domain: 'clinical', sourceFile: ['a.ttl', 'b.ttl'] },
            }),
          ),
        ).toEqual([
          { kind: 'literal', predicate: 'cascade:domain', value: 'clinical' },
          { kind: 'literal', predicate: 'cascade:sourceFile', value: 'a.ttl' },
          { kind: 'literal', predicate: 'cascade:sourceFile', value: 'b.ttl' },
        ]);
      });

      it('skips an object child rather than writing [object Object]', () => {
        // serializeBlankNode's chain is string / boolean / number: a child
        // object is left unwritten. Stringifying it puts a literal in the graph
        // that reads as data and is not.
        expect(
          childrenOf(
            typed.outputsFor({
              type: 'ExportManifest',
              clinicalSummary: { domain: 'clinical', nested: { deeper: 1 } },
            }),
          ),
        ).toEqual([{ kind: 'literal', predicate: 'cascade:domain', value: 'clinical' }]);
      });
    });

    describe('a declared child handed an object', () => {
      // The mirror of the scalar-under-a-node case below, and it lost the guard
      // `nestedOutputs` still has: that function returns [] for a child object
      // rather than stamping `[object Object]` into the graph, but a child with
      // a DECLARED rule never reaches it — `{ form: 'literal' }` does
      // `String(member)`, so a malformed nested value became corrupt data
      // asserted about the node instead of an omission or an error.
      //
      // It throws rather than skipping. An object has no faithful literal form,
      // and this module already takes that position one case over; a skip is
      // the silent half-write CLAUDE.md names as the failure mode this SDK is
      // least able to detect.
      const addressTerm = defineTerm({
        key: 'address',
        predicate: requirePredicate('address'),
        rule: {
          form: 'blankNode',
          rdfType: 'cascade:Address',
          children: { addressLine: { form: 'literal' } },
        },
      });

      it('throws, naming the child, rather than writing [object Object]', () => {
        expect(() =>
          addressTerm.outputsFor({
            type: 'PatientProfile',
            address: { addressLine: { street: '742 Evergreen Terrace' } },
          }),
        ).toThrow(/'addressLine'.*cascade:addressLine/s);
      });

      it('throws on an object MEMBER of an array child too', () => {
        // The partial case again: dropping the object member and keeping the
        // string one returns a well-formed output list nothing downstream can
        // tell from a single-member array.
        expect(() =>
          addressTerm.outputsFor({
            type: 'PatientProfile',
            address: { addressLine: ['742 Evergreen Terrace', { street: 'x' }] },
          }),
        ).toThrow(/'addressLine'/);
      });
    });

    describe('nestedPrefix', () => {
      // BLANK_NODE_PREDICATE_PREFIXES maps hasParticipant to `clinical`, and
      // clinical v1.16 declares the children of that node as
      // clinical:participantRoleCode / clinical:participantName. Hardcoding
      // `cascade` writes valid Turtle that every query for the declared
      // predicate misses.

      const participant = defineTerm({
        key: 'hasParticipant',
        predicate: requirePredicate('hasParticipant'),
        rule: { form: 'blankNode', nestedPrefix: 'clinical' },
      });

      it('writes the children under the declared prefix, not cascade', () => {
        expect(
          childrenOf(
            participant.outputsFor({
              type: 'Encounter',
              hasParticipant: {
                participantName: 'Dr Reyes',
                participantRoleCode: ['ATND', 'REF'],
              },
            }),
          ),
        ).toEqual([
          { kind: 'literal', predicate: 'clinical:participantName', value: 'Dr Reyes' },
          { kind: 'literal', predicate: 'clinical:participantRoleCode', value: 'ATND' },
          { kind: 'literal', predicate: 'clinical:participantRoleCode', value: 'REF' },
        ]);
      });

      it('falls back to cascade when the rule declares none', () => {
        const untyped = defineTerm({
          key: 'hasParticipant',
          predicate: requirePredicate('hasParticipant'),
          rule: { form: 'blankNode' },
        });

        expect(
          childrenOf(untyped.outputsFor({ type: 'Encounter', hasParticipant: { note: 'x' } })),
        ).toEqual([{ kind: 'literal', predicate: 'cascade:note', value: 'x' }]);
      });
    });

    describe('a scalar where the rule declares a node', () => {
      // Writing the node anyway is not an option: childrenOf has nothing to
      // read off a string, so it would be `cascade:address [ ]` — a node
      // asserting nothing, with the string it was built from gone. But
      // returning no output is the OTHER silent answer, and it is the one that
      // reaches a caller as a document with the field simply missing.
      //
      // The flat form is a real thing a caller writes, not a straw man:
      // core.ttl declares cascade:addressText and cascade:pharmacyAddress as
      // single strings, and a JS caller gets no compile-time protection from
      // passing one where the nested node is declared. The array-valued field
      // with no rule already throws in emitField on the same reasoning — a
      // caller is owed an error naming the field, not a graph that quietly
      // disagrees with what they passed.
      const addressTerm = defineTerm({
        key: 'address',
        predicate: requirePredicate('address'),
        rule: { form: 'blankNode', rdfType: 'cascade:Address' },
      });

      it('throws, naming the field and the predicate rather than writing nowhere', () => {
        expect(() =>
          addressTerm.outputsFor({
            type: 'PatientProfile',
            address: '742 Evergreen Terrace',
          }),
        ).toThrow(/'address'.*cascade:address/s);
      });

      it('throws on a scalar MEMBER too, rather than serializing the rest of the array', () => {
        // The partial case is the worse one. A mixed array that dropped its
        // scalar member and kept its object member returns a perfectly
        // well-formed output list, and nothing downstream can tell it apart
        // from an array that only ever had the one member.
        const participant = defineTerm({
          key: 'hasParticipant',
          predicate: requirePredicate('hasParticipant'),
          rule: { form: 'blankNode', nestedPrefix: 'clinical' },
        });

        expect(() =>
          participant.outputsFor({
            type: 'Encounter',
            hasParticipant: ['urn:uuid:p1', { participantName: 'Dr Reyes' }],
          }),
        ).toThrow(/'hasParticipant'/);
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

    describe('a record type that names an Object.prototype member', () => {
      // Both maps are plain object literals indexed by DATA. `?? predicate`
      // does not catch an inherited member, because a function is not nullish:
      // `predicateByType['toString']` would be interpolated into the Turtle as
      // `function toString() { [native code] }` and the document stops parsing.

      it('takes the base predicate, not the inherited member', () => {
        for (const inherited of ['toString', 'constructor', 'valueOf']) {
          expect(byPredicate.outputsFor({ type: inherited, snomedCode: '38341003' })).toEqual([
            { kind: 'literal', predicate: 'health:snomedCode', value: '38341003' },
          ]);
        }
      });

      it('takes the base rule, not the inherited member', () => {
        // The base rule here is `iri`, not `literal`, on purpose: an inherited
        // `toString` has no `form`, so the switch falls to its `literal`
        // default and a `literal` base rule would agree with the bug by
        // accident. Against an `iri` base the two answers differ, and a code
        // quoted instead of referenced is a different triple.
        const byRule = defineTerm({
          key: 'snomedCode',
          predicate: requirePredicate('snomedCode'),
          rule: { form: 'iri' },
          ruleByType: { Condition: { form: 'literal' } },
        });

        expect(byRule.outputsFor({ type: 'toString', snomedCode: SCT_URI })).toEqual([
          { kind: 'uri', predicate: 'health:snomedCode', value: SCT_URI },
        ]);
      });
    });

    describe('an override predicate that is not one', () => {
      // `predicate` is documented "from requirePredicate, never a literal", and
      // requirePredicate exists so a term can never author vocabulary. An
      // unvalidated override map is the same hole one field over: a typo
      // compiles, loads, and passes every registry check, then writes codes
      // under a prefix no reader has declared or a predicate no shape
      // constrains. Checked at DECLARATION so the module fails at load.

      function withOverride(value: string) {
        return () =>
          defineTerm({
            key: 'snomedCode',
            predicate: requirePredicate('snomedCode'),
            predicateByType: { VitalSign: value },
            rule: { form: 'literal' },
          });
      }

      it('rejects a mistyped prefix, which would be unparseable Turtle', () => {
        expect(withOverride('clincal:snomedCode')).toThrow(/clincal/);
      });

      it('rejects a mistyped local name, which no shape would constrain', () => {
        expect(withOverride('clinical:snomedCoed')).toThrow(/snomedCoed/);
      });

      it('rejects a value that is not a prefixed name at all', () => {
        expect(withOverride('snomedCode')).toThrow(/prefix:localName/);
      });

      it('accepts the re-prefixing every real override is', () => {
        expect(withOverride('clinical:snomedCode')).not.toThrow();
      });
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
