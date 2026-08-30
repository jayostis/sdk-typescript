/**
 * A record to hang one rule off, for the files in this directory.
 *
 * A helper, not a test — no `.test.ts` suffix, so vitest does not collect it.
 * `tests/validator.test.ts` has its own `makeRecord` and this is deliberately
 * not shared with it: that one exists to satisfy the hardcoded per-record-type
 * switch, and it will change as that switch shrinks. A rule's tests should not
 * go red because a required-field check somewhere else moved.
 */

import type { CascadeRecord } from '../../src/models/common.js';

type AnyRecord = CascadeRecord & Record<string, unknown>;

/** The base every rule test builds on: valid, minimal, and about nothing. */
export function record(type: string, extra: Record<string, unknown> = {}): AnyRecord {
  return {
    id: 'urn:uuid:rule-test-0001-aaaa-bbbb-ccccddddeeee',
    type,
    dataProvenance: 'ClinicalGenerated',
    schemaVersion: '1.3',
    ...extra,
  } as AnyRecord;
}

/**
 * A lab result carrying the three fields the hardcoded switch demands.
 *
 * Those three are `testName`, `resultValue` and `resultUnit`, and two of them
 * are demanded by nothing in spec — `health:LabResultRecordShape` gives
 * `resultValue` and `resultUnit` no `sh:minCount` at all (#3). They are
 * supplied here so a rule test reports on the rule under test and not on that
 * defect, and they come out of this helper the day #3 does.
 */
export function labResult(extra: Record<string, unknown> = {}): AnyRecord {
  return record('LabResultRecord', {
    testName: 'Ferritin',
    resultValue: '412',
    resultUnit: 'ng/mL',
    ...extra,
  });
}

/** A patient profile carrying every field `cascade:PatientProfileShape` requires. */
export function patientProfile(extra: Record<string, unknown> = {}): AnyRecord {
  return record('PatientProfile', {
    givenName: 'Jane',
    familyName: 'Doe',
    dateOfBirth: '1985-03-12',
    biologicalSex: 'female',
    ...extra,
  });
}

/** The field names of every error in a result, which is what a rule test asserts on. */
export function errorFields(result: { errors: readonly { field: string }[] }): string[] {
  return result.errors.map((e) => e.field);
}

/** The message of the first error on `field`, for asserting what a rule SAID. */
export function messageFor(
  result: { errors: readonly { field: string; message: string }[] },
  field: string,
): string | undefined {
  return result.errors.find((e) => e.field === field)?.message;
}

/**
 * A vital sign carrying the three fields the hardcoded switch demands.
 *
 * Here because `clinical:VitalSignShape` is where a rule's SEVERITY differs
 * from the same rule's severity on a lab result: it binds `interpretation` at
 * `sh:severity sh:Warning` where the two lab shapes leave it at SHACL's
 * `sh:Violation` default. A rule test that only ever asked a lab result would
 * read one verdict and call it the rule's.
 */
export function vitalSign(extra: Record<string, unknown> = {}): AnyRecord {
  return record('VitalSign', {
    vitalType: 'heartRate',
    value: 72,
    unit: 'bpm',
    ...extra,
  });
}

/** The field names of every WARNING in a result — a reported, non-rejecting finding. */
export function warningFields(result: { warnings: readonly { field: string }[] }): string[] {
  return result.warnings.map((w) => w.field);
}

/**
 * EVERY message on `field`, for a record that breaks more than one rule on it.
 *
 * {@link messageFor} returns the first, which is the right read when a test is
 * about a field's only finding and the wrong one as soon as a second rule
 * applies to the same path: `interpretation: ['H', 'quite high']` breaks the
 * value set AND the cap, and asserting on the first message alone makes a test
 * about one rule fail when the other is added.
 */
export function messagesFor(
  result: { errors: readonly { field: string; message: string }[] },
  field: string,
): string[] {
  return result.errors.filter((e) => e.field === field).map((e) => e.message);
}
