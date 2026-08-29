/**
 * `sh:minCount` — the fields a record of a given class must carry.
 *
 * One rule, all three layers. See `max-count.test.ts` for why this directory is
 * keyed on the rule rather than on the module.
 *
 * The rule that makes this one different from the other two: an `sh:minCount`
 * sits inside ONE node shape, so it is a fact about a (record type, field)
 * PAIR. `maxCount` and `values` are flat because they do not vary in practice;
 * this cannot be, and a flat version would demand a date of birth on a lab
 * result.
 *
 * It also cannot be checked the same way. Every other rule is about a value
 * that is PRESENT and is reached by walking the record; an absent field appears
 * in no such walk, so `validateAgainstTerms` walks `allTerms()` for this one.
 *
 * @see tests/conformance/profile.test.ts  profile-004 and profile-005 end to end
 */

import { describe, it, expect } from 'vitest';

import { validate } from '../../src/validator/index.js';
import { termFor } from '../../src/terms/index.js';
import { errorFields, labResult, patientProfile, record } from './records.js';

describe('sh:minCount', () => {
  describe('what a term declares', () => {
    it('names the record type the field is required OF', () => {
      // cascade:PatientProfileShape, and nothing else. Keyed rather than flat.
      expect(termFor('dateOfBirth')?.minCountByType).toEqual({ PatientProfile: 1 });
      expect(termFor('biologicalSex')?.minCountByType).toEqual({ PatientProfile: 1 });
    });

    it('is absent on a term whose shape requires it nowhere', () => {
      // The assertion that makes the previous one mean something: a term
      // carrying no minCountByType demands nothing of anyone.
      expect(termFor('resultValue')?.minCountByType).toBeUndefined();
      expect(termFor('interpretation')?.minCountByType).toBeUndefined();
    });
  });

  describe('what the validator reports', () => {
    it('names a required field the record does not carry', () => {
      const result = validate(patientProfile({ dateOfBirth: undefined }));

      expect(errorFields(result)).toContain('dateOfBirth');
    });

    it('says nothing about a field required only of some OTHER record type', () => {
      // A lab result carries neither dateOfBirth nor biologicalSex and is not
      // supposed to. This is what a flat minCount would break, and it is the
      // reason the declaration is keyed by type.
      const result = validate(labResult());

      expect(errorFields(result)).not.toContain('dateOfBirth');
      expect(errorFields(result)).not.toContain('biologicalSex');
    });

    it('says nothing when the required field is present', () => {
      expect(errorFields(validate(patientProfile()))).not.toContain('dateOfBirth');
    });

    it('treats an empty array as absent rather than as a value', () => {
      // `hasField` already takes this position for the missing-coding warning:
      // an empty array serializes to zero triples, so it is an absent value and
      // not a present one. A required field set to `[]` is a record missing it.
      const result = validate(record('PatientProfile', {
        givenName: 'Jane',
        familyName: 'Doe',
        biologicalSex: 'female',
        dateOfBirth: [],
      }));

      expect(errorFields(result)).toContain('dateOfBirth');
    });
  });
});
