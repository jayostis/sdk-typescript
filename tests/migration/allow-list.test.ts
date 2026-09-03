/**
 * The migration switch answers, and refuses.
 *
 * The detector is handed lists where it MUST speak before it is pointed at the
 * shipped one — `tests/README.md`, "A detector is proven by making it speak."
 * That matters more here than usual: the shipped list is EMPTY, so a refusal
 * proven only against it is proven by nothing at all.
 *
 * The failure this guards is the quiet one. An allow-list entry that matches
 * nothing gives the DEFAULT answer — `has()` is false, the seam takes the old
 * path — so a type everyone believes has migrated silently has not, with a
 * green suite and no log line. Hence a throw at load rather than a skip.
 */

import { describe, it, expect } from 'vitest';

import {
  MIGRATED_CLASSES,
  isMigrated,
  isMigratedType,
  migrationState,
  migrationStateOf,
} from '../../src/migration/index.js';
import { allRecordTypes, recordTypeFor } from '../../src/record-types/index.js';
import { NAMESPACES } from '../../src/vocabularies/namespaces.js';

const immunization = recordTypeFor('ImmunizationRecord')?.rdfTypeUri as string;
const procedure = recordTypeFor('Procedure')?.rdfTypeUri as string;

describe('the shipped allow-list', () => {
  it('is empty, which is the current state and not a placeholder', () => {
    // Nothing has migrated. #90 builds the mechanism; #81 adds the first line.
    // Asserted so that adding one is a deliberate act with a test to update,
    // rather than something that slips in with a refactor.
    expect(MIGRATED_CLASSES).toEqual([]);
    expect(migrationState().migratedTypes).toEqual([]);
  });

  it('reports every record type as remaining', () => {
    expect(migrationState().remainingTypes).toHaveLength(allRecordTypes().length);
  });

  it('answers no for a real class and for one that does not exist', () => {
    expect(isMigrated(immunization)).toBe(false);
    expect(isMigrated(`${NAMESPACES.clinical}NotAClass`)).toBe(false);
  });

  it('answers no for a type name, canonical or alias', () => {
    expect(isMigratedType('Procedure')).toBe(false);
    expect(isMigratedType('ProcedureRecord')).toBe(false);
    expect(isMigratedType('NotARecordType')).toBe(false);
  });
});

describe('a list with entries in it', () => {
  it('indexes the class and reports the type as migrated', () => {
    const state = migrationStateOf([immunization]);

    expect(state.migrated.has(immunization)).toBe(true);
    expect(state.migratedTypes.map((type) => type.name)).toEqual(['ImmunizationRecord']);
  });

  it('splits the record types into migrated and remaining, losing none', () => {
    const state = migrationStateOf([immunization, procedure]);

    expect(state.migratedTypes.map((type) => type.name).sort())
      .toEqual(['ImmunizationRecord', 'Procedure']);
    expect(state.migratedTypes.length + state.remainingTypes.length)
      .toBe(allRecordTypes().length);
    expect(state.remainingTypes.map((type) => type.name))
      .not.toContain('ImmunizationRecord');
  });

  it('migrates a record type whole — both of its names, not one', () => {
    // The half a name-keyed list could not get right. `Procedure` and
    // `ProcedureRecord` are one record type; listing the class migrates the
    // record, not a way of spelling it.
    const state = migrationStateOf([procedure]);

    expect(state.migrated.has(procedure)).toBe(true);
    expect(recordTypeFor('ProcedureRecord')?.rdfTypeUri).toBe(procedure);
    expect(recordTypeFor('Procedure')?.rdfTypeUri).toBe(procedure);
  });
});

describe('what it refuses', () => {
  it('throws on an entry no registered class matches', () => {
    expect(() => migrationStateOf([`${NAMESPACES.health}NotAClass`]))
      .toThrow(/not a registered class/);
  });

  it('names the entry it refused', () => {
    // The message has to carry the string, because the thing that went wrong is
    // usually a typo in exactly that string.
    expect(() => migrationStateOf(['https://ns.cascadeprotocol.org/health/v1#Immunization']))
      .toThrow(/health\/v1#Immunization\b/);
  });

  it('throws on a CURIE, which is the likeliest way to write it wrong', () => {
    expect(() => migrationStateOf(['health:ImmunizationRecord']))
      .toThrow(/not a registered class/);
  });

  it('throws on a deprecated spelling, naming the one to use instead', () => {
    // `clinical:Immunization` reads back as `ImmunizationRecord`, so it is a
    // spelling of a migrated type rather than a type of its own. Allowing it
    // would put the same record on two engines depending on which class the pod
    // holding it happens to carry.
    expect(() => migrationStateOf([`${NAMESPACES.clinical}Immunization`]))
      .toThrow(/deprecated spelling of .*health\/v1#ImmunizationRecord/);
  });

  it('throws on a duplicate', () => {
    expect(() => migrationStateOf([immunization, immunization])).toThrow(/twice/);
  });

  it('accepts an empty list', () => {
    // The state the shipped list is in. A guard that refused it would have to
    // be switched off before the first migration could be prepared.
    expect(() => migrationStateOf([])).not.toThrow();
  });
});
