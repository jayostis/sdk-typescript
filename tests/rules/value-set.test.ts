/**
 * `sh:in` — the values the vocabulary admits.
 *
 * One rule, all three layers. See `max-count.test.ts` for why this directory is
 * keyed on the rule rather than on the module.
 *
 * The LISTS are not re-asserted member by member. They are extracted from the
 * vendored shapes by script, and a test that retyped seventy-four codes would
 * be a second hand-transcription checking the first — the exact defect the
 * extraction exists to avoid. What is asserted is the size, the boundaries a
 * reader cannot infer, and what the validator does with a value off the list.
 *
 * @see tests/conformance/absent.test.ts  absent-002, the same rule end to end
 * @see tests/conformance/lab.test.ts     lab-010, likewise
 */

import { describe, it, expect } from 'vitest';

import { validate } from '../../src/validator/index.js';
import { termFor } from '../../src/terms/index.js';
import { errorFields, labResult, messageFor, patientProfile, record } from './records.js';

describe('sh:in', () => {
  describe('what a term declares', () => {
    it('carries the list its shape binds', () => {
      expect(termFor('interpretation')?.values).toHaveLength(74);
      expect(termFor('dataAbsentReason')?.values).toHaveLength(15);
      expect(termFor('biologicalSex')?.values).toEqual(['male', 'female', 'intersex']);
    });

    it('is flat, where a predicate is keyed by record type', () => {
      // A vital sign writes clinical:interpretation and a lab result writes
      // health:interpretation, and all three node shapes bind the SAME list.
      // The predicate varies by record type; the value set does not, which is
      // why `values` is flat where `predicateByType` is a map.
      const term = termFor('interpretation');

      expect(term?.predicateByType).toEqual({ VitalSign: 'clinical:interpretation' });
      expect(term?.values).toBe(termFor('interpretation')?.values);
    });

    it('admits both cases of a word, because clinical v1.15 widened the list', () => {
      // 'H' and 'high' are different entries, and so are 'High' and 'high'. The
      // widening exists to keep pre-ratification records readable rather than
      // silently rejecting them, so folding the case here would re-reject
      // exactly what it admitted. Asserted because a reader tidying this list
      // would otherwise have no reason not to.
      expect(termFor('interpretation')?.values).toEqual(
        expect.arrayContaining(['H', 'high', 'High', 'abnormal', 'Abnormal']),
      );
    });

    it('does not admit a plausible phrase spec never ratified', () => {
      // lab-010's value. The list is long enough that "is it in there" is not
      // answerable by eye.
      expect(termFor('interpretation')?.values).not.toContain('quite high');
    });

    it('carries no list for a field constrained by its datatype instead', () => {
      // An empty `values` would read as an empty value set — admitting nothing
      // — where absent correctly means "not constrained that way". A date is
      // judged by sh:datatype xsd:date.
      expect(termFor('dateOfBirth')?.values).toBeUndefined();
    });
  });

  describe('what the writer does', () => {
    it('writes a value the list does not admit', () => {
      // Faithful first. A writer that refused would leave the validator nothing
      // to object to, and absent-002 exists to be written and then rejected:
      // "UNK" is a real code from v3-NullFlavor rather than the set the property
      // is bound to, and mapping it is the importer's job.
      expect(
        termFor('dataAbsentReason')?.outputsFor(record('LabResultRecord', { dataAbsentReason: 'UNK' })),
      ).toEqual([{ kind: 'literal', predicate: 'cascade:dataAbsentReason', value: 'UNK' }]);
    });
  });

  describe('what the validator reports', () => {
    it('names the field and the offending value', () => {
      const result = validate(record('LabResultRecord', { dataAbsentReason: 'UNK' }));

      expect(errorFields(result)).toContain('dataAbsentReason');
      expect(messageFor(result, 'dataAbsentReason')).toContain('UNK');
    });

    it('reports a bad value wherever it sits in the array', () => {
      // The SECOND value is the bad one and the first is legal. A check reading
      // only `members[0]` passes this — the same partial answer the reader used
      // to give when it kept the first triple of a repeated predicate.
      const result = validate(labResult({ interpretation: ['H', 'quite high'] }));

      expect(messageFor(result, 'interpretation')).toContain('quite high');
    });

    it('says nothing about a value the list admits', () => {
      expect(errorFields(validate(labResult({ interpretation: 'H' })))).not.toContain('interpretation');
      expect(errorFields(validate(patientProfile()))).not.toContain('biologicalSex');
    });
  });
});
