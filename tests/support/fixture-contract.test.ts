/**
 * `unreportedViolations` — the SHACL violations the shipped validator misses.
 *
 * Question 7 of the contract is the one with a translation in the middle of it:
 * a SHACL result names an `sh:path` IRI, `validate()` names a JSON field, and
 * the mapping between them is supplied by hand at the call site. That makes the
 * comparison itself worth testing on its own, away from a report and a record —
 * every way it could report a false clean is a way for question 7 to pass
 * without having looked.
 *
 * `followsTheFixtureContract` is not exercised here. It registers `it`s in its
 * caller's describe and cannot be run as a value; what it is worth is that its
 * comparisons speak, and those live here and in `graph.test.ts`.
 */

import { describe, it, expect } from 'vitest';

import { cascade, health } from './graph.js';
import { unreportedViolations, reportedFields } from './fixture-contract.js';
import { validate } from '../../src/validator/index.js';
import type { CascadeEntity } from '../../src/models/common.js';

const dateOfBirth = cascade.dateOfBirth.value;
const testName = health.testName.value;

describe('unreportedViolations', () => {
  it('is silent when the validator named every violated field', () => {
    expect(
      unreportedViolations([dateOfBirth], ['dateOfBirth'], [[cascade.dateOfBirth, 'dateOfBirth']]),
    ).toEqual([]);
  });

  it('is silent when the validator named MORE than the shapes did', () => {
    // Subset, not equality — the extras are #35 and are not question 7's
    // business. Asserting equality here would make the contract red on a
    // divergence it is not about.
    expect(
      unreportedViolations(
        [dateOfBirth],
        ['dateOfBirth', 'givenName', 'familyName'],
        [[cascade.dateOfBirth, 'dateOfBirth']],
      ),
    ).toEqual([]);
  });

  it('names a violation the shipped validator did not report', () => {
    expect(
      unreportedViolations([dateOfBirth], ['givenName'], [[cascade.dateOfBirth, 'dateOfBirth']]),
    ).toEqual([`${dateOfBirth} -> dateOfBirth`]);
  });

  it('names an unmapped path rather than letting it pass', () => {
    // THE ASSERTION THAT KEEPS THIS A CONTRACT. If a path with no mapping row
    // were skipped, omitting the row would be an opt-out from question 7 —
    // available to every fixture, and most attractive to the one with the most
    // to hide. The report says which path needs a row.
    expect(unreportedViolations([dateOfBirth], [], [])).toEqual([`${dateOfBirth} (unmapped)`]);
  });

  it('names a violation carrying no sh:path', () => {
    // A node-level constraint — `sh:closed`, `sh:node` — reports no path.
    // There is nothing to translate it to, and it must not vanish for that.
    expect(unreportedViolations([null], ['dateOfBirth'], [])).toEqual([
      'a violation with no sh:path',
    ]);
  });

  it('reports every miss rather than stopping at the first', () => {
    // Several at once is the normal case, not the exotic one: a record missing
    // two required fields violates two shapes. Stopping at the first would
    // turn one fix into a queue of reruns.
    expect(
      unreportedViolations(
        [dateOfBirth, testName],
        [],
        [[cascade.dateOfBirth, 'dateOfBirth'], [health.testName, 'testName']],
      ),
    ).toEqual([`${dateOfBirth} -> dateOfBirth`, `${testName} -> testName`]);
  });

  it('does not match a field by accident of another predicate sharing its name', () => {
    // The mapping is keyed on the full predicate IRI, not on a local name.
    // `health:testName` and a hypothetical `clinical:testName` are different
    // properties that would otherwise collide onto one field.
    expect(unreportedViolations([testName], ['testName'], [[cascade.testName, 'testName']])).toEqual(
      [`${testName} (unmapped)`],
    );
  });
});

describe('reportedFields', () => {
  // THE OTHER HALF OF QUESTION 7'S TRANSLATION, and the half that was missing.
  //
  // `unreportedViolations` compares two lists; the tests above prove it
  // compares them correctly. This proves the SECOND list is the right list.
  // Question 7 used to build it from `validate(...).errors` alone, while its
  // first list came from all of `report.results` — every SHACL severity. A
  // rule the vocabulary grades `sh:Warning` was therefore caught by the
  // shipped validator, reported by the shipped validator, and still counted
  // as one the shipped validator missed.

  it('names a field the validator graded `warning`', () => {
    // `clinical:VitalSignShape` binds the 74-code interpretation list at
    // `sh:Warning`, and this SDK models that grade rather than flattening it:
    // `interpretation` declares `severityByType: { VitalSign: 'warning' }`
    // (`src/terms/definitions/interpretation.ts`). An off-list code is a
    // reported finding and a valid record, both.
    const verdict = validate({
      id: 'urn:uuid:vital-off-list',
      type: 'VitalSign',
      dataProvenance: 'PatientReported',
      schemaVersion: '1.3',
      vitalType: 'HeartRate',
      value: 72,
      interpretation: 'NOT-A-VOCABULARY-CODE',
    } as unknown as CascadeEntity);

    // The premise, asserted rather than assumed: this really is a finding the
    // validator made, and really is not in `errors`. If the grade ever moved,
    // this test would be proving nothing and should say so out loud.
    expect(verdict.warnings.map((finding) => finding.field)).toContain('interpretation');
    expect(verdict.errors.map((finding) => finding.field)).not.toContain('interpretation');

    expect(reportedFields(verdict)).toContain('interpretation');
  });

  it('names a field the validator graded `info`', () => {
    // `cascade:PatientProfileShape` caps `address` at one and grades the cap
    // `sh:Info` (core.shapes.ttl:136) — a suggestion, so two addresses are
    // reported and the profile stays valid. `info` is its own bucket in
    // `ValidationResult` precisely so it is not reachable only by filtering an
    // array named for something else, which is exactly what reading `errors`
    // alone did to it.
    const verdict = validate({
      id: 'urn:uuid:profile-two-addresses',
      type: 'PatientProfile',
      dataProvenance: 'PatientReported',
      schemaVersion: '1.3',
      address: [{ addressCity: 'Boston' }, { addressCity: 'Cambridge' }],
    } as unknown as CascadeEntity);

    expect(verdict.info.map((finding) => finding.field)).toContain('address');
    expect(verdict.errors.map((finding) => finding.field)).not.toContain('address');

    expect(reportedFields(verdict)).toContain('address');
  });

  it('still names the errors it always named', () => {
    // The widening must not have come at the cost of the bucket question 7
    // already read. A helper that returned only the two new buckets would pass
    // both tests above and break every fixture in the corpus.
    const verdict = validate({
      id: 'urn:uuid:vital-no-type',
      type: 'VitalSign',
      dataProvenance: 'PatientReported',
      schemaVersion: '1.3',
    } as unknown as CascadeEntity);

    expect(verdict.errors.length).toBeGreaterThan(0);
    for (const finding of verdict.errors) {
      expect(reportedFields(verdict)).toContain(finding.field);
    }
  });
});
