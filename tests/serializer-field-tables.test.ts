/**
 * Every field name a serializer table mentions resolves to a predicate.
 *
 * The tables say HOW a field is written. `PROPERTY_PREDICATES` says WHETHER:
 * `getPredicateForField` returns undefined for an unregistered key and
 * `emitField` returns without writing anything, so a field listed in a table
 * but missing from the predicate table is silently dropped from every document
 * this SDK produces — no error, no warning, no partial output.
 *
 * What this covers, and what it does not, is worth being precise about. A field
 * owned by a term module gets the same guarantee STRUCTURALLY, from
 * `defineTerm`'s `requirePredicate(key)` call, which throws at import and cannot
 * be forgotten. This check is for what is LEFT in the old tables — the ~49 field
 * names still spread across `URI_FIELDS`, `INTEGER_FIELDS`, `MULTI_VALUE_FIELDS`
 * and the rest, which nothing validates. It is not a duplicate of the guard in
 * `src/`; it is the cover for the fields that guard does not yet reach, and it
 * has nothing left to say once those tables are empty.
 *
 * The detector is pointed at a table where it must name something before it is
 * pointed at ours. A check that has only ever been observed staying silent has
 * not been observed at all.
 */

import { describe, it, expect } from 'vitest';

import { SERIALIZER_FIELD_TABLES } from '../src/serializer/turtle-serializer.js';
import { unregisteredFields } from './serializer-field-tables.js';

describe('unregisteredFields', () => {
  it('names the table and the field, so a hit says where to go', () => {
    expect(
      unregisteredFields({
        URI_FIELDS: ['snomedCode', 'notAField'],
        INTEGER_FIELDS: ['computedAge'],
      }),
    ).toEqual(['URI_FIELDS.notAField']);
  });

  it('reports every hit rather than stopping at the first', () => {
    // A table gains several unregistered fields at once far more often than
    // one: a vocabulary sync adds a class and its properties together. Stopping
    // at the first would turn one fix into a queue of reruns.
    expect(
      unregisteredFields({
        BLANK_NODE_TYPES: ['alsoNotAField', 'notAField'],
      }),
    ).toEqual(['BLANK_NODE_TYPES.alsoNotAField', 'BLANK_NODE_TYPES.notAField']);
  });

  it('stays silent for a table whose every field is registered', () => {
    expect(unregisteredFields({ INTEGER_FIELDS: ['computedAge', 'byteSize'] })).toEqual([]);
  });

  it('finds nothing unregistered in the tables the serializer actually ships', () => {
    expect(unregisteredFields(SERIALIZER_FIELD_TABLES)).toEqual([]);
  });
});
