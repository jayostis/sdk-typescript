/**
 * A required field supplied TWICE is reported as supplied twice, never as
 * missing.
 *
 * THE RULE is `singleStringError`'s own argument, written when `id` and
 * `schemaVersion` got it: "a message naming the wrong defect sends the caller
 * looking for a missing field they supplied twice." Two base fields were fixed
 * and every type-specific required field was left behind, each still asking
 * `typeof val === 'string'` and reporting `X is required for Y` when the answer
 * is no.
 *
 * THE VERDICT WAS NEVER WRONG — `valid` is false either way, which is why this
 * survived a branch about false accepts. What is wrong is the only thing the
 * caller is given to act on. A document carrying two `health:medicationName`
 * triples is a document whose author put a name in it, and the SDK's advice was
 * to add one.
 *
 * REACHABLE, and only now: the faithful reader returns an array for any
 * repeated predicate, so every field below can arrive as one off a real graph.
 * Before it, a record shaped like this had to be hand-built.
 *
 * @see src/validator/validator.ts  singleStringError
 */

import { describe, it, expect } from 'vitest';

import { validate } from '../../src/validator/validator.js';
import { record, messageFor } from './records.js';

/** Every type-specific required field, with a record type that demands it. */
const REQUIRED_STRINGS: ReadonlyArray<readonly [string, string, Record<string, unknown>]> = [
  ['MedicationRecord', 'medicationName', { isActive: true }],
  ['ConditionRecord', 'conditionName', { status: 'active' }],
  ['AllergyRecord', 'allergen', {}],
  ['LabResultRecord', 'testName', { resultValue: '412', resultUnit: 'ng/mL' }],
  ['LabResultRecord', 'resultUnit', { testName: 'Ferritin', resultValue: '412' }],
  ['VitalSign', 'unit', { vitalType: 'heartRate', value: 72 }],
  ['ImmunizationRecord', 'vaccineName', {}],
  ['CoverageRecord', 'providerName', {}],
  ['PatientProfile', 'givenName', { familyName: 'Doe', dateOfBirth: '1985-03-12', biologicalSex: 'female' }],
  ['PatientProfile', 'familyName', { givenName: 'Jane', dateOfBirth: '1985-03-12', biologicalSex: 'female' }],
];

describe('a required string carrying two values', () => {
  it.each(REQUIRED_STRINGS)('%s.%s is reported as two values, not as absent', (type, field, rest) => {
    const result = validate(record(type, { ...rest, [field]: ['first', 'second'] }));
    const message = messageFor(result, field);

    expect(result.valid).toBe(false);
    expect(message).toBe(`${field} carries 2 values; it must be a single non-empty string`);
    expect(message).not.toMatch(/required/);
  });

  it.each(REQUIRED_STRINGS)('%s.%s still says what is missing when it IS missing', (type, field, rest) => {
    // THE GUARD. The array message must not replace the absent one — a field
    // nobody supplied is still the commonest reason this rule fires, and its
    // message is what every existing caller reads.
    const result = validate(record(type, rest));

    expect(result.valid).toBe(false);
    expect(messageFor(result, field)).toMatch(/required/);
  });
});

describe('a required number carrying two values', () => {
  it('VitalSign.value is reported as two values, not as absent', () => {
    // `hasNumber` is the same defect in the other type: `value: [72, 80]` is
    // two readings under one predicate, and "value is required" describes
    // neither of them.
    const result = validate(
      record('VitalSign', { vitalType: 'heartRate', unit: 'bpm', value: [72, 80] }),
    );

    expect(result.valid).toBe(false);
    expect(messageFor(result, 'value')).toBe(
      'value carries 2 values; it must be a single number',
    );
  });

  it('VitalSign.value still says what is missing when it IS missing', () => {
    const result = validate(record('VitalSign', { vitalType: 'heartRate', unit: 'bpm' }));

    expect(result.valid).toBe(false);
    expect(messageFor(result, 'value')).toMatch(/required/);
  });

  it('VitalSign.value still rejects a non-numeric scalar as absent', () => {
    // A string is not two values and not a number. It has always been reported
    // with the absent message, and the array case is the only one moving.
    const result = validate(record('VitalSign', { vitalType: 'heartRate', unit: 'bpm', value: '72' }));

    expect(messageFor(result, 'value')).toMatch(/required/);
  });
});
