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

  it('is pointed at every field-keyed table the serializer has', () => {
    // The check above is only as wide as the aggregate it is handed, and the
    // aggregate is maintained by hand: a table declared in the serializer and
    // left out of `SERIALIZER_FIELD_TABLES` is not reported as uncovered, it
    // is simply never walked. That is the failure mode the aggregate's own doc
    // comment names — "a table added above and left out here is unchecked,
    // which is the one way this can be wrong without anything saying so" — and
    // nothing was asserting it.
    //
    // `DATE_ONLY_FIELDS` is what made it concrete: coverage v1.6 added it,
    // keyed by field name like every table listed here, and it was not listed.
    // A typo in it (`effectivStart`) matches no field, the key falls through
    // to the `isDateTimeField` heuristic and is written `^^xsd:dateTime`
    // against a shape that declares `xsd:date`, and this file stays green.
    //
    // Named tables rather than a count: a count says the number changed and
    // not which table is missing, and it goes stale on every addition whether
    // or not anything is wrong.
    expect(Object.keys(SERIALIZER_FIELD_TABLES)).toEqual(
      expect.arrayContaining([
        'URI_FIELDS',
        'MULTI_VALUE_FIELDS',
        'ARRAY_FIELDS',
        'IRI_ARRAY_FIELDS',
        'IRI_LIST_FIELDS',
        'PREFIXED_ENUM_FIELDS',
        'EXPLICIT_DATETIME_FIELDS',
        'DATE_ONLY_FIELDS',
        'INTEGER_FIELDS',
        'BLANK_NODE_TYPES',
        'BLANK_NODE_PREDICATE_PREFIXES',
        'BLANK_NODE_ARRAY_FIELDS',
        'TYPE_PREDICATE_OVERRIDES',
      ]),
    );

    // And the fields, not just the key: an empty array under the right name
    // satisfies the assertion above and walks nothing.
    expect(SERIALIZER_FIELD_TABLES['DATE_ONLY_FIELDS']).toEqual(
      expect.arrayContaining(['dateOfBirth', 'effectiveStart', 'effectiveEnd']),
    );
  });
});
