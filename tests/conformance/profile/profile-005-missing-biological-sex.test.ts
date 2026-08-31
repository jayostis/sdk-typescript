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

  it('reports exactly three errors through the SHIPPED validator', () => {
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
