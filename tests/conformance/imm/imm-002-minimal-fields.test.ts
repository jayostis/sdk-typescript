/**
 * `imm-002` — a second conforming immunization record.
 *
 * @see spec/ontologies/health/v1/health.shapes.ttl  health:ImmunizationRecordShape
 */

import { describe, it, expect } from 'vitest';

import { loadCascadeRecordFixture } from '../../support/fixtures.js';
import { followsTheFixtureContract } from '../../support/fixture-contract.js';
import { shaclReport } from '../../support/shacl.js';
import type { CascadeRecord } from '../../../src/models/common.js';

const imm002 = loadCascadeRecordFixture('imm-002');

describe('imm-002 — Happy path: Influenza vaccine with minimal required fields', () => {
  followsTheFixtureContract(imm002, {
    shouldAccept: true,
    // health:notes is declared in health.ttl and named by no sh:path.
    unconstrained: ['health:notes'],
  });

  it('conforms to the shapes with nothing to report', async () => {
    const report = await shaclReport(imm002.input as CascadeRecord);

    expect(report.conforms).toBe(true);
    expect(report.results).toEqual([]);
  });
});
