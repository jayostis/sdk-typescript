/**
 * `objectTerm`'s `SPEC_TERMS.unclassifiableRanges` lookups must survive a
 * `terms.generated.ts` built by a pre-#91 version of `scripts/build-terms.mjs`
 * — one whose embedded JSON payload has no `unclassifiableRanges` key at all,
 * despite `SpecTerms` declaring the field non-optional.
 *
 * Reported on PR #93: a bare `SPEC_TERMS.unclassifiableRanges[definition.range]`
 * at `src/converter/to-rdf.ts:268` throws `TypeError: Cannot read properties
 * of undefined` for EVERY `@id`-typed term once the map itself is missing —
 * not only the unclassifiable ones. `creatorWebID` (`rdfs:range
 * rdfs:Resource`, an open-by-design reference with no value set at all) is
 * exactly such a field: nothing about it is unclassifiable, and it must not
 * throw a TypeError just because a stale generated file lacks the map that
 * would have said so.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/spec/derived/terms.generated.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/spec/derived/terms.generated.js')>();
  const stale = { ...actual.SPEC_TERMS } as Record<string, unknown>;

  // Simulate the pre-#91 generated payload: the key is simply absent, not `{}`.
  delete stale['unclassifiableRanges'];

  return { ...actual, SPEC_TERMS: stale };
});

describe('a stale terms.generated.ts with no unclassifiableRanges map', () => {
  const immunization = {
    id: 'urn:uuid:test',
    type: 'ImmunizationRecord',
    schemaVersion: '1.3',
  };

  it('still writes an open-reference field, rather than throwing a TypeError', async () => {
    const { convertToRdf } = await import('../../src/converter/to-rdf.js');

    // Before the fix: "Cannot read properties of undefined (reading
    // 'http://www.w3.org/2000/01/rdf-schema#Resource')" — a crash with no
    // connection to the value or field a caller supplied.
    expect(() => convertToRdf({ ...immunization, creatorWebID: 'https://example.org/people/1' }))
      .not.toThrow(TypeError);

    expect(convertToRdf({ ...immunization, creatorWebID: 'https://example.org/people/1' }))
      .toContain('<https://example.org/people/1>');
  });

  it('still names the field, not "undefined", when a genuinely unclassifiable range is hit', async () => {
    const { convertToRdf } = await import('../../src/converter/to-rdf.js');

    // `health:hrvHistory` has no members and no fields (#91) — with the map
    // gone it degenerates to the generic "term declares no @type/no range"
    // message instead of the specFix one, but it must be THAT throw, never a
    // TypeError blind to which field failed.
    expect(() => convertToRdf({ ...immunization, hrvHistory: { id: 'urn:uuid:reading' } }))
      .toThrow(/Cannot express "hrvHistory"/);
  });
});
