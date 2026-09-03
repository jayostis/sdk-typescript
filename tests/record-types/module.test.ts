/**
 * What `recordTypeFor` and `recordTypeForClass` answer, row by row.
 *
 * ENUMERATED, NOT LOOPED. The value of this module is that these specific rows
 * are right; a test that iterates the table proves the table agrees with
 * itself, which it would do just as happily with `ProcedureRecord` in it. Two
 * of the assertions below were RED before `src/record-types/` existed and are
 * the defects it closes.
 */

import { describe, it, expect } from 'vitest';

import {
  CANONICAL_NAMES,
  RDF_TYPE_OVERRIDES,
  allRecordTypes,
  recordTypeFor,
  recordTypeForClass,
} from '../../src/record-types/index.js';
import { NAMESPACES } from '../../src/vocabularies/namespaces.js';

const clinical = NAMESPACES.clinical;
const health = NAMESPACES.health;
const coverage = NAMESPACES.coverage;

describe('the overrides resolve to exactly these classes', () => {
  // One assertion each, so a regression names the row rather than reporting
  // that "the overrides" changed.
  it('MedicationRecord is clinical:Medication', () => {
    expect(recordTypeFor('MedicationRecord')?.rdfType).toBe('clinical:Medication');
  });

  it('ProcedureRecord is clinical:Procedure', () => {
    expect(recordTypeFor('ProcedureRecord')?.rdfType).toBe('clinical:Procedure');
  });

  it('SocialHistoryRecord is health:SocialHistoryRecord', () => {
    // The only local name two vocabularies both declare, which is why two of
    // the overrides are about it.
    expect(recordTypeFor('SocialHistoryRecord')?.rdfType).toBe('health:SocialHistoryRecord');
  });

  it('ClinicalSocialHistoryRecord is clinical:SocialHistoryRecord', () => {
    expect(recordTypeFor('ClinicalSocialHistoryRecord')?.rdfType)
      .toBe('clinical:SocialHistoryRecord');
  });

  it('SocialHistoryConsent is cascade:SocialHistoryConsent', () => {
    // `core.ttl:1289` declares it an `owl:NamedIndividual`, not an `owl:Class`,
    // so no class index contains it. See #43.
    expect(recordTypeFor('SocialHistoryConsent')?.rdfType).toBe('cascade:SocialHistoryConsent');
  });

  it('CoverageRecord is coverage:InsurancePlan, not the deprecated class it matches', () => {
    // The sixth override, and the one #42 did not have. `clinical:CoverageRecord`
    // is declared and is an exact local-name match; deriving to it would undo
    // #26 and start writing a class deprecated since clinical v1.5.
    expect(recordTypeFor('CoverageRecord')?.rdfType).toBe('coverage:InsurancePlan');
  });
});

describe('canonical names: the spelling a read returns', () => {
  it('clinical:Medication reads back as MedicationRecord', () => {
    expect(recordTypeForClass(`${clinical}Medication`)?.name).toBe('MedicationRecord');
  });

  it('clinical:Procedure reads back as Procedure', () => {
    // RED before this module: `'ProcedureRecord'`, because that spelling is
    // typed one line earlier in `TYPE_TO_MAPPING_KEY` and `buildReverseTypeMap`
    // took the first entry reaching each mapping key. `src/models/procedure.ts`
    // declares `type: 'Procedure'` as a single string literal and nothing is
    // exported under the other name, so the old answer was a value this
    // package's own published type says is impossible.
    expect(recordTypeForClass(`${clinical}Procedure`)?.name).toBe('Procedure');
  });

  it('coverage:InsurancePlan reads back as InsurancePlan', () => {
    expect(recordTypeForClass(`${coverage}InsurancePlan`)?.name).toBe('InsurancePlan');
  });
});

describe('aliases are accepted on input and never returned', () => {
  it('Medication resolves to the MedicationRecord type', () => {
    expect(recordTypeFor('Medication')?.rdfType).toBe('clinical:Medication');
    expect(recordTypeFor('Medication')?.name).toBe('MedicationRecord');
    expect(recordTypeFor('MedicationRecord')?.aliases).toEqual(['Medication']);
  });

  it('ProcedureRecord resolves to the Procedure type', () => {
    expect(recordTypeFor('ProcedureRecord')?.rdfType).toBe('clinical:Procedure');
    expect(recordTypeFor('ProcedureRecord')?.name).toBe('Procedure');
    expect(recordTypeFor('Procedure')?.aliases).toEqual(['ProcedureRecord']);
  });

  it('CoverageRecord resolves to the InsurancePlan type', () => {
    // Both spellings reach `serialize()` on purpose — JSON off disk can still
    // name the deprecated one — and only `InsurancePlan` comes back.
    expect(recordTypeFor('CoverageRecord')?.rdfType).toBe('coverage:InsurancePlan');
    expect(recordTypeFor('CoverageRecord')?.name).toBe('InsurancePlan');
    expect(recordTypeFor('InsurancePlan')?.aliases).toEqual(['CoverageRecord']);
  });

  it('registers exactly three groups of two, and no other name is an alias', () => {
    // The count is not the assertion — the contents are. A fourth collision
    // arriving unannounced is the event this module exists to make visible.
    const withAliases = allRecordTypes()
      .filter((recordType) => recordType.aliases.length > 0)
      .map((recordType) => [recordType.name, [...recordType.aliases]]);

    expect(withAliases.sort()).toEqual([
      ['InsurancePlan', ['CoverageRecord']],
      ['MedicationRecord', ['Medication']],
      ['Procedure', ['ProcedureRecord']],
    ]);
  });
});

