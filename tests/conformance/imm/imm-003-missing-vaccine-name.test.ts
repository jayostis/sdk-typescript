/**
 * `imm-003` — an immunization record with no `health:vaccineName`.
 *
 * @see spec/ontologies/health/v1/health.shapes.ttl  health:ImmunizationRecordShape
 */

import { describe, it, expect } from 'vitest';

import { loadCascadeRecordFixture } from '../../support/fixtures.js';
import { followsTheFixtureContract } from '../../support/fixture-contract.js';
import { health } from '../../support/graph.js';
import { sh, shaclReport } from '../../support/shacl.js';
import type { CascadeRecord } from '../../../src/models/common.js';

const imm003 = loadCascadeRecordFixture('imm-003');

describe('imm-003 — Negative: Immunization missing required vaccineName field', () => {
  followsTheFixtureContract(imm003, {
    shouldAccept: false,
    fields: [[health.vaccineName, 'vaccineName']],
  });

  it('is rejected for the missing vaccineName, and for nothing else', async () => {
    const report = await shaclReport(imm003.input as CascadeRecord);

    expect(report.conforms).toBe(false);
    expect(report.results).toHaveLength(1);
    expect(report.results[0]?.sourceConstraintComponent.value)
      .toBe(sh.MinCountConstraintComponent?.value);
    expect(report.results[0]?.path.value).toBe(health.vaccineName?.value);
  });
});
