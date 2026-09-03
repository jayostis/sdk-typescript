/**
 * The migration switch: one question, asked the same way everywhere.
 *
 * `isMigrated(rdfTypeUri)` is the whole surface a seam needs. Everything else
 * here exists so the answer can be trusted and so #85 can print progress
 * without re-deriving it.
 *
 * VALIDATED AT LOAD, NOT WHERE A CALLER LOOKS. An allow-list entry that matches
 * no registered class is the dangerous failure, because the wrong answer is the
 * DEFAULT one: `has()` returns false, the seam takes the old path, and a type
 * everybody believes is migrated quietly is not. Nothing is red, nothing is
 * logged, and the only symptom is that the new engine is never exercised for
 * that type. So a bad entry takes the module down at import, naming itself.
 *
 * @module migration
 */

import { allRecordTypes, recordTypeFor, recordTypeForClass } from '../record-types/index.js';
import type { RecordType } from '../record-types/index.js';
import { MIGRATED_CLASSES } from './allow-list.js';

export { MIGRATED_CLASSES } from './allow-list.js';

/** What the allow-list says, once it has been checked. */
export interface MigrationState {
  /** The class IRIs on the new engine. */
  readonly migrated: ReadonlySet<string>;

  /** The record types on the new engine, in table order. */
  readonly migratedTypes: readonly RecordType[];

  /** The record types still on the old path, in table order. */
  readonly remainingTypes: readonly RecordType[];
}

/**
 * Check an allow-list and index it.
 *
 * PURE, AND IT TAKES ITS ENTRIES AS AN ARGUMENT — the shape
 * `thirdPartyImports(dir)` and `deriveRecordTypes(classes, names)` already use
 * here, and for the same reason. Production has exactly one allow-list, and it
 * is empty today; a refusal that can only be provoked by editing the shipped
 * list is a refusal nothing proves. Handing this a list that MUST make it speak
 * is what `tests/README.md` asks for.
 *
 * Three ways an entry is wrong, and each throws rather than being skipped:
 *
 * - **It matches no registered class.** A typo, or a class that has gone. The
 *   answer would otherwise be a silent "not migrated".
 * - **It is a deprecated spelling.** `clinical:Allergy` and
 *   `health:AllergyRecord` are one record type read two ways. Migrating one
 *   would put the same record on two different engines depending on which class
 *   the pod that holds it happens to carry.
 * - **It is listed twice.** Harmless to the set and not to the reader: a
 *   duplicate is how a merge resolves a conflict by keeping both sides, and the
 *   count it corrupts is the one #85 reports.
 */
export function migrationStateOf(entries: readonly string[]): MigrationState {
  const migrated = new Set<string>();

  for (const entry of entries) {
    const recordType = recordTypeForClass(entry);

    if (!recordType) {
      throw new Error(
        `The migration allow-list names ${entry}, which is not a registered class. An entry `
        + 'nothing matches reads as "not migrated" — the same answer as leaving it out — so the '
        + 'type it was meant to switch would stay on the old path with nothing to say so. Use '
        + 'the rdfTypeUri of a record type in src/record-types/table.ts.',
      );
    }

    if (entry !== recordType.rdfTypeUri) {
      throw new Error(
        `The migration allow-list names ${entry}, a deprecated spelling of `
        + `${recordType.rdfTypeUri}. A record type migrates whole: listing the deprecated class `
        + 'would put the same record on two different engines depending on which spelling the '
        + `pod holding it carries. List ${recordType.rdfTypeUri} instead.`,
      );
    }

    if (migrated.has(entry)) {
      throw new Error(
        `The migration allow-list names ${entry} twice. The set is unaffected and the count is `
        + 'not, and the count is what reports progress.',
      );
    }

    migrated.add(entry);
  }

  const migratedTypes = allRecordTypes().filter((type) => migrated.has(type.rdfTypeUri));

  return {
    migrated,
    migratedTypes,
    remainingTypes: allRecordTypes().filter((type) => !migrated.has(type.rdfTypeUri)),
  };
}

/**
 * The shipped allow-list, checked and indexed once.
 *
 * Memoised by being a module-level constant: ES modules evaluate once per
 * realm, so the checks above run at first import and every seam afterwards pays
 * a `Set.has`.
 */
const STATE: MigrationState = migrationStateOf(MIGRATED_CLASSES);

/**
 * Is this class on the spec-derived engine yet?
 *
 * The question every seam asks. Takes the class IRI, because that is what a
 * seam holding a parsed graph has and what survives the deletion of
 * `src/vocabularies/`.
 */
export function isMigrated(rdfTypeUri: string): boolean {
  return STATE.migrated.has(rdfTypeUri);
}

/**
 * The same question asked with a JSON `type`, under any accepted spelling.
 *
 * For the seams that hold a record rather than a graph. Goes through
 * `recordTypeFor`, so an alias answers the same as its canonical name — which
 * is the half a name-keyed allow-list could not get right.
 *
 * An unregistered name is not migrated. It is also not anything else: nothing
 * in this SDK can serialize it either.
 */
export function isMigratedType(name: string): boolean {
  const recordType = recordTypeFor(name);
  return recordType ? STATE.migrated.has(recordType.rdfTypeUri) : false;
}

/**
 * What has moved and what has not.
 *
 * REPORTS AS WELL AS ANSWERS. #85 prints migration progress, and the only way
 * for that number to be trustworthy is for it to come from the same list the
 * switch reads — a second count, derived a second way, is a second thing to be
 * wrong.
 */
export function migrationState(): MigrationState {
  return STATE;
}
