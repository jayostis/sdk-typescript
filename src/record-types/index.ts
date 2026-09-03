/**
 * Everything this SDK knows about a record type, behind three functions.
 *
 * The front door. Import from here, never from `./generated.js` or
 * `./overrides.js` — a caller reaching those gets rows without the invariants
 * below having been checked.
 *
 * DERIVED, NOT TRANSCRIBED. The classes and their published names come from
 * `src/spec/`, built from the checkout by `scripts/build-spec-data.mjs` and
 * turned into `./generated.ts` by `scripts/build-record-types.mjs`. The
 * population is spec's, stated by `cascade:RecordClass` — a marker the
 * record-bearing classes carry directly. It replaces a reading of
 * `rdfs:subClassOf prov:Entity` that `jayostis/spec#34` (ASK-05) ruled out:
 * the axiom is PROV-O alignment and says nothing about records, and on spec's
 * main 96 of the 110 classes it caught were alignment axioms.
 * `jayostis/spec#50` adds the marker; until that revision is pinned here the
 * build falls back to the old chain and reports on every run that it did.
 *
 * WHAT THIS FIXES. One RDF class must read back as exactly one JSON `type`, and
 * that choice used to be made by object key order: `buildReverseTypeMap` took
 * "the first entry in `TYPE_TO_MAPPING_KEY` that maps to each mapping key", so
 * `clinical:Procedure` read back as `ProcedureRecord` — a spelling
 * `src/models/procedure.ts:23` does not declare and `src/index.ts` does not
 * export. Here the name comes from spec, and where two classes would claim one
 * name the assembly throws rather than picking.
 *
 * @module record-types
 */

export * from './types.js';
export { NAME_OVERRIDES, INPUT_ALIASES, SUPERSEDES_OVERRIDES } from './overrides.js';
export type { DerivedClass } from './generated.js';

import { DERIVED_CLASSES } from './generated.js';
import type { DerivedClass } from './generated.js';
import { INPUT_ALIASES, NAME_OVERRIDES, SUPERSEDES_OVERRIDES } from './overrides.js';
import type { RecordType } from './types.js';

/**
 * Assemble record types from derived classes and the declared overrides.
 *
 * TAKES ITS CLASSES AS AN ARGUMENT, for the reason `deriveRecordTypes` did and
 * `thirdPartyImports(dir)` does: the interesting cases cannot be produced from
 * the real data. Exactly one name collision exists across the 79 derived
 * classes, so a function that read `DERIVED_CLASSES` directly could be tested
 * against one instance of the case it exists to handle — and the next
 * vocabulary to introduce a duplicate name is precisely the event that must not
 * pass silently.
 */
export function assembleRecordTypes(classes: readonly DerivedClass[]): readonly RecordType[] {
  const aliasesFor = new Map<string, string[]>();

  for (const [alias, iri] of Object.entries(INPUT_ALIASES)) {
    aliasesFor.set(iri, [...(aliasesFor.get(iri) ?? []), alias]);
  }

  // Every name a class RETURNS, computed before any alias is, because whether
  // a displaced name may be kept as an alias depends on whether another class
  // returns it.
  const returned = new Set(classes.map((derived) => NAME_OVERRIDES[derived.iri] ?? derived.name));

  const assembled = classes.map((derived) => {
    const override = NAME_OVERRIDES[derived.iri];

    // An override normally ADDS a spelling rather than replacing one: the name
    // spec publishes stays accepted on input, because documents and callers
    // already use it and spec is the authority on what it means.
    //
    // UNLESS ANOTHER CLASS RETURNS IT, which is the collision case and the
    // reason the override exists at all. `clinical:SocialHistoryRecord` is
    // renamed precisely because `health:SocialHistoryRecord` owns that name;
    // keeping it as an alias here would make one string resolve to two classes,
    // and the input direction would answer by iteration order — the defect this
    // module exists to remove, reintroduced one layer down.
    const displaced = override && override !== derived.name && !returned.has(derived.name)
      ? [derived.name]
      : [];

    const aliases = [...displaced, ...(aliasesFor.get(derived.iri) ?? [])].sort();

    const superseded = Object.entries(SUPERSEDES_OVERRIDES)
      .filter(([, supersedingIri]) => supersedingIri === derived.iri)
      .map(([deprecatedIri]) => deprecatedIri);

    // DEDUPLICATED, because the derived table and the override can both name
    // one class and the `BY_CLASS` loop treats a repeat as a conflict.
    // `SUPERSEDES_OVERRIDES` exists precisely because spec has not yet stated
    // `clinical:CoverageRecord rdfs:seeAlso coverage:InsurancePlan`
    // (`jayostis/spec#50` gap 2). When that triple lands,
    // `scripts/build-record-types.mjs` puts the class into `supersedes` and the
    // override still adds it — so the loop below would throw at MODULE
    // EVALUATION, taking the whole package down at import, over a class
    // claimed twice by the same record type. The upstream fix this row waits
    // for must not be the thing that breaks it.
    const accepted = new Set([derived.iri, ...derived.supersedes, ...superseded]);

    return Object.freeze({
      name: override ?? derived.name,
      aliases: Object.freeze(aliases),
      rdfTypeUri: derived.iri,
      acceptedClassUris: Object.freeze([...accepted]),
    }) as RecordType;
  });

  // Checked here rather than where a caller happens to look. An invariant
  // enforced at assembly holds for every consumer and every test and cannot be
  // skipped by forgetting to assert it — the argument `src/terms/index.ts`
  // makes for building its map with an explicit loop.
  const claimants = new Map<string, string[]>();

  for (const recordType of assembled) {
    for (const name of [recordType.name, ...recordType.aliases]) {
      claimants.set(name, [...(claimants.get(name) ?? []), recordType.rdfTypeUri]);
    }
  }

  const contested = [...claimants].filter(([, iris]) => iris.length > 1);

  if (contested.length > 0) {
    throw new Error(
      `${contested.length} name(s) are claimed by more than one class: `
      + contested.map(([name, iris]) => `"${name}" by ${iris.join(' and ')}`).join('; ')
      + '. A class reads back as exactly one type. Add a NAME_OVERRIDES entry naming which '
      + 'spelling each class returns, rather than letting the order of the derived table decide.',
    );
  }

  return Object.freeze(assembled);
}

const RECORD_TYPES = assembleRecordTypes(DERIVED_CLASSES);

const BY_NAME: ReadonlyMap<string, RecordType> = new Map(
  RECORD_TYPES.flatMap((recordType) =>
    [recordType.name, ...recordType.aliases].map((name) => [name, recordType] as const)),
);

/**
 * Class IRI → the record type it reads back as, deprecated spellings included.
 *
 * Built with an explicit loop for the reason `src/terms/index.ts` gives: a
 * `new Map(...)` over pairs keeps the last of two claimants and reports
 * nothing, so which one won would depend on order and the loser would be
 * unreachable with no way to notice.
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
          + 'in a supersedes link rather than in the derived table.',
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
 * `'Procedure'` because spec publishes that name, not because of where a row
 * sits in a file.
 */
export function recordTypeForClass(classUri: string): RecordType | undefined {
  return BY_CLASS.get(classUri);
}

/** Every record type spec declares, in name order. */
export function allRecordTypes(): readonly RecordType[] {
  return RECORD_TYPES;
}
