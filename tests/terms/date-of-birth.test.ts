/**
 * The `dateOfBirth` term: `cascade:dateOfBirth`, core v2.2.
 *
 * Pure. No serializer, no fixture loader, no RDF library.
 *
 * The claim is the DATATYPE. Terming a field moves it from the serializer's
 * type-driven chain onto the term fork, so a rule that does not reproduce what
 * `emitField` already wrote changes every record carrying the field —
 * `isDateOnlyField` routed this through `sub.date`, and `profile-002` expects
 * `"1973-08-15"^^xsd:date`. A bare `{ form: 'literal' }` would have written an
 * untyped string and moved the fixture.
 *
 * Its `sh:minCount 1` is a constraint rather than a serialization rule and
 * lives in `tests/rules/min-count.test.ts` with the enforcement it drives.
 *
 * @see spec/ontologies/core/v1/core.shapes.ttl  cascade:PatientProfileShape
 * @see tests/rules/min-count.test.ts            required of a profile, and of nothing else
 */

import { describe, it, expect } from 'vitest';

import { termFor } from '../../src/terms/index.js';
import { requirePredicate } from '../../src/terms/term.js';

const PROFILE = { id: 'urn:uuid:profile02-aaaa-bbbb-cccc-ddddeeeeffff', type: 'PatientProfile' };

describe('dateOfBirth', () => {
  it('references the registered predicate rather than declaring one', () => {
    expect(termFor('dateOfBirth')?.predicate).toBe('cascade:dateOfBirth');
    expect(requirePredicate('dateOfBirth')).toBe('cascade:dateOfBirth');
  });

  it('writes a typed literal, matching the shape and what emitField already wrote', () => {
    expect(
      termFor('dateOfBirth')?.outputsFor({ ...PROFILE, dateOfBirth: '1973-08-15' }),
    ).toEqual([
      {
        kind: 'literal',
        predicate: 'cascade:dateOfBirth',
        value: '1973-08-15',
        datatype: 'xsd:date',
      },
    ]);
  });

  it('writes nothing for a profile carrying no date of birth', () => {
    // profile-004 is exactly this record, and it is a NEGATIVE fixture — the
    // writer emits nothing and the validator objects. Absence is not an empty
    // date, and a term that wrote one would put `cascade:dateOfBirth ""` on it.
    expect(termFor('dateOfBirth')?.outputsFor(PROFILE)).toEqual([]);
  });
});
