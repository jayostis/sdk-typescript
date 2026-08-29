/**
 * `sh:maxCount` — how many values the vocabulary permits.
 *
 * One rule, all three layers, in one file: what a term DECLARES, what the
 * writer does with it (nothing, on purpose), and what `validate()` REPORTS.
 * Keyed on the rule rather than on a module, because the rule is what spans
 * them — split across `tests/terms/`, `tests/serializer.test.ts` and
 * `tests/validator.test.ts`, each third can only claim the other two exist,
 * and a claim a file cannot assert is one nothing notices going stale.
 *
 * Constructed records rather than fixtures. `tests/conformance/` asks the same
 * questions of `lab-013` and `absent-003`, which is the better test when a
 * fixture exists — but a constraint component should not wait on the corpus to
 * have an example of it.
 *
 * @see tests/conformance/lab.test.ts     lab-013, the same rule end to end
 * @see tests/conformance/absent.test.ts  absent-003, likewise
 */

import { describe, it, expect } from 'vitest';

import { validate } from '../../src/validator/index.js';
import { termFor } from '../../src/terms/index.js';
import { errorFields, labResult, messageFor, patientProfile } from './records.js';

describe('sh:maxCount', () => {
  describe('what a term declares', () => {
    it('carries the cap its shape states', () => {
      // health:LabResultRecordShape and cascade:DataAbsentReasonShape.
      expect(termFor('resultValue')?.maxCount).toBe(1);
      expect(termFor('dataAbsentReason')?.maxCount).toBe(1);
    });

    it('carries NO cap for a field its shape does not cap', () => {
      // cascade:PatientProfileShape declares no sh:maxCount for
      // cascade:emergencyContact, where cascade:address and
      // cascade:preferredPharmacy beside it are both capped at one. A profile
      // may name more than one person to call.
      //
      // Absent means UNCONSTRAINED, not unfilled, and the three assertions are
      // one claim: the difference is invisible unless a capped and an uncapped
      // field are read together.
      expect(termFor('emergencyContact')?.maxCount).toBeUndefined();
      expect(termFor('address')?.maxCount).toBe(1);
      expect(termFor('preferredPharmacy')?.maxCount).toBe(1);
    });
  });

  describe('what the writer does', () => {
    it('writes every value, whatever the cap says', () => {
      // Two values break sh:maxCount 1 and are written anyway. A shape can only
      // judge what reached the graph, so a writer that dropped the second would
      // hand the validator a record with nothing left to violate and earn a
      // clean verdict on incomplete data.
      expect(
        termFor('resultValue')?.outputsFor(labResult({ resultValue: ['4.2', '4.3'] })),
      ).toEqual([
        { kind: 'literal', predicate: 'health:resultValue', value: '4.2' },
        { kind: 'literal', predicate: 'health:resultValue', value: '4.3' },
      ]);
    });
  });

  describe('what the validator reports', () => {
    it('names the field, the count and the cap', () => {
      const result = validate(labResult({ resultValue: ['4.2', '4.3'] }));

      expect(errorFields(result)).toContain('resultValue');
      expect(messageFor(result, 'resultValue')).toContain('at most 1');
    });

    it('says nothing about several values of an uncapped field', () => {
      // The assertion that makes the previous one mean something. Reading an
      // absent maxCount as 1 would reject this conformant record — which is the
      // defect `validate()` already has where it requires resultValue and
      // resultUnit that no shape requires (#3).
      const result = validate(
        patientProfile({
          emergencyContact: [
            { contactName: 'Maria Rivera', contactRelationship: 'spouse' },
            { contactName: 'Sam Okafor', contactRelationship: 'sibling' },
          ],
        }),
      );

      expect(errorFields(result)).not.toContain('emergencyContact');
    });

    it('says nothing about a single value of a capped field', () => {
      expect(errorFields(validate(labResult({ resultValue: '412' })))).not.toContain('resultValue');
    });
  });
});
