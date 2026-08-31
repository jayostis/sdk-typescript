/**
 * What a rule form produces in JSON-LD.
 *
 * The counterpart of `tests/terms/rules.test.ts`, and declared the same way:
 * against SYNTHETIC terms defined here, because these say the rule vocabulary
 * can express a distinction, NOT that the SDK writes the right document for any
 * given record. That second claim is made end to end by
 * `tests/conformance/profile/profile-002-full-fields.test.ts > writes JSON-LD
 * that says what its Turtle says`.
 *
 * Every `key` below is a real entry in PROPERTY_PREDICATES — a term may not
 * invent vocabulary, and `requirePredicate` is the only way it gets one.
 *
 * WHY THIS LIVES ON THE TERM AT ALL. `toJsonLd` used to write every value the
 * same way, so a nested structure came out with its children and without the
 * class its term declares — valid JSON-LD that no shape targeting the class
 * reaches, and that no query for a contact finds. The class was already written
 * down once, in the term; nothing read it.
 */

import { describe, it, expect } from 'vitest';

import { defineTerm, requirePredicate } from '../../src/terms/term.js';

describe('jsonLdFor', () => {
  describe('form: literal', () => {
    it('passes the value through, leaving the datatype to the context', () => {
      // NOT stamped with `@type` here even though the rule declares one. The
      // context already says `dateOfBirth` is `xsd:date`, and a second copy of
      // that decision is how two writers come to disagree.
      const term = defineTerm({
        key: 'dateOfBirth',
        predicate: requirePredicate('dateOfBirth'),
        rule: { form: 'literal', datatype: 'xsd:date' },
      });

      expect(term.jsonLdFor({ type: 'PatientProfile', dateOfBirth: '1985-04-12' }))
        .toBe('1985-04-12');
    });

    it('says nothing for a field the record does not carry', () => {
      // `undefined`, which is what `outputsFor` says with `[]`. The caller
      // writes the key only when there is something to write.
      const term = defineTerm({
        key: 'conditionName',
        predicate: requirePredicate('conditionName'),
        rule: { form: 'literal' },
      });

      expect(term.jsonLdFor({ type: 'Condition' })).toBeUndefined();
    });
  });

  describe('form: number', () => {
    it('passes the number through unquoted', () => {
      const term = defineTerm({
        key: 'resultValue',
        predicate: requirePredicate('resultValue'),
        rule: { form: 'number' },
      });

      expect(term.jsonLdFor({ type: 'LabResultRecord', resultValue: 4.2 })).toBe(4.2);
    });
  });

  describe('form: blankNode', () => {
    const emergencyContact = defineTerm({
      key: 'emergencyContact',
      predicate: requirePredicate('emergencyContact'),
      rule: {
        form: 'blankNode',
        rdfType: 'cascade:EmergencyContact',
        children: { contactName: { form: 'literal' } },
      },
    });

    it('stamps the node with the class the term declares', () => {
      // The whole point. A shape targeting `cascade:EmergencyContact` never
      // reaches an untyped node, so a contact written without this is valid,
      // constrained by nothing, and invisible to a query asking for a contact.
      expect(
        emergencyContact.jsonLdFor({
          type: 'PatientProfile',
          emergencyContact: { contactName: 'Maria Rivera' },
        }),
      ).toEqual({ '@type': 'cascade:EmergencyContact', contactName: 'Maria Rivera' });
    });

    it('stamps every member when the field carries several', () => {
      // `cascade:PatientProfileShape` puts no maxCount on this one, unlike
      // `address` and `preferredPharmacy` beside it, so a profile may name more
      // than one person to call — and the second must not come out untyped.
      expect(
        emergencyContact.jsonLdFor({
          type: 'PatientProfile',
          emergencyContact: [{ contactName: 'Maria Rivera' }, { contactName: 'Sam Ortiz' }],
        }),
      ).toEqual([
        { '@type': 'cascade:EmergencyContact', contactName: 'Maria Rivera' },
        { '@type': 'cascade:EmergencyContact', contactName: 'Sam Ortiz' },
      ]);
    });

    it('leaves an untyped node untyped when the term declares no class', () => {
      // An absent `rdfType` means an UNTYPED node, not an empty one — the same
      // reading `outputsForMember` takes. Inventing `@type: undefined` here
      // would put a key in the document that means nothing.
      const untyped = defineTerm({
        key: 'wellnessSummary',
        predicate: requirePredicate('wellnessSummary'),
        rule: { form: 'blankNode', children: { conditionCount: { form: 'number' } } },
      });

      expect(untyped.jsonLdFor({ type: 'ExportManifest', wellnessSummary: { conditionCount: 3 } }))
        .toEqual({ conditionCount: 3 });
    });
  });

  describe('a form with no JSON-LD case yet', () => {
    it('throws and names the field and the form', () => {
      // The assertion this file exists for. Four of the eight forms `FieldRule`
      // declares have no term today, and passing one through is not "skipped",
      // it is "written wrongly": an `iriList` would become an array of bare
      // strings where the graph needs an ordered list of IRIs, and nothing
      // would report it. Whoever terms the first `iriList` field gets an error
      // naming their field rather than a quietly wrong document.
      const term = defineTerm({
        key: 'provenanceLayers',
        predicate: requirePredicate('provenanceLayers'),
        rule: { form: 'iriList', prefix: 'cascade' },
      });

      expect(() =>
        term.jsonLdFor({ type: 'ExportManifest', provenanceLayers: ['DeviceGenerated'] }),
      ).toThrow(/provenanceLayers.*iriList/s);
    });
  });
});
