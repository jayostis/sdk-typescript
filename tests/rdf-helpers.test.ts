/**
 * Properties of the SHACL helper in `tests/support/rdf.ts` itself, as distinct
 * from any claim about a vocabulary.
 *
 * A helper that reports a wrong verdict is worse than a missing helper: every
 * suite that leans on it inherits the wrong answer while reporting green. The
 * two cases below are the ways `shaclCheck` could do that — answering about the
 * wrong record, and answering at all about a record it holds no shapes for.
 */

import { describe, it, expect } from 'vitest';
import { inputOf, shaclCheck } from './support/rdf.js';

describe('shaclCheck: one verdict per call', () => {
  it('does not cross verdicts between concurrent callers', async () => {
    // A module-level SHACLValidator reused across calls mutates $data after an
    // await, so the second setDataGraph lands before the first validateAll and
    // BOTH verdicts describe the second record. absent-001 conforms and
    // absent-002 does not, so a crossed pair is visible as two equal verdicts.
    const [ratified, unmapped] = await Promise.all([
      shaclCheck(inputOf('absent-001')),
      shaclCheck(inputOf('absent-002')),
    ]);

    expect(ratified.conforms).toBe(true);
    expect(unmapped.conforms).toBe(false);
  });
});

describe('shaclCheck: a vocabulary with no vendored shapes is not a pass', () => {
  it('refuses a clinical: record rather than conforming vacuously', async () => {
    // tests/shapes/ vendors core and health only. Before this guard,
    // clinical:Medication validated against a graph holding no clinical shape
    // and came back { conforms: true, violations: [] } — indistinguishable from
    // a record that genuinely satisfies every clinical constraint.
    await expect(shaclCheck(inputOf('med-001'))).rejects.toThrow(/clinical/);
  });

  it('refuses a coverage: record for the same reason', async () => {
    await expect(shaclCheck(inputOf('claim-001'))).rejects.toThrow(/coverage/);
  });
});
