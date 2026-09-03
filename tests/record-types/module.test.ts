/**
 * What `recordTypeFor` and `recordTypeForClass` answer, row by row.
 *
 * ENUMERATED, NOT LOOPED. The value of this module is that these specific rows
 * are right; a test that iterates the table proves the table agrees with
 * itself, which it would do just as happily with `ProcedureRecord` coming back
 * from a read.
 *
 * The rows fall into two kinds and the file is arranged by which: what spec
 * says, which must survive a spec bump unchanged, and what
 * `src/record-types/overrides.ts` declares, which is five rows and four of them
 * have an issue that deletes them.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import {
  INPUT_ALIASES,
  NAME_OVERRIDES,
  SUPERSEDES_OVERRIDES,
  allRecordTypes,
  assembleRecordTypes,
  recordTypeFor,
  recordTypeForClass,
} from '../../src/record-types/index.js';
import { NAMESPACES } from '../../src/vocabularies/namespaces.js';

const cascade = NAMESPACES.cascade;
const clinical = NAMESPACES.clinical;
const health = NAMESPACES.health;
const coverage = NAMESPACES.coverage;

describe('names spec publishes', () => {
  // `../spec/contexts/v1/*.jsonld` is a name→IRI mapping and that is the whole
  // of its job, so where spec publishes a name for a class, that name wins.
  it('Procedure, which is what the context and the model both say', () => {
    expect(recordTypeFor('Procedure')?.rdfTypeUri).toBe(`${clinical}Procedure`);
    expect(recordTypeForClass(`${clinical}Procedure`)?.name).toBe('Procedure');
  });

  it('InsurancePlan', () => {
    expect(recordTypeForClass(`${coverage}InsurancePlan`)?.name).toBe('InsurancePlan');
  });

  it('the health: record classes, which spec names *Record throughout', () => {
    for (const local of ['AllergyRecord', 'ConditionRecord', 'LabResultRecord',
      'ImmunizationRecord', 'FamilyHistoryRecord', 'SocialHistoryRecord']) {
      expect(recordTypeForClass(`${health}${local}`)?.name, local).toBe(local);
    }
  });

  it('classes no context names, which fall back to the local name', () => {
    // Nine record classes are named by no context — `jayostis/spec#50` gap 3a.
    // For all nine the local name is what this SDK already used, so the
    // fallback is not a guess that happens to work; it is what closing the gap
    // should publish.
    expect(recordTypeForClass(`${clinical}MedicationAdministration`)?.name)
      .toBe('MedicationAdministration');
    expect(recordTypeForClass(`${coverage}ClaimRecord`)?.name).toBe('ClaimRecord');
  });
});

describe('the two names spec does not publish for us', () => {
  it('MedicationRecord, where spec publishes Medication', () => {
    // `jayostis/spec#51`. Spec names record classes `*Record` throughout
    // `health:` and bare under `clinical:`; this SDK applied the dominant
    // convention to a class that does not follow it. Changing it would break
    // eleven `med-*` fixtures, which are upstream.
    expect(recordTypeForClass(`${clinical}Medication`)?.name).toBe('MedicationRecord');
    expect(recordTypeFor('MedicationRecord')?.rdfTypeUri).toBe(`${clinical}Medication`);
  });

  it('Medication stays accepted, because spec publishes it', () => {
    // An override ADDS a spelling rather than replacing one. Spec is the
    // authority on what `Medication` means, so a document using it must read.
    expect(recordTypeFor('Medication')?.rdfTypeUri).toBe(`${clinical}Medication`);
    expect(recordTypeFor('Medication')?.name).toBe('MedicationRecord');
    expect(recordTypeFor('MedicationRecord')?.aliases).toContain('Medication');
  });

  it('ClinicalSocialHistoryRecord, because a context key cannot be used twice', () => {
    // `jayostis/spec#50` gap 3c. Two vocabularies declare `SocialHistoryRecord`
    // and they are different records — `health:` is consumer-reported,
    // `clinical:` is EHR-extracted from a C-CDA section with its own consent
    // scope and pod path.
    expect(recordTypeForClass(`${clinical}SocialHistoryRecord`)?.name)
      .toBe('ClinicalSocialHistoryRecord');
    expect(recordTypeForClass(`${health}SocialHistoryRecord`)?.name)
      .toBe('SocialHistoryRecord');
  });

  it('does not leave the contested name pointing at the renamed class', () => {
    // The bug the assembly guard caught: renaming the clinical class kept
    // `SocialHistoryRecord` as its alias, so one string claimed two classes and
    // the input direction would have answered by iteration order.
    expect(recordTypeFor('SocialHistoryRecord')?.rdfTypeUri).toBe(`${health}SocialHistoryRecord`);
    expect(recordTypeFor('ClinicalSocialHistoryRecord')?.aliases).toEqual([]);
  });
});

describe('spellings accepted on input and never returned', () => {
  it('ProcedureRecord resolves to the Procedure type', () => {
    expect(recordTypeFor('ProcedureRecord')?.rdfTypeUri).toBe(`${clinical}Procedure`);
    expect(recordTypeFor('ProcedureRecord')?.name).toBe('Procedure');
    expect(recordTypeFor('Procedure')?.aliases).toEqual(['ProcedureRecord']);
  });

  it('CoverageRecord resolves to the InsurancePlan type', () => {
    // Settled by #26. Both spellings reach `serialize()` so JSON off disk can
    // name either, and only `InsurancePlan` comes back.
    expect(recordTypeFor('CoverageRecord')?.rdfTypeUri).toBe(`${coverage}InsurancePlan`);
    expect(recordTypeFor('CoverageRecord')?.name).toBe('InsurancePlan');
    expect(recordTypeFor('InsurancePlan')?.aliases).toEqual(['CoverageRecord']);
  });

  it('registers exactly the aliases declared, and no others', () => {
    // Contents, not count. A fourth alias arriving unannounced is the event
    // this module exists to make visible.
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

describe('deprecated class spellings still resolve', () => {
  // Deprecated but NOT removed: the pod export path is still their sole emitter
  // and existing pods contain them. Refusing to read those pods would be a
  // data-loss bug dressed up as standards compliance.
  it('the four spec states with rdfs:seeAlso', () => {
    // Derived, not declared. These four carry a correct `rdfs:seeAlso` and the
    // build reads it — so a fifth deprecation landing upstream needs no change
    // here at all.
    expect(recordTypeForClass(`${clinical}LabResult`)?.name).toBe('LabResultRecord');
    expect(recordTypeForClass(`${clinical}Condition`)?.name).toBe('ConditionRecord');
    expect(recordTypeForClass(`${clinical}Allergy`)?.name).toBe('AllergyRecord');
    expect(recordTypeForClass(`${clinical}Immunization`)?.name).toBe('ImmunizationRecord');
  });

  it('the fifth, which spec states only in prose', () => {
    // `clinical:CoverageRecord`'s `rdfs:seeAlso` points at `fhir:Coverage` — a
    // documentation link, not the superseding class. `jayostis/spec#50` gap 2.
    expect(recordTypeForClass(`${clinical}CoverageRecord`)?.name).toBe('InsurancePlan');
    expect(SUPERSEDES_OVERRIDES[`${clinical}CoverageRecord`]).toBe(`${coverage}InsurancePlan`);
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

  it('holds full IRIs, never a CURIE', () => {
    // `RecordType` carried both until the classes were derived. Expanded
    // JSON-LD has no prefixes by construction, so a CURIE would need a
    // hand-kept prefix map — the last such map in the module.
    for (const recordType of allRecordTypes()) {
      expect(recordType.rdfTypeUri).toMatch(/^https?:\/\//);
    }
  });

  it('names an unknown type and an unknown class as absent, not as an error', () => {
    expect(recordTypeFor('NotARecordType')).toBeUndefined();
    expect(recordTypeForClass(`${clinical}NotAClass`)).toBeUndefined();
  });

  it('registers a class for every declared override and alias', () => {
    // A declaration nothing matches is a workaround that has outlived its
    // cause, and it would sit here forever reading as deliberate.
    for (const iri of Object.keys(NAME_OVERRIDES)) {
      expect(recordTypeForClass(iri), iri).toBeDefined();
    }
    for (const [alias, iri] of Object.entries(INPUT_ALIASES)) {
      expect(recordTypeFor(alias)?.rdfTypeUri, alias).toBe(iri);
    }
  });

  it('registers the classes pending spec#50, which the PROV rule does not reach', () => {
    // Without the pending list these would simply be absent, and an absent
    // record type is indistinguishable from a class that does not exist.
    expect(recordTypeForClass(`${health}AllergyRecord`)).toBeDefined();
    expect(recordTypeForClass(`${cascade}PatientProfile`)).toBeDefined();
    expect(recordTypeForClass(`${cascade}SocialHistoryConsent`)).toBeDefined();
  });
});

describe('the lookup refuses what the assembly cannot decide', () => {
  // Handed classes it MUST speak about. Every name collision spec publishes is
  // settled by an override, so a guard exercised only against the real table
  // would never be exercised at all.
  //
  // THE REFUSAL MOVED, and #89 is why. It used to happen in
  // `assembleRecordTypes`, which runs at module evaluation, so one duplicate
  // name in a regenerated table failed `import '@the-cascade-protocol/sdk'`
  // outright — every record type down over one ambiguous name. It now happens
  // in the lookup, for that name alone.
  const derived = (iri: string, name: string) => ({ iri, name, localName: name, supersedes: [] });

  it('assembles a colliding table instead of throwing at load', () => {
    const table = assembleRecordTypes([
      derived('https://example.org/a#Widget', 'Widget'),
      derived('https://example.org/b#Widget', 'Widget'),
    ]);

    expect(table.recordTypes).toHaveLength(2);
    expect([...table.contestedNames.keys()]).toEqual(['Widget']);
  });

  it('names both classes and the contested name, from the lookup', () => {
    // The message is the whole value: a reader has to know which two classes,
    // to write the override that settles it.
    const table = assembleRecordTypes([
      derived('https://example.org/a#Widget', 'Widget'),
      derived('https://example.org/b#Widget', 'Widget'),
    ]);

    expect(() => table.recordTypeFor('Widget'))
      .toThrow(/"Widget" is claimed by more than one class/);
    expect(() => table.recordTypeFor('Widget'))
      .toThrow(/https:\/\/example\.org\/a#Widget and https:\/\/example\.org\/b#Widget/);
    expect(() => table.recordTypeFor('Widget')).toThrow(/overrides\.ts/);
  });

  it('accepts two classes whose names differ', () => {
    const table = assembleRecordTypes([
      derived('https://example.org/a#Widget', 'Widget'),
      derived('https://example.org/b#Sprocket', 'Sprocket'),
    ]);

    expect([...table.contestedNames.keys()]).toEqual([]);
    expect(table.recordTypeFor('Widget')?.rdfTypeUri).toBe('https://example.org/a#Widget');
    expect(table.recordTypeFor('Sprocket')?.rdfTypeUri).toBe('https://example.org/b#Sprocket');
  });

  it('reports a collision between an alias and a name', () => {
    // `INPUT_ALIASES` is hand-written and the derived names are not, so the
    // hazard is real: a class arriving upstream under a name this SDK already
    // accepts as an alias for something else.
    const table = assembleRecordTypes([
      derived('https://example.org/a#ProcedureRecord', 'ProcedureRecord'),
      derived(`${clinical}Procedure`, 'Procedure'),
    ]);

    expect(() => table.recordTypeFor('ProcedureRecord')).toThrow(/"ProcedureRecord"/);
    // The OTHER name of the same record type still answers. A contested alias
    // costs that one spelling, not the type.
    expect(table.recordTypeFor('Procedure')?.rdfTypeUri).toBe(`${clinical}Procedure`);
  });

  it('refuses a class two record types would read back as, and nothing else', () => {
    // The class direction, deferred on the same terms. Two record types
    // accepting one class IRI is the `BY_CLASS` conflict that used to throw at
    // module evaluation.
    const table = assembleRecordTypes([
      { iri: 'https://example.org/a#Widget', name: 'Widget', localName: 'Widget', supersedes: ['https://example.org/x#Old'] },
      { iri: 'https://example.org/b#Sprocket', name: 'Sprocket', localName: 'Sprocket', supersedes: ['https://example.org/x#Old'] },
    ]);

    expect([...table.contestedClasses.keys()]).toEqual(['https://example.org/x#Old']);
    expect(() => table.recordTypeForClass('https://example.org/x#Old'))
      .toThrow(/Widget and Sprocket/);
    expect(table.recordTypeForClass('https://example.org/a#Widget')?.name).toBe('Widget');
  });
});

describe('the module survives its own epic', () => {
  it('imports nothing but itself and the generated spec data', () => {
    // #87 deletes `src/terms/`, `src/serializer/`, `src/deserializer/`,
    // `src/validator/`, `src/vocabularies/` and `src/jsonld/`. This directory is
    // not on that list and must not be, because the public API takes names and
    // the engine takes class IRIs — something has to translate, permanently.
    //
    // It imported `NAMESPACES` and `DEPRECATED_TYPE_ALIASES` from
    // `src/vocabularies/` until the classes were derived, which would have made
    // it break at Phase 9 and be discovered there. Both are gone; this is what
    // keeps them gone.
    //
    // `../spec/derived/` IS PERMITTED, and it is the one exception the stated
    // rule always meant to allow. The derived table is not a sibling module
    // with its own opinions — it is `scripts/build-record-types.mjs`'s output,
    // rebuilt from the spec checkout on every `npm run generate` and gitignored
    // precisely so it cannot fall behind. It is what Phase 9 KEEPS: the epic
    // deletes the six hand-written directories in favour of reading spec, and
    // this is the reading. The table lived in this directory as a committed
    // file until every generated artefact was moved under `src/spec/` and
    // ignored, so "nothing outside itself" was a statement about where the
    // build happened to write, not about what this module depends on.
    const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/record-types');

    const outward = readdirSync(dir)
      .filter((file) => file.endsWith('.ts'))
      .flatMap((file) => [...readFileSync(join(dir, file), 'utf-8')
        .matchAll(/from '([^']+)'/g)]
        .map((match) => `${file} -> ${match[1]}`)
        .filter((line) => !line.includes('-> ./') && !line.includes('-> ../spec/derived/')));

    expect(
      outward,
      'src/record-types/ must import nothing but itself and ../spec/derived/. Phase 9 (#87) '
      + 'deletes six sibling directories, and a module that imports one of them does not '
      + 'survive the epic it was built for.',
    ).toEqual([]);
  });
});

describe('the assembly survives the upstream fix its overrides wait for', () => {
  it('does not repeat a class the derived table and an override both supersede', () => {
    // `SUPERSEDES_OVERRIDES` exists because spec has not yet stated
    // `clinical:CoverageRecord rdfs:seeAlso coverage:InsurancePlan`
    // (`jayostis/spec#50` gap 2). When that triple lands,
    // `scripts/build-record-types.mjs` puts the class into `supersedes` AND the
    // override still adds it — so `acceptedClassUris` would hold it twice, the
    // class index would call it contested, and `recordTypeForClass` would
    // refuse to answer for it, describing a conflict between a record type and
    // itself.
    const [deprecated, superseding] = Object.entries(SUPERSEDES_OVERRIDES)[0];

    const table = assembleRecordTypes([{
      iri: superseding,
      name: 'InsurancePlan',
      localName: 'InsurancePlan',
      supersedes: [deprecated],
    }]);

    const [assembled] = table.recordTypes;

    expect(new Set(assembled.acceptedClassUris).size).toBe(assembled.acceptedClassUris.length);
    expect(table.contestedClasses.size).toBe(0);
    expect(table.recordTypeForClass(deprecated)?.name).toBe('InsurancePlan');
  });
});
