/**
 * Everything this SDK knows about a record type, behind three functions.
 *
 * The front door. Import from here, never from
 * `../spec/derived/record-types.generated.js` or `./overrides.js` — a caller
 * reaching those gets rows without the invariants below having been checked.
 *
 * DERIVED, NOT TRANSCRIBED. The classes and their published names come from
 * `src/spec/`, built from the checkout by `scripts/build-spec-data.mjs` and
 * turned into `src/spec/derived/record-types.generated.ts` by
 * `scripts/build-record-types.mjs`. The
 * population is spec's, stated by `cascade:RecordClass` — a marker the
 * record-bearing classes carry directly. It replaces a reading of
 * `rdfs:subClassOf prov:Entity` that `jayostis/spec#34` (ASK-05) ruled out:
 * the axiom is PROV-O alignment and says nothing about records, and on spec's
 * main 96 of the 110 classes it caught were alignment axioms.
 * `jayostis/spec#50` added the marker and `conformance/scripts/SPEC_PIN` names
 * that revision, so it is the only rule: the PROV bridge and the pending list
 * that patched its blind spots were deleted once the pin moved.
 *
 * WHAT THIS FIXES. One RDF class must read back as exactly one JSON `type`, and
 * that choice used to be made by object key order: `buildReverseTypeMap` took
 * "the first entry in `TYPE_TO_MAPPING_KEY` that maps to each mapping key", so
 * `clinical:Procedure` read back as `ProcedureRecord` — a spelling
 * `src/models/procedure.ts:23` does not declare and `src/index.ts` does not
 * export. Here the name comes from spec, and where two classes claim one name
 * nothing picks between them.
 *
 * A CONTESTED NAME FAILS; THE PACKAGE DOES NOT. The assembly used to throw on a
 * collision, and it ran at module evaluation — so one duplicate name arriving
 * in a regenerated table would fail `import '@the-cascade-protocol/sdk'`
 * outright, taking `serialize`, `deserialize`, `toJsonLd` and `validate` down
 * together over one ambiguous name among every unambiguous one. The
 * collision is now carried as data: every uncontested type assembles, and the
 * contested name throws from `recordTypeFor` at the point something actually
 * asks for it. See #89.
 *
 * WHICH IS NOT THE SAME AS ANSWERING `undefined`. That was the trap in
 * deferring, and the reason the throw is where it is. Every caller of
 * `recordTypeFor` already reads `undefined` as "not a record type" and takes a
 * different path on it — `src/serializer/turtle-serializer.ts` falls through to
 * the legacy writer, `src/deserializer/turtle-parser.ts` falls back to the
 * spelling the caller asked under (the `ProcedureRecord`/`Procedure` defect
 * above, exactly), `src/converter/to-rdf.ts` reports that no context publishes
 * a name for it, and `src/migration/index.ts` counts it as unmigrated. All four
 * would be wrong, quietly. An unknown name and a contested name are two
 * questions, and they get two answers: `undefined` and an exception.
 *
 * @module record-types
 */

export * from './types.js';
export { NAME_OVERRIDES, INPUT_ALIASES } from './overrides.js';
export type { DerivedClass, NameCollision } from '../spec/derived/record-types.generated.js';

/**
 * What spec publishes for two classes at once, before the overrides speak.
 *
 * Re-exported through the front door for the reason everything else here is:
 * a caller reaching the generated module directly gets rows with no statement
 * of what was done about them. This list is the UPSTREAM fact — every name a
 * `NAME_OVERRIDES` entry then settles stays in it, because the override
 * resolves the collision here while leaving the gap upstream exactly where it
 * was. {@link recordTypeFor} throwing is the other half: this says what spec
 * published, that says what is still unanswerable.
 */
export { NAME_COLLISIONS } from '../spec/derived/record-types.generated.js';

import { DERIVED_CLASSES } from '../spec/derived/record-types.generated.js';
import type { DerivedClass } from '../spec/derived/record-types.generated.js';
import { INPUT_ALIASES, NAME_OVERRIDES } from './overrides.js';
import type { RecordType } from './types.js';

/**
 * One assembled table: the record types, both lookups, and what neither can
 * answer.
 *
 * THE LOOKUPS BELONG TO THE TABLE, not to the module, because the module's
 * table is the one case that cannot exhibit the interesting behaviour. Every
 * duplicate name spec publishes is settled by an override, so `DERIVED_CLASSES`
 * assembles with nothing contested — a collision has to be constructed to be
 * tested at all, and a lookup reachable only as a module-level function could
 * not be handed one. The exported `recordTypeFor` and `recordTypeForClass` are
 * this table's, on the shipped classes.
 */
