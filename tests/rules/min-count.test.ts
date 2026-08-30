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
import { allTerms, termFor } from '../../src/terms/index.js';
import { severityFor } from '../../src/terms/term.js';
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

/**
 * The severity a missing required field is reported at.
 *
 * `severityByType` is documented on `TermSpec` as governing EVERY rule the term
 * declares for the type, and it has to be: `sh:severity` belongs to the
 * property shape rather than to any one constraint inside it, so one
 * `sh:property` block's `sh:minCount`, `sh:maxCount` and `sh:in` all report at
 * that block's severity. `maxCount` and `values` read it; this loop hardcoded
 * `'error'`.
 *
 * NOT REACHABLE END TO END, and the last test here is what says so. No term
 * declares both `severityByType` and `minCountByType`, so no record `validate()`
 * can be handed today takes the path — which is exactly why it survived. The
 * resolution is asserted where it lives instead, on the function both call sites
 * now share.
 */
describe('sh:severity on a missing required field', () => {
  it('resolves the term severity a shape declares for the type', () => {
    // `clinical:VitalSignShape` binds `health:interpretation`'s value set at
    // sh:Warning; `health:LabResultRecordShape` binds the byte-identical list
    // at SHACL's default. One list, two verdicts, decided by the class.
    const interpretation = termFor('interpretation') as never;

    expect(severityFor(interpretation, 'VitalSign')).toBe('warning');
    expect(severityFor(interpretation, 'LabResultRecord')).toBe('error');
  });

  it('defaults to error, because SHACL defaults to sh:Violation', () => {
    // A shape that says nothing about severity is REJECTING, not reporting.
    expect(severityFor(termFor('dateOfBirth') as never, 'PatientProfile')).toBe('error');
    expect(severityFor(termFor('dateOfBirth') as never, undefined)).toBe('error');
  });

  it('reads an own property only, never one off Object.prototype', () => {
    // `record.type` is DATA. A record typed 'constructor' would otherwise
    // resolve a prototype member and be reported at whatever that stringifies
    // to. `minCountByType` is guarded the same way, one loop up.
    expect(severityFor(termFor('interpretation') as never, 'constructor')).toBe('error');
  });

  it('reports a missing required field at that severity, not a hardcoded one', () => {
    // Today every term with a minCount declares no severity, so this asserts
    // the default arrives through `severityFor` rather than that the override
    // does. The next test is what makes the gap visible rather than silent.
    const missing = validate(patientProfile({ dateOfBirth: undefined })).errors
      .find((e) => e.field === 'dateOfBirth');

    expect(missing?.severity).toBe(severityFor(termFor('dateOfBirth') as never, 'PatientProfile'));
  });

  it('has no term declaring both, which is why the flip was never observed', () => {
    // A PRECONDITION, not a preference. The day a term declares both, this goes
    // red and the end-to-end case above it becomes writable — a warning-severity
    // minCount must land in `warnings`, because `valid` is computed from
    // `errors` alone and a shape saying "reported, not rejected" would
    // otherwise refuse a conformant record.
    const both = allTerms().filter((t) => t.severityByType && t.minCountByType);

    expect(both.map((t) => t.key)).toEqual([]);
  });
});
