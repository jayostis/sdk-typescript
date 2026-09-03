/**
 * The migration switch: one question, asked the same way everywhere.
 *
 * `isMigrated(rdfTypeUri, path)` is the whole surface a seam needs. Everything
 * else here exists so the answer can be trusted and so #85 can print progress
 * without re-deriving it.
 *
 * PER TYPE AND PER PATH, which #75 is explicit about. Serializing,
 * deserializing and validating are three independent migrations — a type's
 * writer can be ready while its validator is not — so the unit of progress is
 * a (type, path) pair, not a type. A switch that could only say "migrated"
 * would force all three to move together, or none to move at all.
 *
 * VALIDATED AT LOAD, NOT WHERE A CALLER LOOKS. An allow-list entry that matches
 * no registered class is the dangerous failure, because the wrong answer is the
 * DEFAULT one: the lookup misses, the seam takes the old path, and a type
 * everybody believes is routed quietly is not. Nothing is red, nothing is
 * logged, and the only symptom is that the new engine is never exercised for
 * that type. So a bad entry takes the module down at import, naming itself.
 *
 * @module migration
 */

import { allRecordTypes, recordTypeFor, recordTypeForClass } from '../record-types/index.js';
import type { RecordType } from '../record-types/index.js';
import { MIGRATED_CLASSES, MIGRATION_PATHS } from './allow-list.js';
import type { MigrationPath } from './allow-list.js';

export { MIGRATED_CLASSES, MIGRATION_PATHS } from './allow-list.js';
export type { MigrationPath } from './allow-list.js';

/** What the allow-list says, once it has been checked. */
export interface MigrationState {
  /** `class IRI -> the paths it is routed on`. */
  readonly migrated: ReadonlyMap<string, ReadonlySet<MigrationPath>>;

  /** `path -> the record types routed on it`, for reporting. */
  readonly byPath: ReadonlyMap<MigrationPath, readonly RecordType[]>;

  /** Routed (type, path) pairs. */
  readonly routed: number;

  /** (type, path) pairs still on the old code — the denominator #85 reports. */
  readonly remaining: number;
}

/**
 * Check an allow-list and index it.
 *
 * PURE, AND IT TAKES ITS ENTRIES AS AN ARGUMENT — the shape
 * `thirdPartyImports(dir)` and `assembleRecordTypes(classes)` already use here,
 * and for the same reason. Production has exactly one allow-list with one entry
 * in it; a refusal that can only be provoked by editing the shipped list is a
 * refusal nothing proves. Handing this a list that MUST make it speak is what
 * `tests/README.md` asks for.
 *
 * Four ways an entry is wrong, and each throws rather than being skipped:
 *
 * - **It matches no registered class.** A typo, or a class that has gone. The
 *   answer would otherwise be a silent "not routed".
 * - **It is a deprecated spelling.** `clinical:Allergy` and
 *   `health:AllergyRecord` are one record type read two ways. Routing one
 *   would put the same record on two engines depending on which class the pod
 *   holding it happens to carry.
 * - **It names no path.** An empty list reads as routed-for-nothing, which is
 *   the same as not being listed and is how an entry ends up meaning nothing.
 * - **It names a path that does not exist.** A typo in `'serialise'` fails
 *   every lookup silently.
 */
export function migrationStateOf(
  entries: Readonly<Record<string, readonly MigrationPath[]>>,
): MigrationState {
  const migrated = new Map<string, ReadonlySet<MigrationPath>>();

  for (const [classUri, paths] of Object.entries(entries)) {
    const recordType = recordTypeForClass(classUri);

    if (!recordType) {
      throw new Error(
        `The migration allow-list names ${classUri}, which is not a registered class. An entry `
        + 'nothing matches reads as "not routed" — the same answer as leaving it out — so the '
        + 'type it was meant to switch would stay on the old path with nothing to say so. Use '
        + 'the rdfTypeUri of a record type in src/record-types/generated.ts.',
      );
    }

    if (classUri !== recordType.rdfTypeUri) {
      throw new Error(
        `The migration allow-list names ${classUri}, a deprecated spelling of `
        + `${recordType.rdfTypeUri}. A record type routes whole: listing the deprecated class `
        + 'would put the same record on two different engines depending on which spelling the '
        + `pod holding it carries. List ${recordType.rdfTypeUri} instead.`,
      );
    }

    if (paths.length === 0) {
      throw new Error(
        `The migration allow-list names ${classUri} with no paths. Routed for nothing is the `
        + 'same answer as absent, so the entry says nothing while looking deliberate. Remove it, '
        + `or name one of ${MIGRATION_PATHS.join(', ')}.`,
      );
    }

    for (const path of paths) {
      if (!MIGRATION_PATHS.includes(path)) {
        throw new Error(
          `The migration allow-list routes ${classUri} on "${path}", which is not a path. `
          + `It must be one of ${MIGRATION_PATHS.join(', ')}; anything else misses every lookup `
          + 'and reads as "not routed".',
        );
      }
    }

    migrated.set(classUri, new Set(paths));
  }

  const byPath = new Map<MigrationPath, readonly RecordType[]>(
    MIGRATION_PATHS.map((path) => [
      path,
      allRecordTypes().filter((type) => migrated.get(type.rdfTypeUri)?.has(path) ?? false),
    ]),
  );

  const routed = [...migrated.values()].reduce((total, paths) => total + paths.size, 0);

  return {
    migrated,
    byPath,
    routed,
    remaining: allRecordTypes().length * MIGRATION_PATHS.length - routed,
  };
}

/**
 * The shipped allow-list, checked and indexed once.
 *
 * Memoised by being a module-level constant: ES modules evaluate once per
 * realm, so the checks above run at first import and every seam afterwards pays
 * a map lookup and a `Set.has`.
 */
const STATE: MigrationState = migrationStateOf(MIGRATED_CLASSES);

/**
 * Is this class routed onto the spec-derived engine for this path?
 *
 * The question every seam asks. Takes the class IRI, because that is what a
 * seam holding a parsed graph has and what survives the deletion of
 * `src/vocabularies/`.
 */
export function isMigrated(rdfTypeUri: string, path: MigrationPath): boolean {
  return STATE.migrated.get(rdfTypeUri)?.has(path) ?? false;
}

/**
 * The same question asked with a JSON `type`, under any accepted spelling.
 *
 * For the seams that hold a record rather than a graph. Goes through
 * `recordTypeFor`, so an alias answers the same as its canonical name — which
 * is the half a name-keyed allow-list could not get right.
 *
 * An unregistered name is not routed. It is also not anything else: nothing in
 * this SDK can serialize it either.
 */
export function isMigratedType(name: string, path: MigrationPath): boolean {
  const recordType = recordTypeFor(name);
  return recordType ? isMigrated(recordType.rdfTypeUri, path) : false;
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
