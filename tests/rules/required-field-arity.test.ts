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
 * THE VERDICT WAS NOT WRONG WHEN THIS WAS WRITTEN — `valid` was false either
 * way, which is why the file survived a branch about false accepts. What was
 * wrong is the only thing the caller is given to act on. A document carrying two
 * `health:medicationName` triples is a document whose author put a name in it,
 * and the SDK's advice was to add one.
 *
 * TWO FIELDS LEFT THIS FILE AND ARE NOT COMING BACK ON THEIR OWN.
 * `cascade:givenName` and `cascade:familyName` were in the list `requiredString`
 * covered, and no shape `spec` publishes declares an `sh:path` for either — the harness
 * in `tests/support/shacl.ts` REFUSES to judge a record carrying them rather
 * than return a `conforms: true` that means nothing. So there is no rule to
 * transcribe and no verdict to check against, which is #47, blocked in turn on
 * #35 deciding whether a patient's name belongs on that document at all.
 *
 * They are stated here and asserted NOWHERE. A row pinning "givenName raises no
 * finding" would be green, and would be claiming an answer to a question nobody
 * has answered — the difference between a test that records a DECISION (spec
 * declares no cap on `cascade:emergencyContact`, deliberately) and one that
 * records an UNKNOWN. Prose can hold an open question; a passing test cannot.
 *
 * REACHABLE, and only now: the faithful reader returns an array for any
 * repeated predicate, so every field below can arrive as one off a real graph.
 * Before it, a record shaped like this had to be hand-built.
 *
 * @see src/validator/validator.ts  singleStringError, on the legacy path
 * @see src/validator/term-findings.ts  where the cap is read today
 */

import { describe, it, expect } from 'vitest';

import { validate } from '../../src/validator/validator.js';
import { record, messageFor } from './records.js';

/**
 * Every required string whose cap a TERM carries, with a record type that
 * demands it.
 *
 * The list shrank when the rule moved. `requiredString` was one hardcoded
 * switch case per field that answered both questions at once — is it there, and
 * is there one of it — and the two are now answered by different layers:
 * `sh:maxCount` by the term, because a cap is true of a predicate wherever it
 * appears, and `sh:minCount` by the record type, because it sits inside one node
 * shape. A field with no term therefore has no arity check at all.
 *
 * It briefly shrank further than this. `resultUnit` and `unit` dropped out when
 * the rule moved and no term claimed them — a published `sh:maxCount` that
 * nothing read — and both are back because the terms got written. Only
 * `givenName` and `familyName` are gone for good; see the module comment.
 */
const CAPPED_BY_A_TERM: ReadonlyArray<readonly [string, string, Record<string, unknown>]> = [
  ['MedicationRecord', 'medicationName', { isActive: true }],
  ['ConditionRecord', 'conditionName', { status: 'active' }],
  ['AllergyRecord', 'allergen', {}],
  ['LabResultRecord', 'testName', { resultValue: '412', resultUnit: 'ng/mL' }],
  ['LabResultRecord', 'resultUnit', { testName: 'Ferritin', resultValue: '412' }],
  ['VitalSign', 'unit', { vitalType: 'heartRate', value: 72 }],
  ['ImmunizationRecord', 'vaccineName', {}],
  ['CoverageRecord', 'providerName', {}],
];

/**
 * The subset of {@link CAPPED_BY_A_TERM} that is ALSO required, for the guard
 * that the two-values message never displaces the absent one.
 *
 * A SEPARATE LIST BECAUSE A CAP IS NOT A REQUIREMENT, which is the distinction
 * the whole term/validator split turns on. `sh:maxCount` is a fact about a
 * predicate — at most one, wherever it appears — and `sh:minCount` sits inside
 * one node shape, so it is a fact about a record type. `resultUnit` and `unit`
 * are the proof that the two come apart: both are capped at 1 by their shapes
 * and neither is given an `sh:minCount` by any of them, so an absent one
 * conforms and a doubled one does not.
 *
 * The six here were the whole of the original list, which is why one array
 * served both tests for as long as it did — every field it named happened to be
 * capped AND required. That was a coincidence of which fields had been migrated,
 * not a property of the rule, and asserting `/required/` for `unit` demanded a
 * rule no shape states.
 */
const ALSO_REQUIRED: ReadonlyArray<readonly [string, string, Record<string, unknown>]> =
  CAPPED_BY_A_TERM.filter(([, field]) => field !== 'resultUnit' && field !== 'unit');

describe('a required string carrying two values', () => {
  it.each(CAPPED_BY_A_TERM)('%s.%s is reported as two values, not as absent', (type, field, rest) => {
    const result = validate(record(type, { ...rest, [field]: ['first', 'second'] }));
    const message = messageFor(result, field);

    expect(result.valid).toBe(false);
    // THE WORDING MOVED WITH THE RULE. `requiredString` said "it must be a
    // single non-empty string", describing the TypeScript the caller should
    // have written; the term says what the vocabulary permits, which is the
    // thing that is actually true and the thing a caller can go read. Both
    // name the right defect, which is all this file has ever asserted.
    expect(message).toBe(`${field} carries 2 values; the vocabulary permits at most 1`);
    expect(message).not.toMatch(/required/);
  });

  it.each(ALSO_REQUIRED)('%s.%s still says what is missing when it IS missing', (type, field, rest) => {
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
