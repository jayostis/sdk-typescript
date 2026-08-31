/**
 * `profile-004` — a patient profile with no `cascade:dateOfBirth`.
 *
 * The first fixture on `followsTheFixtureContract`. The contract asks the seven
 * questions every fixture should answer — written in both formats, read back
 * from both, and judged by both validators — and what is left in this file is
 * only what is true of THIS fixture: which rule it breaks, and on which
 * predicate.
 *
 * WHY THIS FIXTURE FIRST. Measured across all ninety, `profile-004` is one of
 * three that answer all seven questions with no other change (`profile-005` and
 * `vital-006` are the others), and one of two already covered by a conformance
 * file. A contract whose first subject needed the JSON-LD writer repaired before
 * it could go green would have had to defer a question behind a skip, and a
 * question deferred on day one is a question nobody ever turns on.
 *
 * @see tests/support/fixture-contract.ts       the seven questions, and what is deliberately not among them
 * @see spec/ontologies/core/v1/core.shapes.ttl cascade:PatientProfileShape
 */

import { describe, it, expect } from 'vitest';

import { validate } from '../../../src/validator/index.js';
import { loadFixture } from '../../support/fixtures.js';
import { followsTheFixtureContract } from '../../support/fixture-contract.js';
import { cascade } from '../../support/graph.js';
import { sh, shaclCheck } from '../../support/shacl.js';
import type { CascadeRecord } from '../../../src/models/common.js';

/**
 * `loadFixture` rather than `loadCascadeRecordFixture`: the record loader checks
 * for `dataProvenance` and `schemaVersion`, which is a different claim from the
 * one this fixture makes and not one it should have to satisfy to be read.
 */
const profile004 = loadFixture('profile-004');

describe('profile-004 — Negative: Patient profile missing required dateOfBirth field', () => {
  followsTheFixtureContract(profile004, {
    shouldAccept: false,

    // A SHACL result names an `sh:path` IRI and `validate()` names a JSON key,
    // so question 7 cannot compare them without being told which is which.
    // Written out by hand rather than read from `REVERSE_PREDICATE_MAP`:
    // deriving it from the code under test would make the two validators agree
    // by construction, which is the one thing that question exists to disprove.
    fields: [[cascade.dateOfBirth, 'dateOfBirth']],
  });

  it('earns the verdict the fixture declares, from the minCount rule', async () => {
    // What the contract does NOT say. Question 6 asks only whether the shipped
    // verdict matches `shouldAccept`, and question 7 only whether every
    // violation reached `validate()`; neither names the RULE or the PREDICATE,
    // and a record rejected for the wrong reason satisfies both. That is this
    // fixture's own claim, so it stays here.
    //
    // `sourceConstraintComponent` rather than `message`: the message is prose
    // spec is free to reword, the component is the rule.
    const report = await shaclCheck(profile004.input as CascadeRecord);

    expect(report.conforms).toBe(profile004.shouldAccept);
    expect(report.results).toHaveLength(1);
    expect(report.results[0]?.sourceConstraintComponent.value)
      .toBe(sh.MinCountConstraintComponent?.value);
    expect(report.results[0]?.path.value).toBe(cascade.dateOfBirth?.value);
  });

  it('reports exactly three errors through the SHIPPED validator', () => {
    // Kept even though question 7 covers the same ground, because it names the
    // FIELD. Question 7 reports that no violation went unaccounted for; it
    // cannot say which field mattered, and a mapping row pointing at the wrong
    // field would satisfy it as long as `validate()` happened to report that
    // one too.
    //
    // WHOLE ENTRIES, NOT FIELD NAMES, and not `toContain`. Containment passes
    // while ignoring everything else the validator said — a `validate()`
    // reporting forty fields would look identical to one reporting the right
    // one — and a list of field names still says nothing about what a caller
    // actually receives. The message is a shipped output: one that named the
    // wrong field, or lost the record type, is a real defect that no assertion
    // on `field` can see.
    //
    // ASSERTING ON `message` IS RIGHT HERE AND WRONG IN `shaclCheck`. That
    // helper warns against it because a SHACL message is prose `spec` owns, so
    // a reword breaks a test with no behaviour change in this repo. These
    // messages come from `src/validator/validator.ts` — rewording one is a
    // same-repo edit, and this test moving with it is the point rather than
    // friction.
    //
    // `severity` is not decoration either. It is read off the term's
    // `sh:severity` (`validator.ts:461`), so a rule regraded to a warning would
    // move its finding to `result.warnings` and leave this array shorter.
    //
    // All three entries, so #35 is in plain sight instead of described in a
    // comment: `givenName` and `familyName` are required by `validate()`,
    // mentioned by no shape, and put on a different document entirely by
    // `core.ttl:262`. Fixing that turns this red and removes an entry, which is
    // exactly when someone should be looking at it.
    //
    // Sorted, because the raw order is the sequence `validateTypeSpecific`
    // happens to run its checks in. Pinning it would make a harmless reorder a
    // failure, and this test does not mean to claim anything about order.
    //
    // DELIBERATELY NOT asserted on `result.valid`. That is `false` here for
    // reasons that include but are not limited to this fixture's own, so it
    // would pass while the validator looked at neither the missing dateOfBirth
    // nor anything else. Question 6 already owns the boolean.
    const errors = [...validate(profile004.input).errors]
      .sort((a, b) => a.field.localeCompare(b.field));

    expect(errors).toEqual([
      {
        field: 'dateOfBirth',
        message: 'dateOfBirth is required for PatientProfile',
        severity: 'error',
      },
      {
        field: 'familyName',
        message: 'familyName is required for PatientProfile',
        severity: 'error',
      },
      {
        field: 'givenName',
        message: 'givenName is required for PatientProfile',
        severity: 'error',
      },
    ]);
  });
});
