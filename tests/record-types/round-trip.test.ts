/**
 * A record comes back spelled the way it went in.
 *
 * Asserted separately from `recordTypeForClass` in `module.test.ts`, and the
 * separation is the point: the record-type module can be entirely right while
 * the deserializer still consults its own private reverse map. This is the
 * user-visible form — `serialize()` in, `deserializeOne()` out, through the
 * public API only.
 *
 * RED before `src/record-types/` was wired into the deserializer: `proc-001`
 * went in as `Procedure` and came back as `ProcedureRecord`, a spelling
 * `src/models/procedure.ts` does not declare, nothing exports, and no fixture
 * uses.
 */

import { describe, it, expect } from 'vitest';

import { deserializeOne } from '../../src/deserializer/turtle-parser.js';
import { fromJsonLd, toJsonLd } from '../../src/jsonld/converter.js';
import { serialize } from '../../src/serializer/turtle-serializer.js';
import type { CascadeRecord } from '../../src/models/common.js';
import { allRecordTypes } from '../../src/record-types/index.js';
import { loadCascadeRecordFixture } from '../support/fixtures.js';
import { NAMESPACES } from '../../src/vocabularies/namespaces.js';

describe('a record round-trips its own type spelling', () => {
  it('proc-001 goes in as Procedure and comes back as Procedure', () => {
    const { input } = loadCascadeRecordFixture('proc-001');

    expect(input.type, 'the fixture is what makes this a real defect').toBe('Procedure');

    const back = deserializeOne<CascadeRecord>(serialize(input), 'Procedure');

    expect(back?.type).toBe('Procedure');
  });

  it('reads back under the alias too, still spelled canonically', () => {
    // `deserialize(ttl, 'ProcedureRecord')` must find the same subjects — the
    // alias is accepted on input — and must still return the canonical name.
    // Asking under one spelling and being answered in another is what a caller
    // cannot write a branch for.
    const { input } = loadCascadeRecordFixture('proc-001');
    const back = deserializeOne<CascadeRecord>(serialize(input), 'ProcedureRecord');

    expect(back).not.toBeNull();
    expect(back?.type).toBe('Procedure');
  });

  it('med-001 keeps MedicationRecord, the collision that was already right', () => {
    // The control. `medications` carries two names as well, and its ordering
    // happened to agree with the model — so a fix that changed every collision
    // would break this one, and only a test that names it would say so.
    const { input } = loadCascadeRecordFixture('med-001');

    expect(input.type).toBe('MedicationRecord');
    expect(deserializeOne<CascadeRecord>(serialize(input), 'MedicationRecord')?.type)
      .toBe('MedicationRecord');
  });

  it('answers under every alias the table declares', () => {
    // The general form. Every alias must reach the same record type as its
    // canonical name through the DESERIALIZER, not merely through the module.
    for (const recordType of allRecordTypes()) {
      for (const alias of recordType.aliases) {
        const turtle = `<https://example.org/x> a <${recordType.rdfTypeUri}> .`;

        expect(
          deserializeOne<CascadeRecord>(turtle, alias)?.type,
          `${alias} should read back as ${recordType.name}`,
        ).toBe(recordType.name);
      }
    }
  });
});

describe('the JSON-LD reader agrees with the Turtle one', () => {
  // Two readers that disagree is worse than two that are wrong the same way:
  // `fromJsonLd` had the SAME first-entry defect, in its own copy of the scan,
  // so fixing one alone would have made a record's type depend on which
  // format it arrived in.
  it('proc-001 keeps Procedure through JSON-LD', () => {
    const { input } = loadCascadeRecordFixture('proc-001');

    expect(fromJsonLd<CascadeRecord>(toJsonLd(input)).type).toBe('Procedure');
  });

  it('reads a full IRI @type as well as the CURIE it writes', () => {
    // `toJsonLd` writes a CURIE; a document from anywhere else may carry the
    // expanded IRI, and both name the same class.
    for (const rdfType of ['clinical:Procedure', `${NAMESPACES.clinical}Procedure`]) {
      expect(fromJsonLd<CascadeRecord>({ '@type': rdfType }).type).toBe('Procedure');
    }
  });

  it('tells the two SocialHistoryRecord classes apart', () => {
    // The old scan compared LOCAL NAMES, so these two were one string to it
    // and whichever was written first won. They are different classes with
    // different consent scopes and different pod paths.
    expect(fromJsonLd<CascadeRecord>({ '@type': 'health:SocialHistoryRecord' }).type)
      .toBe('SocialHistoryRecord');
    expect(fromJsonLd<CascadeRecord>({ '@type': 'clinical:SocialHistoryRecord' }).type)
      .toBe('ClinicalSocialHistoryRecord');
  });

  it('leaves an unregistered class as its local name rather than refusing', () => {
    // Reading is faithful. A class this SDK has no model for is a record it
    // cannot type, not a document to reject.
    expect(fromJsonLd<CascadeRecord>({ '@type': 'clinical:NotAClass' }).type)
      .toBe('NotAClass');
  });
});
