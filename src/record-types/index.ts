/**
 * Everything this SDK knows about a record type, behind three functions.
 *
 * The front door. Import from here, never from `./table.js` or `./overrides.js`
 * — a caller reaching those gets the raw rows without the invariants below
 * having been checked, which is the arrangement this module replaces.
 *
 * WHAT THIS FIXES. One RDF class must read back as exactly one JSON `type`, and
 * that choice used to be made by object key order: `buildReverseTypeMap` took
 * "the first entry in `TYPE_TO_MAPPING_KEY` that maps to each mapping key", so
 * `clinical:Procedure` read back as `ProcedureRecord` — a spelling
 * `src/models/procedure.ts` does not declare, that nothing exports, and that no
 * fixture uses. Here the canonical name is DECLARED, and a group of names with
 * no declared canonical throws at load rather than picking one silently.
 *
 * @module record-types
 */

export * from './types.js';
export * from './derive.js';
export { RDF_TYPE_OVERRIDES, CANONICAL_NAMES } from './overrides.js';

import { DEPRECATED_TYPE_ALIASES, NAMESPACES } from '../vocabularies/namespaces.js';
import { CANONICAL_NAMES } from './overrides.js';
import { RECORD_CLASSES } from './table.js';
import type { RecordType } from './types.js';

/**
 * `prefix:LocalName` → full IRI, expanded once so nothing splits a CURIE again.
 *
 * Throws on an unknown prefix rather than passing the CURIE through. A record
 * type whose class IRI is the string `'clinical:Medication'` matches no
 * `rdf:type` in any pod and no `sh:targetClass` in any shape, so it would read
 * as "this record type is simply never present" — a silent absence, which is
 * the failure mode this module exists to remove.
 */
function expandClass(curie: string, name: string): string {
  const colon = curie.indexOf(':');
  const prefix = colon < 0 ? '' : curie.slice(0, colon);
  const namespace = (NAMESPACES as Record<string, string>)[prefix];

  if (!namespace) {
    throw new Error(
      `Record type "${name}" is declared as "${curie}", whose prefix "${prefix}" is not in `
      + 'NAMESPACES. Add the prefix, or correct the CURIE — an unexpanded CURIE matches no '
      + 'rdf:type in any pod and no sh:targetClass in any shape.',
    );
  }

  return `${namespace}${curie.slice(colon + 1)}`;
}

/**
 * The record types, assembled and checked, once.
 *
 * CHECKED AT LOAD, not where a caller happens to look. An invariant enforced
 * here holds for every consumer and every test and cannot be skipped by
 * forgetting to assert it — the same argument `src/terms/index.ts` makes for
 * building its map with an explicit loop.
 */
const RECORD_TYPES: readonly RecordType[] = (() => {
  const namesByClass = new Map<string, string[]>();

  for (const [name, curie] of Object.entries(RECORD_CLASSES)) {
    const names = namesByClass.get(curie) ?? [];
    names.push(name);
    namesByClass.set(curie, names);
  }

  // Deprecated class IRI -> the class that superseded it, inverted: every
  // spelling a subject may carry and still be read back as this type. Kept in
  // `src/vocabularies/` rather than derived because only four of the five are
  // derivable — `clinical:CoverageRecord`'s `rdfs:seeAlso` points at
  // `fhir:Coverage`, so its supersession is stated in prose alone.
  const deprecatedFor = new Map<string, string[]>();
  for (const [deprecated, supersededBy] of Object.entries(DEPRECATED_TYPE_ALIASES)) {
    deprecatedFor.set(supersededBy, [...(deprecatedFor.get(supersededBy) ?? []), deprecated]);
  }

  return Object.freeze(
    [...namesByClass].map(([curie, names]) => {
      // The canonical name is DECLARED or there is no record type. Falling back
      // to `names[0]` here would reinstate the exact defect — an answer decided
      // by the order two rows happen to appear in.
      const declared = names.filter((name) => !(name in CANONICAL_NAMES));

      if (declared.length !== 1) {
        throw new Error(
          `${names.length} record-type names resolve to ${curie} — ${names.join(', ')} — and `
          + `${declared.length} of them is canonical. Exactly one must be: add the others to `
          + 'CANONICAL_NAMES pointing at the spelling a read should RETURN, which is the literal '
          + 'the model in src/models/ already declares.',
        );
      }

      const name = declared[0] as string;
      const rdfTypeUri = expandClass(curie, name);

      return Object.freeze({
        name,
        aliases: Object.freeze(names.filter((other) => other !== name).sort()),
        rdfType: curie,
        rdfTypeUri,
        acceptedClassUris: Object.freeze([rdfTypeUri, ...(deprecatedFor.get(rdfTypeUri) ?? [])]),
      }) as RecordType;
    }),
  );
})();

const BY_NAME: ReadonlyMap<string, RecordType> = (() => {
  const byName = new Map<string, RecordType>();

  for (const recordType of RECORD_TYPES) {
    for (const name of [recordType.name, ...recordType.aliases]) {
      const clash = byName.get(name);

      // Unreachable through `RECORD_CLASSES`, whose keys are unique by
      // construction, and asserted anyway: the map is built from two sources and
      // a name reaching two record types would make `recordTypeFor` answer by
      // iteration order, which is what this module exists not to do.
      if (clash) {
        throw new Error(
          `"${name}" names two record types, ${clash.rdfType} and ${recordType.rdfType}.`,
        );
      }

      byName.set(name, recordType);
    }
  }

  return byName;
})();

/**
 * Class IRI → the record type it reads back as, deprecated spellings included.
 *
 * Built with an explicit loop for the reason `src/terms/index.ts` gives: a
 * `new Map(...)` over pairs keeps the last of two claimants and reports nothing,
 * so which one won would depend on order and the loser would be unreachable.
 */
const BY_CLASS: ReadonlyMap<string, RecordType> = (() => {
  const byClass = new Map<string, RecordType>();

  for (const recordType of RECORD_TYPES) {
    for (const classUri of recordType.acceptedClassUris) {
      const clash = byClass.get(classUri);

      if (clash) {
        throw new Error(
          `${classUri} would read back as both "${clash.name}" and "${recordType.name}". A class `
          + 'reads back as exactly one type; if one of these is a deprecated spelling, it belongs '
          + 'in DEPRECATED_TYPE_ALIASES rather than in RECORD_CLASSES.',
        );
      }

      byClass.set(classUri, recordType);
    }
  }

  return byClass;
})();

/**
 * The record type a JSON `type` names, under any accepted spelling.
 *
 * `undefined` for a name this SDK does not register — a question, not a
 * failure, and every caller already has a "not a record type" branch.
 */
export function recordTypeFor(name: string): RecordType | undefined {
  return BY_NAME.get(name);
}

/**
 * The record type a class IRI reads back as, deprecated spellings included.
 *
 * This is the direction the old code got wrong, and the reason it is a lookup
 * rather than a scan: `recordTypeForClass(clinical:Procedure).name` is
 * `'Procedure'` because `CANONICAL_NAMES` says so, not because of where a row
 * sits in a file.
 */
export function recordTypeForClass(classUri: string): RecordType | undefined {
  return BY_CLASS.get(classUri);
}

/** Every registered record type. */
export function allRecordTypes(): readonly RecordType[] {
  return RECORD_TYPES;
}