export interface RecordTypeTable {
  /** Every record type these classes produced, contested ones included. */
  readonly recordTypes: readonly RecordType[];

  /**
   * `name -> the class IRIs claiming it`, for the names more than one does.
   *
   * Empty in the ordinary case, and empty for the shipped table today. A name
   * in here resolves to nothing: {@link RecordTypeTable.recordTypeFor} throws
   * on it rather than picking a claimant, which is the choice by table order
   * this module exists to remove.
   */
  readonly contestedNames: ReadonlyMap<string, readonly string[]>;

  /** `class IRI -> the record type names claiming it`, likewise. */
  readonly contestedClasses: ReadonlyMap<string, readonly string[]>;

  /**
   * The record type a JSON `type` names, under any accepted spelling.
   *
   * `undefined` for a name nothing registers. THROWS for a name two classes
   * claim — see the module header: every caller reads `undefined` as "not a
   * record type" and would take a wrong path quietly on it.
   */
  recordTypeFor(name: string): RecordType | undefined;

  /**
   * The record type a class IRI reads back as, deprecated spellings included.
   *
   * `undefined` for an unregistered class, and throws for one two record types
   * claim — the same two questions, the same two answers.
   */
  recordTypeForClass(classUri: string): RecordType | undefined;
}

/**
 * Assemble record types from derived classes and the declared overrides.
 *
 * TAKES ITS CLASSES AS AN ARGUMENT, for the reason `deriveRecordTypes` did and
 * `thirdPartyImports(dir)` does: the interesting cases cannot be produced from
 * the real data. Every name collision spec publishes is settled by an override,
 * so a function that read `DERIVED_CLASSES` directly could not be tested
 * against the case it exists to handle at all — and the next vocabulary to
 * introduce a duplicate name is precisely the event that must not pass
 * silently.
 *
 * REFUSES NOTHING AT ASSEMBLY. It used to throw here, at module evaluation, and
 * the module header says why that is no longer where the failure belongs. The
 * collision is recorded and carried; the refusal happens in the lookup, for the
 * contested name alone.
 */
/**
 * Every name split into the ones that resolve and the ones that cannot.
 *
 * PARTITIONS, IT DOES NOT FILTER — and that is why this is not
 * `duplicateNamesAmong` from `scripts/lib/duplicate-names.mjs`, which a reader
 * comparing the two will reasonably think it duplicates. That one returns ONLY
 * the collisions and drops every name claimed once, which is what a build-time
 * report wants. A runtime lookup needs the other half as well: 78 names have to
 * resolve, and the contested one has to refuse. Reusing it here would answer
 * half the question and still leave this loop to answer the rest.
 *
 * There is a second reason they stay apart, and it outranks the first: nothing
 * under `scripts/` ships. A consumer installs `dist`, so importing build
 * tooling into `src/` would put an unpublished file on the runtime path —
 * exactly what `tests/no-runtime-deps.test.ts` exists to prevent.
 *
 * A CONTESTED NAME LANDS IN NEITHER MAP, deliberately. Putting one claimant in
 * `byName` and recording the collision beside it would leave a lookup that
 * ANSWERS — with whichever row the iteration reached first, which is the
 * accident this module was built to remove.
 */
function partitionNamesByClaimant(assembled: readonly RecordType[]): {
  byName: Map<string, RecordType>;
  contestedNames: Map<string, readonly string[]>;
} {
  const claimants = new Map<string, RecordType[]>();

  for (const recordType of assembled) {
    for (const name of [recordType.name, ...recordType.aliases]) {
      claimants.set(name, [...(claimants.get(name) ?? []), recordType]);
    }
  }

  const byName = new Map<string, RecordType>();
  const contestedNames = new Map<string, readonly string[]>();

  for (const [name, claiming] of claimants) {
    const [first] = claiming;

    if (claiming.length > 1) {
      contestedNames.set(name, Object.freeze(claiming.map((recordType) => recordType.rdfTypeUri)));
    } else if (first) {
      byName.set(name, first);
    }
  }

  return { byName, contestedNames };
}

