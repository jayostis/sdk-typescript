/**
 * The `interpretation` term: `health:interpretation`, re-prefixed to
 * `clinical:interpretation` on a vital sign.
 *
 * Pure. No serializer, no fixture loader, no RDF library.
 *
 * The PREDICATE and its per-type override are what this file asks about. The
 * term's 74-value list and its `sh:maxCount 1` are constraints rather than
 * serialization rules and live with the others in `tests/rules/` — the
 * declaration and the enforcement of one rule belong in one file, so that
 * neither can claim something the other stopped doing.
 *
 * @see spec/ontologies/health/v1/health.ttl  health:interpretation
 * @see tests/rules/value-set.test.ts         its value set, declared and enforced
 * @see tests/rules/max-count.test.ts         its cap, which the value set cannot see
 */

import { describe, it, expect } from 'vitest';

import { termFor } from '../../src/terms/index.js';
import { requirePredicate } from '../../src/terms/term.js';

const LAB = { id: 'urn:uuid:lab010-aaaa-bbbb-cccc-ddddeeeeffff', type: 'LabResultRecord' };
const VITAL = { id: 'urn:uuid:vs001-aaaa-bbbb-cccc-ddddeeeeffff', type: 'VitalSign' };

describe('interpretation', () => {
  it('references the registered predicate rather than declaring one', () => {
    // Hand-written on the right, resolved on the left. Comparing the term
    // against `PROPERTY_PREDICATES` directly would agree with the table by
    // construction and a re-namespaced predicate would pass unnoticed.
    expect(termFor('interpretation')?.predicate).toBe('health:interpretation');
    expect(requirePredicate('interpretation')).toBe('health:interpretation');
  });

  it('writes the clinical: spelling for a vital sign and health: for a lab result', () => {
    // The override is not cosmetic: `clinical:interpretation` and
    // `health:interpretation` are both declared, and which one a record carries
    // is decided by its class. A term that resolved the wrong one would write a
    // perfectly valid triple under a namespace no query for this record's
    // interpretation would look in.
    expect(termFor('interpretation')?.outputsFor({ ...VITAL, interpretation: 'H' })).toEqual([
      { kind: 'literal', predicate: 'clinical:interpretation', value: 'H' },
    ]);
    expect(termFor('interpretation')?.outputsFor({ ...LAB, interpretation: 'H' })).toEqual([
      { kind: 'literal', predicate: 'health:interpretation', value: 'H' },
    ]);
  });

  it('writes a value the vocabulary does not admit, leaving that to the validator', () => {
    // lab-010's value. Faithful first: a writer that refused would leave the
    // validator nothing to object to, and that fixture exists to be written and
    // then rejected.
    expect(
      termFor('interpretation')?.outputsFor({ ...LAB, interpretation: 'quite high' }),
    ).toEqual([{ kind: 'literal', predicate: 'health:interpretation', value: 'quite high' }]);
  });

  it('writes nothing for a record carrying no interpretation', () => {
    expect(termFor('interpretation')?.outputsFor(LAB)).toEqual([]);
  });
});