describe('the deprecated class spellings still resolve', () => {
  // Deprecated but NOT removed: the pod export path is still their sole emitter
  // and existing pods contain them. Refusing to read those pods would be a
  // data-loss bug dressed up as standards compliance.
  it('clinical:LabResult reads back as LabResultRecord', () => {
    expect(recordTypeForClass(`${clinical}LabResult`)?.name).toBe('LabResultRecord');
  });

  it('clinical:Condition reads back as ConditionRecord', () => {
    expect(recordTypeForClass(`${clinical}Condition`)?.name).toBe('ConditionRecord');
  });

  it('clinical:Allergy reads back as AllergyRecord', () => {
    expect(recordTypeForClass(`${clinical}Allergy`)?.name).toBe('AllergyRecord');
  });

  it('clinical:Immunization reads back as ImmunizationRecord', () => {
    expect(recordTypeForClass(`${clinical}Immunization`)?.name).toBe('ImmunizationRecord');
  });

  it('clinical:CoverageRecord reads back as InsurancePlan', () => {
    // The fifth, and the only one whose alias crosses vocabularies.
    expect(recordTypeForClass(`${clinical}CoverageRecord`)?.name).toBe('InsurancePlan');
  });

  it('carries them on the record type, not in a table beside it', () => {
    expect(recordTypeFor('AllergyRecord')?.acceptedClassUris)
      .toEqual([`${health}AllergyRecord`, `${clinical}Allergy`]);
  });
});

describe('the invariants that make the two directions agree', () => {
  it('every registered type round-trips its own class', () => {
    for (const recordType of allRecordTypes()) {
      expect(recordTypeForClass(recordType.rdfTypeUri)?.name).toBe(recordType.name);
    }
  });

  it('every accepted spelling of every class reads back as its canonical name', () => {
    for (const recordType of allRecordTypes()) {
      for (const classUri of recordType.acceptedClassUris) {
        expect(recordTypeForClass(classUri)?.name).toBe(recordType.name);
      }
    }
  });

  it('every alias resolves to the same class as its canonical name', () => {
    for (const recordType of allRecordTypes()) {
      for (const alias of recordType.aliases) {
        expect(recordTypeFor(alias)?.rdfTypeUri).toBe(recordType.rdfTypeUri);
      }
    }
  });

  it('expands every CURIE — no rdfTypeUri is left unexpanded', () => {
    // An unexpanded CURIE matches no `rdf:type` in any pod and no
    // `sh:targetClass` in any shape, so the record type would simply never be
    // present. `expandClass` throws at load rather than allow it; this is what
    // says so from outside.
    for (const recordType of allRecordTypes()) {
      expect(recordType.rdfTypeUri).toMatch(/^https?:\/\//);
      expect(recordType.rdfTypeUri).not.toBe(recordType.rdfType);
    }
  });

  it('names an unknown type and an unknown class as absent, not as an error', () => {
    expect(recordTypeFor('NotARecordType')).toBeUndefined();
    expect(recordTypeForClass(`${clinical}NotAClass`)).toBeUndefined();
  });

  it('declares a canonical name for every alias and no others', () => {
    // `CANONICAL_NAMES` is `alias -> canonical`. An entry whose key is not an
    // accepted name, or whose value is not a canonical one, would be a
    // declaration nothing reads.
    for (const [alias, canonical] of Object.entries(CANONICAL_NAMES)) {
      expect(recordTypeFor(alias)?.name, `${alias} -> ${canonical}`).toBe(canonical);
      expect(recordTypeFor(canonical)?.name).toBe(canonical);
    }
  });

  it('resolves every override to the class it declares', () => {
    for (const [name, curie] of Object.entries(RDF_TYPE_OVERRIDES)) {
      expect(recordTypeFor(name)?.rdfType, name).toBe(curie);
    }
  });
});