export function assembleRecordTypes(classes: readonly DerivedClass[]): RecordTypeTable {
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

    // STILL A SET, with no override left to collide with it. Supersession is
    // spec's to state and all five deprecated classes now state it in
    // `rdfs:seeAlso`, so `derived.supersedes` is the whole of it — the
    // `SUPERSEDES_OVERRIDES` row that declared the fifth by hand went when
    // `jayostis/spec#50` gap 2 landed. The set stays because a class named twice
    // by ONE record type would land in `contestedClasses` and make
    // `recordTypeForClass` refuse to answer, describing a conflict between a
    // record type and itself; nothing in spec's data forbids the repeat.
    const accepted = new Set([derived.iri, ...derived.supersedes]);

    return Object.freeze({
      name: override ?? derived.name,
      aliases: Object.freeze(aliases),
      rdfTypeUri: derived.iri,
      acceptedClassUris: Object.freeze([...accepted]),
    }) as RecordType;
  });

  // Indexed here rather than where a caller happens to look. A table built at
  // assembly is the same table for every consumer and every test and cannot be
  // skipped by forgetting to build it — the argument `src/terms/index.ts` makes
  // for building its map with an explicit loop, and the reason a collision
  // found here is still found here now that it is deferred rather than thrown.
  const { byName, contestedNames } = partitionNamesByClaimant(assembled);

  // The class direction, indexed the same way and for the same reason. A
  // `new Map(...)` over pairs keeps the last of two claimants and reports
  // nothing, so which one won would depend on order and the loser would be
  // unreachable with no way to notice.
  const claimed = new Map<string, RecordType[]>();

  for (const recordType of assembled) {
    for (const classUri of recordType.acceptedClassUris) {
      claimed.set(classUri, [...(claimed.get(classUri) ?? []), recordType]);
    }
  }

  const byClass = new Map<string, RecordType>();
  const contestedClasses = new Map<string, readonly string[]>();

  for (const [classUri, claiming] of claimed) {
    const [first] = claiming;

    if (claiming.length > 1) {
      contestedClasses.set(classUri, Object.freeze(claiming.map((recordType) => recordType.name)));
    } else if (first) {
      byClass.set(classUri, first);
    }
  }

  return Object.freeze({
    recordTypes: Object.freeze(assembled),
    contestedNames,
    contestedClasses,

    recordTypeFor(name: string): RecordType | undefined {
      const claimants = contestedNames.get(name);

      if (claimants) {
        throw new Error(
          `"${name}" is claimed by more than one class: ${claimants.join(' and ')}. A name reads `
          + 'back as exactly one record type, and this SDK will not pick between them — an answer '
          + 'chosen by the order of the derived table is the defect src/record-types/ exists to '
          + 'remove. Declare which spelling each class returns in NAME_OVERRIDES '
          + '(src/record-types/overrides.ts). Every other record type is unaffected; only this '
          + 'name fails.',
        );
      }

      return byName.get(name);
    },

    recordTypeForClass(classUri: string): RecordType | undefined {
      const claimants = contestedClasses.get(classUri);

      if (claimants) {
        throw new Error(
          `${classUri} would read back as more than one record type: ${claimants.join(' and ')}. `
          + 'A class reads back as exactly one type; if one of these is a deprecated spelling, it '
          + 'belongs in a supersedes link rather than in the derived table. Every other class is '
          + 'unaffected; only this one fails.',
        );
      }

      return byClass.get(classUri);
    },
  });
}

/**
 * The shipped classes, assembled once.
 *
 * Memoised by being a module-level constant, as `src/migration/index.ts` says:
 * ES modules evaluate once per realm, so the indexing above runs at first
 * import and every lookup afterwards is a `Map.get`. Nothing here can throw at
 * evaluation any more — that is the whole of #89 — so importing this module,
 * and therefore importing the package, no longer depends on what spec published
 * last night.
 */
const TABLE: RecordTypeTable = assembleRecordTypes(DERIVED_CLASSES);

/**
 * The record type a JSON `type` names, under any accepted spelling.
 *
 * `undefined` for a name this SDK does not register — a question, not a
 * failure, and every caller already has a "not a record type" branch.
 *
 * THROWS for a name two classes claim, because that same branch would be the
 * wrong one: the module header traces all four callers and what each would do
 * quietly. A contested name is not an unknown name.
 */
export function recordTypeFor(name: string): RecordType | undefined {
  return TABLE.recordTypeFor(name);
}

/**
 * The record type a class IRI reads back as, deprecated spellings included.
 *
 * This is the direction the old code got wrong, and the reason it is a lookup
 * rather than a scan: `recordTypeForClass(clinical:Procedure).name` is
 * `'Procedure'` because spec publishes that name, not because of where a row
 * sits in a file.
 *
 * Throws for a class two record types claim, on the same terms as above.
 */
export function recordTypeForClass(classUri: string): RecordType | undefined {
  return TABLE.recordTypeForClass(classUri);
}

/** Every record type spec declares, in name order. */
export function allRecordTypes(): readonly RecordType[] {
  return TABLE.recordTypes;
}
