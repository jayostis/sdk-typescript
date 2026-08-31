/**
 * What a rule form reads back out of a JSON-LD document.
 *
 * The inverse of `jsonLdFor`, so the claim that defines this unit is a ROUND
 * TRIP: a value written by the term and read back by the term is the value that
 * went in. Everything else here is a case of that.
 *
 * Not a formality. `jsonLdFor` puts a class on a nested node that no model
 * declares as a field, so without this half a caller who wrote a record and
 * read it back would get an `emergencyContact` carrying an `@type` key they
 * never set — and `deepEqual` against their own input would fail for a reason
 * they cannot see in their own code.
 *
 * Synthetic terms, as in `tests/terms/rules.test.ts` and its JSON-LD sibling.
 */

import { describe, it, expect } from 'vitest';

import { defineTerm, requirePredicate } from '../../src/terms/term.js';

const emergencyContact = defineTerm({
  key: 'emergencyContact',
  predicate: requirePredicate('emergencyContact'),
  rule: {
    form: 'blankNode',
    rdfType: 'cascade:EmergencyContact',
    children: { contactName: { form: 'literal' } },
  },
});

describe('fromJsonLdValue', () => {
  describe('form: blankNode', () => {
    it('takes the class back off the node', () => {
      expect(
        emergencyContact.fromJsonLdValue({
          '@type': 'cascade:EmergencyContact',
          contactName: 'Maria Rivera',
        }),
      ).toEqual({ contactName: 'Maria Rivera' });
    });

    it('takes it off every member when the field carries several', () => {
      expect(
        emergencyContact.fromJsonLdValue([
          { '@type': 'cascade:EmergencyContact', contactName: 'Maria Rivera' },
          { '@type': 'cascade:EmergencyContact', contactName: 'Sam Ortiz' },
        ]),
      ).toEqual([{ contactName: 'Maria Rivera' }, { contactName: 'Sam Ortiz' }]);
    });

    it('leaves a node that never carried a class alone', () => {
      // A document written by something other than this SDK, or by a term that
      // declares no `rdfType`. Reading is faithful: nothing is invented and
      // nothing is demanded.
      expect(emergencyContact.fromJsonLdValue({ contactName: 'Maria Rivera' }))
        .toEqual({ contactName: 'Maria Rivera' });
    });
  });

  describe('form: literal', () => {
    it('passes the value through', () => {
      const term = defineTerm({
        key: 'dateOfBirth',
        predicate: requirePredicate('dateOfBirth'),
        rule: { form: 'literal', datatype: 'xsd:date' },
      });

      expect(term.fromJsonLdValue('1985-04-12')).toBe('1985-04-12');
    });
  });

  describe('round trip', () => {
    it('gives back the value that was written, for every form with a case', () => {
      // THE CLAIM THIS UNIT EXISTS FOR, and the one that catches a half-fix:
      // adding the class to the writer without teaching the reader passes every
      // assertion above about `jsonLdFor` and still breaks every caller.
      const record = {
        type: 'PatientProfile',
        emergencyContact: { contactName: 'Maria Rivera' },
      };

      expect(emergencyContact.fromJsonLdValue(emergencyContact.jsonLdFor(record)))
        .toEqual(record.emergencyContact);
    });
  });

  describe('a form with no JSON-LD case yet', () => {
    it('throws rather than hand back a value it never wrote', () => {
      // Refused on the way in for the same reason as on the way out: a form
      // this module cannot write is a form it cannot claim to have read.
      const term = defineTerm({
        key: 'provenanceLayers',
        predicate: requirePredicate('provenanceLayers'),
        rule: { form: 'iriList', prefix: 'cascade' },
      });

      expect(() => term.fromJsonLdValue(['cascade:DeviceGenerated']))
        .toThrow(/provenanceLayers.*iriList/s);
    });
  });
});
