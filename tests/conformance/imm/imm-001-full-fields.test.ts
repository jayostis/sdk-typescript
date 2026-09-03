/**
 * `imm-001` — an immunization record carrying every field the shape constrains.
 *
 * @see spec/ontologies/health/v1/health.shapes.ttl  health:ImmunizationRecordShape
 */

import { describe, it, expect } from 'vitest';

import { loadCascadeRecordFixture } from '../../support/fixtures.js';
import { followsTheFixtureContract } from '../../support/fixture-contract.js';
import { shaclReport } from '../../support/shacl.js';
import type { CascadeRecord } from '../../../src/models/common.js';

const imm001 = loadCascadeRecordFixture('imm-001');

describe('imm-001 — Happy path: COVID-19 vaccine (Pfizer-BioNTech) with all standard immunization fields', () => {
  followsTheFixtureContract(imm001, {
    shouldAccept: true,
    // health:notes is declared in health.ttl and named by no sh:path.
    unconstrained: ['health:notes'],
  });

  it('conforms to the shapes with nothing to report', async () => {
    const report = await shaclReport(imm001.input as CascadeRecord);

    expect(report.conforms).toBe(true);
    expect(report.results).toEqual([]);
  });
});
