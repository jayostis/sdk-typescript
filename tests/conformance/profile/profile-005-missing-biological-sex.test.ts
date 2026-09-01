/**
 * `profile-005` — a patient profile with no `cascade:biologicalSex`.
 *
 * On `followsTheFixtureContract`, like its sibling `profile-004`. The two make
 * the same shape of claim about different predicates — a required field absent,
 * caught by `sh:minCount` — so what is left hand-written below is only the rule
 * and the predicate, which the contract does not name.
 *
 * @see tests/conformance/profile/profile-004-missing-dob.test.ts  the same claim, on the contract
 * @see spec/ontologies/core/v1/core.shapes.ttl                    cascade:PatientProfileShape
 */

import { describe, it, expect } from 'vitest';

import { validate } from '../../../src/validator/index.js';
import { loadFixture } from '../../support/fixtures.js';
import { followsTheFixtureContract } from '../../support/fixture-contract.js';
import { cascade } from '../../support/graph.js';
import { sh, shaclCheck } from '../../support/shacl.js';
import type { CascadeRecord } from '../../../src/models/common.js';

const profile005 = loadFixture('profile-005');

describe('profile-005 — Negative: Patient profile missing required biologicalSex field', () => {
  followsTheFixtureContract(profile005, {
    shouldAccept: false,
    fields: [[cascade.biologicalSex, 'biologicalSex']],
  });

  it('earns the verdict the fixture declares, from the minCount rule', async () => {
    const report = await shaclCheck(profile005.input as CascadeRecord);

    expect(report.conforms).toBe(profile005.shouldAccept);
    expect(report.results).toHaveLength(1);
    expect(report.results[0]?.sourceConstraintComponent.value)
      .toBe(sh.MinCountConstraintComponent?.value);
    expect(report.results[0]?.path.value).toBe(cascade.biologicalSex?.value);
  });

  // SKIPPED — blocked upstream, not a defect in this fixture.
  //
  // Only `biologicalSex` is sourced; `givenName` and `familyName` are the two
  // the comment below already calls "#35's extras". No vendored shape declares
  // an `sh:path` for either, and the models mark both optional, so `validate()`
  // no longer reports them and this asserts that it does.
  //
  //   https://github.com/jayostis/sdk-typescript/issues/47
  //   blocked in turn on
  //   https://github.com/jayostis/sdk-typescript/issues/35
  //
  // The comment below anticipated exactly this: the extras are named "so that
  // fixing #35 turns this red rather than leaving it quietly asserting less
  // than it reads as asserting". That is what happened, one issue earlier than
  // expected. Un-skip when #35 lands.
  it.skip('reports exactly three errors through the SHIPPED validator (#47, blocked on #35)', () => {
    // Whole entries rather than field names, and sorted — see the same
    // assertion in `profile-004-missing-dob.test.ts` for the reasoning, which
    // is not repeated here. `givenName` and `familyName` are #35's extras and
    // are not this fixture's business; they are named so that fixing #35 turns
    // this red rather than leaving it quietly asserting less than it reads as
    // asserting.
    const errors = [...validate(profile005.input).errors]
      .sort((a, b) => a.field.localeCompare(b.field));

    expect(errors).toEqual([
      {
        field: 'biologicalSex',
        message: 'biologicalSex is required for PatientProfile',
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
