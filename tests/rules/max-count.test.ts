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
import {
  errorFields,
  labResult,
  messageFor,
  patientProfile,
  vitalSign,
  warningFields,
} from './records.js';

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

    it('carries the cap beside the minCount, where a shape states both', () => {
      // `cascade:PatientProfileShape` declares `sh:maxCount 1` on the same
      // `sh:property` block as the `sh:minCount 1` for both of these
      // (core.shapes.ttl:42-43 and :54). Terming a field for one half of its
      // cardinality and stopping there leaves `validate()` reporting the
      // absence of a date of birth while accepting two of them.
      expect(termFor('dateOfBirth')?.maxCount).toBe(1);
      expect(termFor('biologicalSex')?.maxCount).toBe(1);
    });

    it('carries a flat cap for a field all three of its shapes cap alike', () => {
      // `health:LabResultRecordShape` (health.shapes.ttl:956),
      // `clinical:LabResultShape` (clinical.shapes.ttl:1087) and
      // `clinical:VitalSignShape` (clinical.shapes.ttl:1561) each declare
      // `sh:maxCount 1` on their interpretation. `maxCount` is flat and can
      // only be read as every shape's answer, so the three agreeing is what
      // makes a flat 1 the right declaration rather than an over-constraint on
      // whichever class the term happened to be written for.
      expect(termFor('interpretation')?.maxCount).toBe(1);
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

    it('reports a second value on a field whose shape caps it beside a minCount', () => {
      // The vacuous pass this closes: `hasField` sees `dateOfBirth` present so
      // the minCount check passes, and with no cap declared nothing else looked.
      // `serialize()` writes both dates — faithfully, as it should — and
      // `cascade:PatientProfileShape` rejects the graph that reaches it while
      // `validate()` called the record clean.
      const dob = validate(patientProfile({ dateOfBirth: ['1973-08-15', '1980-01-01'] }));

      expect(errorFields(dob)).toContain('dateOfBirth');
      expect(messageFor(dob, 'dateOfBirth')).toContain('at most 1');

      const sex = validate(patientProfile({ biologicalSex: ['male', 'female'] }));

      expect(errorFields(sex)).toContain('biologicalSex');
      expect(messageFor(sex, 'biologicalSex')).toContain('at most 1');
    });

    it('reports a second value that is IN the value set, which the value set cannot', () => {
      // Both members are ratified codes, so the `values` loop passes every one
      // of them and the record's only defect is how many there are. A field
      // termed for its value set and not for its cap is exactly this blind
      // spot: `interpretation: ['H', 'L']` was accepted whole.
      const result = validate(labResult({ interpretation: ['H', 'L'] }));

      expect(errorFields(result)).toContain('interpretation');
      expect(messageFor(result, 'interpretation')).toContain('at most 1');
    });

    it('reports the cap at the severity its shape gives the property, not at error', () => {
      // `clinical:VitalSignShape` binds interpretation at `sh:severity
      // sh:Warning`, and sh:severity belongs to the property shape rather than
      // to any one constraint inside it — so the maxCount in that block reports
      // at Warning too, where the lab shapes' reports at Violation.
      //
      // `valid` is computed from `errors` alone, so this is the difference
      // between reporting a vital sign and rejecting it.
      const result = validate(vitalSign({ interpretation: ['H', 'L'] }));

      expect(warningFields(result)).toContain('interpretation');
      expect(errorFields(result)).not.toContain('interpretation');
    });
  });
});
