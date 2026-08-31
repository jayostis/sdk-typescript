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
import { unreportedViolations } from './fixture-contract.js';

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
