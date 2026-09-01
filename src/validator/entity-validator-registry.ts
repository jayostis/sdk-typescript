/**
 * Which validator judges which record type.
 *
 * `validate()` receives a plain object — `JSON.parse` off disk, out of a pod,
 * from an EHR import — so the only thing identifying it is `record.type`, a
 * string in the data. Every dispatch in this SDK is keyed on that string for
 * the same reason: `TYPE_MAPPING`, `TYPE_TO_MAPPING_KEY`, `termFor`. This is
 * that lookup for the per-record-type rules.
 *
 * DERIVED FROM THE MANIFEST, not from a second list. `src/models/validators/index.ts`
 * is the one hand-kept enumeration; this reads its exports. A validator left
 * out of the manifest is absent here too, which is what keeps the two from
 * disagreeing — the arrangement `src/terms/index.ts` already uses for terms.
 *
 * REGISTRATION IS RECOGNITION. `validateBase` currently checks `record.type`
 * against `RECOGNIZED_DATA_TYPES`, a fourth hand-maintained list of record
 * types that has already drifted: it holds 22 names where `TYPE_TO_MAPPING_KEY`
 * holds 39, so `Procedure`, `Encounter`, `ClaimRecord` and fourteen others
 * serialize fine and are rejected by `validate()` on sight. A registry cannot
 * drift that way, because a type is known exactly when something registered for
 * it. This does not fix that list — it is the shape that makes fixing it
 * possible.
 *
 * @module validator/entity-validator-registry
 */

import * as validators from '../models/validators/index.js';
import type { CascadeEntityValidator } from './entity-validator.js';
import type { CascadeRecord } from '../models/common.js';

/**
 * Any validator, whatever record type it is bound to.
 *
 * The generic parameter is what a SUBCLASS uses to have its constraint table
 * checked against its interface. A registry holding many of them cannot name
 * one type, and does not need to: `validate` takes the untyped bag of fields
 * that `validate()` already spread.
 */
type AnyEntityValidator = CascadeEntityValidator<CascadeRecord>;

/**
 * Index validators by the record type each claims, refusing a type claimed
 * twice.
 *
 * An explicit loop rather than `new Map(...)`, so a second validator claiming a
 * record type THROWS instead of quietly replacing the first. The same guard
 * `src/terms/index.ts` puts on duplicate term keys, and for the same reason: a
 * map built from a list silently keeps the last entry, and a rule that stopped
 * applying is not a failure anyone would notice.
 *
 * A FUNCTION OVER A LIST THE CALLER SUPPLIES, and exported for that reason
 * alone — nothing but the `BY_TYPE` initialiser below calls it in `src/`. Aimed
 * only at our own manifest, where no two validators collide, the guard would
 * pass identically if it were inverted or if `already` were dropped: it can
 * only be shown to work by being handed a collision, and there is no collision
 * to hand it inside a codebase where it holds. `tests/terms/registry.ts` splits
 * the barrel check out for the same reason, and this is the missing counterpart
 * to it — `src/terms/index.ts` builds its map inline and its duplicate-key
 * guard is, today, still unexercised.
 */
export function indexByType(
  candidates: Iterable<AnyEntityValidator>,
): Map<string, AnyEntityValidator> {
  const byType = new Map<string, AnyEntityValidator>();

  for (const validator of candidates) {
    const already = byType.get(validator.type);
    if (already) {
      throw new Error(
        `Two validators claim '${validator.type}': ${already.constructor.name} and ` +
          `${validator.constructor.name}. A record type has one set of rules; a map built ` +
          'from the manifest would keep the second and drop the first without a word.',
      );
    }
    byType.set(validator.type, validator);
  }

  return byType;
}

/**
 * Built once, at module load, from the manifest's exports.
 *
 * `Object.values` over the manifest module is what makes this DERIVED: a
 * validator becomes reachable by being exported from
 * `src/models/validators/index.ts` and by nothing else.
 */
const BY_TYPE: ReadonlyMap<string, AnyEntityValidator> = indexByType(
  Object.values(validators).map((Validator) => new Validator() as AnyEntityValidator),
);

/**
 * The validator for a record type, or `undefined` where none exists yet.
 *
 * `undefined` IS THE NORMAL ANSWER TODAY and must stay usable: one record type
 * has a validator and thirty-eight do not. A caller treats the absence as "no
 * per-type rules to add", never as "this type is unknown" — that judgement
 * belongs to whatever owns the recognised-type list, and answering it from here
 * would reject every record nobody has written a validator for.
 */
export function validatorFor(type: string): AnyEntityValidator | undefined {
  return BY_TYPE.get(type);
}

/** Every record type with rules of its own, for tests and for reporting. */
export function validatedTypes(): readonly string[] {
  return [...BY_TYPE.keys()].sort();
}
