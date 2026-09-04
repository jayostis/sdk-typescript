/**
 * The migration switch answers, and refuses.
 *
 * The detector is handed lists where it MUST speak before it is pointed at the
 * shipped one — `tests/README.md`, "A detector is proven by making it speak."
 * That matters more than usual here: the shipped list has ONE entry, so a
 * refusal proven only against it is proven by almost nothing.
 *
 * The failure this guards is the quiet one. An allow-list entry that matches
 * nothing gives the DEFAULT answer — the lookup misses, the seam takes the old
 * path — so a type everyone believes has moved silently has not, with a green
 * suite and no log line. Hence a throw at load rather than a skip.
 */

import { describe, it, expect } from 'vitest';

import {
  MIGRATED_CLASSES,
  MIGRATION_PATHS,
  isMigrated,
  isMigratedType,
  migrationState,
  migrationStateOf,
} from '../../src/migration/index.js';
import type { MigrationPath } from '../../src/migration/index.js';
import { allRecordTypes, recordTypeFor } from '../../src/record-types/index.js';

const immunization = recordTypeFor('ImmunizationRecord')?.rdfTypeUri as string;
const procedure = recordTypeFor('Procedure')?.rdfTypeUri as string;
const clinical = 'https://ns.cascadeprotocol.org/clinical/v1#';

describe('the shipped allow-list', () => {
  it('routes ImmunizationRecord, on serialize alone', () => {
    // Asserted by contents, so adding a second entry is a deliberate act with a
    // test to update rather than something that rides along with a refactor.
    expect(MIGRATED_CLASSES).toEqual({ [immunization]: ['serialize'] });
  });

  it('answers yes for the routed path and no for the others', () => {
    // The whole point of the path dimension. There is no generic reader (#78)
    // and no generic validator (#79), so claiming those paths would make the
    // switch lie about code that does not exist.
    expect(isMigrated(immunization, 'serialize')).toBe(true);
    expect(isMigrated(immunization, 'deserialize')).toBe(false);
    expect(isMigrated(immunization, 'validate')).toBe(false);
  });

  it('answers no for an unrouted class and one that does not exist', () => {
    expect(isMigrated(procedure, 'serialize')).toBe(false);
    expect(isMigrated(`${clinical}NotAClass`, 'serialize')).toBe(false);
  });

  it('answers the same under every accepted spelling of the type', () => {
    // The half a name-keyed list could not get right: a record type routes
    // whole, so an alias cannot be left behind on the old path.
    expect(isMigratedType('ImmunizationRecord', 'serialize')).toBe(true);
    expect(isMigratedType('Procedure', 'serialize')).toBe(false);
    expect(isMigratedType('ProcedureRecord', 'serialize')).toBe(false);
    expect(isMigratedType('NotARecordType', 'serialize')).toBe(false);
  });

  it('reports one routed pair out of every type on every path', () => {
    const state = migrationState();

    expect(state.routed).toBe(1);
    expect(state.routed + state.remaining)
      .toBe(allRecordTypes().length * MIGRATION_PATHS.length);
    expect(state.byPath.get('serialize')?.map((type) => type.name)).toEqual(['ImmunizationRecord']);
    expect(state.byPath.get('deserialize')).toEqual([]);
    expect(state.byPath.get('validate')).toEqual([]);
  });
});

describe('a list with more in it', () => {
  it('routes several types on several paths', () => {
    const state = migrationStateOf({
      [immunization]: ['serialize', 'validate'],
      [procedure]: ['serialize'],
    });

    expect(state.routed).toBe(3);
    expect(state.byPath.get('serialize')?.map((type) => type.name).sort())
      .toEqual(['ImmunizationRecord', 'Procedure']);
    expect(state.byPath.get('validate')?.map((type) => type.name)).toEqual(['ImmunizationRecord']);
    expect(state.byPath.get('deserialize')).toEqual([]);
  });

  it('accepts an empty list', () => {
    // The state this was in before ImmunizationRecord landed. A guard that
    // refused it would have to be switched off to prepare the first migration.
    expect(() => migrationStateOf({})).not.toThrow();
    expect(migrationStateOf({}).routed).toBe(0);
  });
});

describe('what it refuses', () => {
  it('throws on a class no record type matches, naming it', () => {
    // The message has to carry the string, because what went wrong is usually a
    // typo in exactly that string.
    expect(() => migrationStateOf({ 'https://ns.cascadeprotocol.org/health/v1#NotAClass': ['serialize'] }))
      .toThrow(/health\/v1#NotAClass.*not a registered class/s);
  });

  it('throws on a CURIE, which is the likeliest way to write it wrong', () => {
    expect(() => migrationStateOf({ 'health:ImmunizationRecord': ['serialize'] }))
      .toThrow(/not a registered class/);
  });

  it('throws on a deprecated spelling, naming the one to use instead', () => {
    // `clinical:Immunization` reads back as `ImmunizationRecord`, so it is a
    // spelling of a routed type rather than a type of its own. Allowing it
    // would put the same record on two engines depending on which class the pod
    // holding it happens to carry.
    expect(() => migrationStateOf({ [`${clinical}Immunization`]: ['serialize'] }))
      .toThrow(/deprecated spelling of .*health\/v1#ImmunizationRecord/);
  });

  it('throws on an entry that names no path', () => {
    // Routed for nothing is the same answer as absent, so the entry says
    // nothing while looking deliberate.
    expect(() => migrationStateOf({ [immunization]: [] })).toThrow(/with no paths/);
  });

  it('throws on a path that does not exist, naming the ones that do', () => {
    // A typo in `serialise` would miss every lookup and read as "not routed".
    expect(() => migrationStateOf({ [immunization]: ['serialise' as MigrationPath] }))
      .toThrow(/"serialise", which is not a path.*serialize, deserialize, validate/s);
  });
});
