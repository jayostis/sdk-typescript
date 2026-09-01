/**
 * The dispatch layer that decides which validator judges a record type.
 *
 * Two things here had no test at all, which is what this file is for.
 *
 * THE DUPLICATE-CLAIM GUARD, proven against input this file builds. Its whole
 * job is to stop a map silently keeping the second of two validators for one
 * record type — the "a rule that stopped applying is not a failure anyone would
 * notice" case its own docblock names. Aimed only at the real manifest, where
 * it must stay silent, it would pass identically if it were inverted or if
 * `already` were dropped, so `indexByType` takes the list from the caller and
 * the first test below hands it a collision it MUST speak about. That is the
 * same order `tests/terms/registry.test.ts` uses for `unbarrelled`, and for the
 * same reason.
 *
 * AND `validatedTypes()`, which is documented as existing "for tests and for
 * reporting" and had zero callers anywhere — dead code in the layer whose
 * stated purpose is stopping drift. It has one now.
 */

import { describe, it, expect } from 'vitest';

import {
  indexByType,
  validatorFor,
  validatedTypes,
} from '../../src/validator/entity-validator-registry.js';
import { CascadeEntityValidator } from '../../src/validator/entity-validator.js';
import { MedicationValidator } from '../../src/models/validators/index.js';
import type { CascadeRecord } from '../../src/models/common.js';

/**
 * A validator claiming `type` and declaring nothing.
 *
 * The registry indexes on `validator.type` and reads no other member, so a
 * stand-in needs only that and the abstract member the class requires. Building
 * one here rather than reusing a shipped validator is the point: two of these
 * can claim the same record type, which no pair of real ones can.
 */
function stub(type: string, name: string): CascadeEntityValidator<CascadeRecord> {
  const Stub = class extends CascadeEntityValidator<CascadeRecord> {
    readonly type = type as CascadeRecord['type'];
    additionalConstraints() {
      return {};
    }
  };
  // The error message names `constructor.name`, so the stub has to have one.
  Object.defineProperty(Stub, 'name', { value: name });
  return new Stub();
}

describe('indexByType', () => {
  it('throws when two validators claim one record type, naming both', () => {
    const collide = () => indexByType([stub('LabResultRecord', 'First'), stub('LabResultRecord', 'Second')]);

    expect(collide).toThrow(/Two validators claim 'LabResultRecord'/);
    // BOTH NAMES, not just the loser. The reader's next question is which two
    // files to open, and a message naming one of them answers half of it.
    expect(collide).toThrow(/First/);
    expect(collide).toThrow(/Second/);
  });

  it('keeps the first claimant rather than the last', () => {
    // The failure the throw exists to prevent, stated as the thing that does
    // NOT happen: `new Map([...])` would return a map holding `Second`, quietly.
    // If the guard were deleted this assertion is what changes.
    const first = stub('LabResultRecord', 'First');
    expect(() => indexByType([first, stub('LabResultRecord', 'Second')])).toThrow();
  });

  it('indexes distinct record types without complaint', () => {
    const index = indexByType([stub('LabResultRecord', 'Lab'), stub('VitalSign', 'Vital')]);

    expect([...index.keys()].sort()).toEqual(['LabResultRecord', 'VitalSign']);
    expect(index.get('VitalSign')?.constructor.name).toBe('Vital');
  });

  it('is empty for an empty manifest', () => {
    expect(indexByType([]).size).toBe(0);
  });
});

describe('validatorFor', () => {
  it('returns the validator the manifest registered for a migrated type', () => {
    expect(validatorFor('MedicationRecord')).toBeInstanceOf(MedicationValidator);
  });

  it('returns undefined for a record type nobody has written a validator for', () => {
    // NOT an error and not "unknown". Thirty-eight record types answer this way
    // today and `validate()` reads the absence as "no per-type rules to add",
    // so a registry that threw here would reject every one of them.
    expect(validatorFor('LabResultRecord')).toBeUndefined();
  });

  it('returns undefined for a string that is no record type at all', () => {
    expect(validatorFor('NotARecordType')).toBeUndefined();
    // A plain object indexed by data would resolve these off Object.prototype.
    expect(validatorFor('constructor')).toBeUndefined();
    expect(validatorFor('toString')).toBeUndefined();
  });
});

describe('validatedTypes', () => {
  it('reports exactly the record types the manifest exports validators for', () => {
    // Derived from `src/models/validators/index.ts`, not from a second list —
    // which is the property the registry exists to have. A validator added to
    // the manifest appears here without this file being edited; a validator
    // deleted from it disappears, and this is what says so.
    expect(validatedTypes()).toEqual(['MedicationRecord']);
  });

  it('agrees with validatorFor about every type it names', () => {
    for (const type of validatedTypes()) {
      expect(validatorFor(type)?.type).toBe(type);
    }
  });
});
