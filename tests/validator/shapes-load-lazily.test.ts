/**
 * The shapes index is parsed when a routed type is first judged, not on import.
 *
 * `shapes.generated.ts` holds the index as a JSON string, and a top-level
 * `JSON.parse` of it is a side effect every consumer pays at import — about
 * 300K parsed for a caller that only ever serializes. Deferring the parse to
 * the first `validate()` of a routed type costs those callers nothing; a
 * bundler cannot drop the string either way, and that is a later split.
 *
 * OBSERVED THROUGH `JSON.parse` ITSELF, because the import path has no other
 * seam: every string parsed while `src/index.ts` loads is recorded, and none
 * of them may be the shapes index. The second half proves the spy can see it,
 * so the first half cannot pass by looking at nothing.
 */

import { describe, it, expect, vi } from 'vitest';

import { loadCascadeRecordFixture } from '../support/fixtures.js';

/** A string only the shapes index carries: the name of the one routed type's shape. */
const SHAPES_MARKER = 'ImmunizationRecordShape';

describe('the shapes index', () => {
  it('is not parsed by importing the package, and is by validating a routed record', async () => {
    const parsed: string[] = [];
    const original = JSON.parse;
    const spy = vi.spyOn(JSON, 'parse').mockImplementation((text, reviver) => {
      parsed.push(text);
      return original.call(JSON, text, reviver);
    });

    try {
      const { validate } = await import('../../src/index.js');
      const shapesParsed = (): boolean => parsed.some((text) => text.includes(SHAPES_MARKER));

      expect(shapesParsed(), 'the shapes index was parsed on import').toBe(false);

      validate(loadCascadeRecordFixture('imm-001').input);

      expect(shapesParsed(), 'the spy cannot see the parse it exists to observe').toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});
