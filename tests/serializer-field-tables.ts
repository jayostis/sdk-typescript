/**
 * The check `serializer-field-tables.test.ts` runs, as a function that can be
 * pointed somewhere other than at ourselves.
 *
 * A helper, not a test: vitest does not collect this file. It exists so the
 * detector can be handed a table where it MUST name something, which is the
 * only way to know it would speak up about ours.
 */

import { PROPERTY_PREDICATES } from '../src/vocabularies/namespaces.js';

/**
 * Every `table.field` named in `tables` that `PROPERTY_PREDICATES` does not
 * define a predicate for, sorted.
 *
 * A serializer table decides HOW a field is written — as a URI, as an integer,
 * as a blank node. It never decides WHETHER: that is `getPredicateForField`,
 * which returns undefined for an unregistered key, and `emitField` then returns
 * without writing anything. No error, no warning, no partial output. A field
 * can therefore be listed in a table, declared on a model, and expected by a
 * fixture, and still be missing from every document this SDK writes.
 *
 * `hasOwnProperty` rather than `in` or a truthiness check: `PROPERTY_PREDICATES`
 * is a plain object literal indexed by data, so `'constructor'` and `'toString'`
 * would otherwise resolve `Object.prototype`'s members and report a registered
 * predicate that is a function.
 */
export function unregisteredFields(tables: Readonly<Record<string, readonly string[]>>): string[] {
  return Object.entries(tables)
    .flatMap(([table, fields]) =>
      fields
        .filter((field) => !Object.prototype.hasOwnProperty.call(PROPERTY_PREDICATES, field))
        .map((field) => `${table}.${field}`),
    )
    .sort();
}
