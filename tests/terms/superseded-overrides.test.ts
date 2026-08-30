/**
 * A termed field has no entry left in the serializer's override table.
 *
 * THE RULE is already written at `src/serializer/turtle-serializer.ts`, beside
 * the `interpretationSourceCode` entry that was deleted when its term landed:
 * "an entry left here would be a second copy of one fact, unread, and free to
 * drift from the one that is read."
 *
 * UNREAD is the operative word. `emitField` and `collectPrefixes` both fork on
 * `termFor` before they reach `getPredicateForField`, so the moment a key is
 * termed its row in `TYPE_PREDICATE_OVERRIDES` stops being consulted. Nothing
 * fails, nothing warns, and the two copies agree — until one of them is
 * corrected and the other is not, and then the wrong one is the one that LOOKS
 * like the answer, because it is the one written in the serializer.
 *
 * A convention is only a convention while something checks it. Every term
 * added from here on takes its override row with it, or this goes red.
 */

import { describe, it, expect } from 'vitest';

import { SERIALIZER_FIELD_TABLES } from '../../src/serializer/turtle-serializer.js';
import { termFor } from '../../src/terms/index.js';

describe('TYPE_PREDICATE_OVERRIDES', () => {
  it('names no field a term already owns', () => {
    const superseded = SERIALIZER_FIELD_TABLES['TYPE_PREDICATE_OVERRIDES']!.filter((field) =>
      termFor(field),
    );

    expect(superseded).toEqual([]);
  });

  it('is exposed to the check at all', () => {
    // The list this asserts on is derived, so an empty one would satisfy the
    // test above for the wrong reason — a table that was never wired in reads
    // exactly like a table with nothing wrong in it.
    expect(SERIALIZER_FIELD_TABLES['TYPE_PREDICATE_OVERRIDES']).toContain('notes');
  });
});
