/**
 * core v3.8 / health v2.8 / clinical v1.16 / coverage v1.5 — the 2026-08-27
 * wave-4 vocabulary release. 24 new terms, plus cascade:PatientReported from
 * the core v3.7 -> v3.8 bump, which adds no term this release models.
 *
 * Every term here comes from a field-coverage measurement against real FHIR R4
 * exports: each one is a source element a conformant server sends and the
 * vocabulary had nowhere to put, so an importer dropped it. The assertions
 * below are therefore written against what is actually EMITTED and what comes
 * BACK, not against the registration tables alone — a predicate present in
 * `PROPERTY_PREDICATES` and absent from the serializer's output is exactly the
 * silent loss this release exists to close.
 *
 * Two structural rulings are load-bearing and are pinned here because they pull
 * in opposite directions:
 *
 * 1. `clinical:EncounterParticipant` is an INLINE BLANK NODE.
 *    `clinical:EncounterParticipantShape` deliberately omits
 *    `sh:nodeKind sh:IRI` — "requiring an IRI would forbid the blank node a
 *    serializer may reasonably write for a structural sub-node".
 * 2. `cascade:Attachment` is a SUBJECT WITH ITS OWN IRI.
 *    `cascade:HasAttachmentEdgeShape` DOES declare `sh:nodeKind sh:IRI`, so
 *    that a record and its attachment can live in different files. A blank node
 *    would fail that shape.
 *
 * health v2.8 is SHACL-only (two health: record shapes gain value sets for a
 * status their records already carry) and adds no term for this SDK to model;
 * its row moves because the version number moved.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { serialize } from '../src/serializer/turtle-serializer.js';
import { deserialize, nextBlankNodeId } from '../src/deserializer/turtle-parser.js';
import { getContext } from '../src/jsonld/context.js';
import { validate } from '../src/validator/validator.js';
import {
  PROPERTY_PREDICATES,
  TYPE_MAPPING,
  TYPE_TO_MAPPING_KEY,
} from '../src/vocabularies/namespaces.js';
import type { CascadeRecord } from '../src/models/common.js';
import type { Encounter, EncounterParticipant } from '../src/models/encounter.js';
import type { Attachment } from '../src/models/attachment.js';
import type { Coverage } from '../src/models/coverage.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** The term map inside the generated context wrapper. */
function contextTerms(): Record<string, unknown> {
  const wrapper = getContext() as { '@context': Record<string, unknown> };
  return wrapper['@context'];
}

// ─── 1. Term census ─────────────────────────────────────────────────────────

/**
 * The 21 new PROPERTIES, spelled as the ontology spells them. The other three
 * of the release's 24 terms are the two new CLASSES (asserted against
 * TYPE_MAPPING below) and `coverage:status`, which cannot live in
 * PROPERTY_PREDICATES because the `status` key is already taken by
 * `health:status`; it is selected by record type instead.
 */
const NEW_PROPERTY_PREDICATES: Record<string, string> = {
  // clinical v1.16 — encounter (8 of the 9; hasParticipant's class is separate)
  encounterClassDisplay: 'clinical:encounterClassDisplay',
  encounterClassSystem: 'clinical:encounterClassSystem',
  encounterReason: 'clinical:encounterReason',
  admitSource: 'clinical:admitSource',
  dischargeDisposition: 'clinical:dischargeDisposition',
  hasParticipant: 'clinical:hasParticipant',
  participantName: 'clinical:participantName',
  participantRole: 'clinical:participantRole',
  participantRoleCode: 'clinical:participantRoleCode',
  participantSpecialty: 'clinical:participantSpecialty',
  // clinical v1.16 — identity
  businessIdentifier: 'clinical:businessIdentifier',
  // clinical v1.16 — documents
  documentReferenceStatus: 'clinical:documentReferenceStatus',
  documentAuthorName: 'clinical:documentAuthorName',
  authenticatorName: 'clinical:authenticatorName',
  // core v3.7 — attachments
  hasAttachment: 'cascade:hasAttachment',
  attachmentPath: 'cascade:attachmentPath',
  attachmentMediaType: 'cascade:attachmentMediaType',
  contentHash: 'cascade:contentHash',
  hashAlgorithm: 'cascade:hashAlgorithm',
  byteSize: 'cascade:byteSize',
  attachmentTitle: 'cascade:attachmentTitle',
};

describe('wave-4 term census', () => {
  it('registers all 21 new properties under the exact ontology spelling', () => {
    for (const [key, curie] of Object.entries(NEW_PROPERTY_PREDICATES)) {
      expect(PROPERTY_PREDICATES[key], `PROPERTY_PREDICATES.${key}`).toBe(curie);
    }
  });

  it('counts 21 new properties, so a dropped term fails rather than passes quietly', () => {
    expect(Object.keys(NEW_PROPERTY_PREDICATES)).toHaveLength(21);
  });

  it('registers the two new classes with the rdfType from the TTL', () => {
    expect(TYPE_MAPPING['encounter-participants']?.rdfType).toBe('clinical:EncounterParticipant');
    expect(TYPE_MAPPING['attachments']?.rdfType).toBe('cascade:Attachment');
    expect(TYPE_TO_MAPPING_KEY['EncounterParticipant']).toBe('encounter-participants');
    expect(TYPE_TO_MAPPING_KEY['Attachment']).toBe('attachments');
  });

  it('carries every new property and both classes in the JSON-LD context', () => {
    const terms = contextTerms();
    for (const [key, curie] of Object.entries(NEW_PROPERTY_PREDICATES)) {
      const entry = terms[key];
      const id = typeof entry === 'string' ? entry : (entry as { '@id': string })?.['@id'];
      expect(id, `context term ${key}`).toBe(curie);
    }
    expect(terms['Attachment']).toBe('cascade:Attachment');
    expect(terms['EncounterParticipant']).toBe('clinical:EncounterParticipant');
  });

  /** A minimal valid record, used to vary only dataProvenance. */
  function baseCondition(): CascadeRecord {
    return {
      id: 'urn:uuid:99999999-9999-4999-8999-999999999999',
      type: 'ConditionRecord',
      conditionName: 'Migraine',
      schemaVersion: '1.3',
    } as unknown as CascadeRecord;
  }

  it('accepts cascade:PatientReported as a provenance value (core v3.8)', () => {
    // Two hardcoded sets carry provenance in this package and they fail
    // differently: the ProvenanceType union fails at COMPILE time, while
    // VALID_PROVENANCE_TYPES in the validator fails at RUNTIME by rejecting the
    // record. A row bumped without the second would leave this SDK refusing a
    // value a producer is entitled to write, so the validator is what is
    // asserted here rather than the type.
    const rec = { ...baseCondition(), dataProvenance: 'PatientReported' } as CascadeRecord;

    const result = validate(rec);
    expect(result.errors.filter((e) => e.field === 'dataProvenance')).toEqual([]);
    expect(serialize(rec)).toContain('cascade:dataProvenance cascade:PatientReported');
    expect(
      deserialize<CascadeRecord>(serialize(rec), 'ConditionRecord')[0]?.dataProvenance,
    ).toBe('PatientReported');
  });

  it('keeps PatientReported and SelfReported as two distinct values', () => {
    // They differ on WHO KEYED IT IN, not on who it came from: SelfReported is
    // the patient entering data directly, PatientReported is their own account
    // recorded by another party or system, which may have summarized or
    // mis-transcribed it. Collapsing either onto the other would destroy the
    // distinction a consumer needs to weigh how directly a claim is attested,
    // so neither is aliased to the other on read.
    const asPatient = { ...baseCondition(), dataProvenance: 'PatientReported' };
    const asSelf = { ...baseCondition(), dataProvenance: 'SelfReported' };

    expect(serialize(asPatient)).toContain('cascade:dataProvenance cascade:PatientReported');
    expect(serialize(asSelf)).toContain('cascade:dataProvenance cascade:SelfReported');

    expect(
      deserialize<CascadeRecord>(serialize(asPatient), 'ConditionRecord')[0]?.dataProvenance,
    ).toBe('PatientReported');
    expect(
      deserialize<CascadeRecord>(serialize(asSelf), 'ConditionRecord')[0]?.dataProvenance,
    ).toBe('SelfReported');

    // Both valid; neither is a fallback for the other.
    expect(validate(asPatient).errors.filter((e) => e.field === 'dataProvenance')).toEqual([]);
    expect(validate(asSelf).errors.filter((e) => e.field === 'dataProvenance')).toEqual([]);
  });

  it('bumps VOCAB_VERSIONS to the four released rows', () => {
    // Read from this repo's own file, never from a spec sibling: this package's
    // CI checks out no spec checkout, and a test that skipped itself when its
    // input was missing would report green while proving nothing.
    // Split on \r?\n, not \n: git checks this file out with CRLF wherever
    // core.autocrlf is on, which is the default on Windows, and splitting on \n
    // alone leaves a trailing \r on every row so `core=3.8` never matches.
    const rows = readFileSync(resolve(__dirname, '../VOCAB_VERSIONS'), 'utf-8')
      .split(/\r?\n/)
      .filter((line) => /^[a-z]+=/.test(line));
    expect(rows).toContain('core=3.8');
    expect(rows).toContain('health=2.8');
    expect(rows).toContain('clinical=1.16');
    expect(rows).toContain('coverage=1.5');
  });
});

// ─── 2. Encounter: the eight flat encounter facts ───────────────────────────

const ENCOUNTER_ID = 'urn:uuid:11111111-1111-4111-8111-111111111111';

function fullEncounter(): Encounter {
  return {
    id: ENCOUNTER_ID,
    type: 'Encounter',
    encounterType: 'Endocrinology office visit',
    // A LOCAL class code, which is the case the display and system exist for.
    encounterClass: '5',
    encounterClassDisplay: 'Ambulatory Visit',
    encounterClassSystem: 'urn:oid:2.16.840.1.113883.3.42',
    encounterReason: ['Type 2 diabetes follow-up', 'Medication review'],
    admitSource: 'Physician referral',
    dischargeDisposition: 'Home or Self Care',
    dataProvenance: 'ClinicalGenerated',
    schemaVersion: '1.3',
  };
}

describe('encounter facts (clinical v1.16)', () => {
  it('writes the class code, display and system as three separate triples', () => {
    const turtle = serialize(fullEncounter());
    // The CODE stays: it is what a round-trip export must restore.
    expect(turtle).toContain('clinical:encounterClass "5"');
    expect(turtle).toContain('clinical:encounterClassDisplay "Ambulatory Visit"');
    expect(turtle).toContain(
      'clinical:encounterClassSystem "urn:oid:2.16.840.1.113883.3.42"',
    );
  });

  it('writes encounterClassSystem as a plain literal, not an IRI node', () => {
    // The ontology ranges it xsd:anyURI, but clinical:EncounterShape accepts
    // anyURI OR string via sh:or, "because serializers differ on which of the
    // two they write for a URI-valued literal". A bare <...> node would not be
    // a literal at all and would fail both branches.
    const turtle = serialize(fullEncounter());
    expect(turtle).not.toContain(
      'clinical:encounterClassSystem <urn:oid:2.16.840.1.113883.3.42>',
    );
  });

  it('writes the admission signals that were unrecoverable through v1.15', () => {
    const turtle = serialize(fullEncounter());
    expect(turtle).toContain('clinical:admitSource "Physician referral"');
    expect(turtle).toContain('clinical:dischargeDisposition "Home or Self Care"');
  });

  it('repeats encounterReason once per value, never as an rdf:List', () => {
    const turtle = serialize(fullEncounter());
    expect(turtle).toContain('clinical:encounterReason "Type 2 diabetes follow-up"');
    expect(turtle).toContain('clinical:encounterReason "Medication review"');
    expect(turtle).not.toContain('clinical:encounterReason (');
  });

  it('round-trips every flat encounter fact', () => {
    const back = deserialize<Encounter>(serialize(fullEncounter()), 'Encounter')[0];
    expect(back).toBeDefined();
    expect(back?.encounterClass).toBe('5');
    expect(back?.encounterClassDisplay).toBe('Ambulatory Visit');
    expect(back?.encounterClassSystem).toBe('urn:oid:2.16.840.1.113883.3.42');
    expect(back?.admitSource).toBe('Physician referral');
    expect(back?.dischargeDisposition).toBe('Home or Self Care');
    expect(back?.encounterReason).toEqual([
      'Type 2 diabetes follow-up',
      'Medication review',
    ]);
  });

  it('preserves the arity of a single encounterReason as a bare string', () => {
    const one: Encounter = { ...fullEncounter(), encounterReason: 'Annual physical' };
    const back = deserialize<Encounter>(serialize(one), 'Encounter')[0];
    expect(back?.encounterReason).toBe('Annual physical');
  });
});

// ─── 3. EncounterParticipant: the inline blank-node sub-node ────────────────

const TWO_PARTICIPANTS: EncounterParticipant[] = [
  {
    participantName: 'Dr. Alice Reyes',
    participantRole: 'attender',
    participantRoleCode: ['ATND', 'PPRF'],
    participantSpecialty: 'Endocrinology',
  },
  {
    participantName: 'Dr. Ben Okafor',
    participantRole: 'referrer',
    participantRoleCode: 'REF',
  },
];

function encounterWithParticipants(
  hasParticipant: EncounterParticipant[] = TWO_PARTICIPANTS,
): Encounter {
  return { ...fullEncounter(), hasParticipant };
}

describe('encounter participations (clinical v1.16)', () => {
  it('writes each participation as a typed inline blank node', () => {
    const turtle = serialize(encounterWithParticipants());
    expect(turtle).toContain('clinical:hasParticipant [');
    expect(turtle).toContain('a clinical:EncounterParticipant');
    // Blank node, NOT an IRI: the shape omits sh:nodeKind sh:IRI precisely so a
    // serializer may write one for a structural sub-node.
    expect(turtle).not.toMatch(/clinical:hasParticipant\s+</);
  });

  it('qualifies the nested predicates with clinical:, not cascade:', () => {
    // The blank-node writer used to hardcode `cascade:${key}`, which was right
    // only because every sub-node it had ever seen was a cascade: one.
    const turtle = serialize(encounterWithParticipants());
    expect(turtle).toContain('clinical:participantName "Dr. Alice Reyes"');
    expect(turtle).toContain('clinical:participantRole "attender"');
    expect(turtle).toContain('clinical:participantSpecialty "Endocrinology"');
    expect(turtle).not.toContain('cascade:participantName');
  });

  it('writes TWO participations, not one', () => {
    // The whole point of the class: a visit routinely carries an attender and a
    // referrer at once, and a scheme that keeps one drops the other.
    const turtle = serialize(encounterWithParticipants());
    expect(turtle.match(/a clinical:EncounterParticipant/g)).toHaveLength(2);
    expect(turtle).toContain('"Dr. Alice Reyes"');
    expect(turtle).toContain('"Dr. Ben Okafor"');
  });

  it('repeats participantRoleCode inside a participation', () => {
    const turtle = serialize(encounterWithParticipants());
    expect(turtle).toContain('clinical:participantRoleCode "ATND"');
    expect(turtle).toContain('clinical:participantRoleCode "PPRF"');
  });

  it('rebuilds every participation on read, with roles attached to the right name', () => {
    const back = deserialize<Encounter>(
      serialize(encounterWithParticipants()),
      'Encounter',
    )[0];
    expect(back?.hasParticipant).toHaveLength(2);
    // toEqual, not toBe: the reader assigns 0..* fields last, so key ORDER
    // differs from the input while the content does not.
    expect(back?.hasParticipant?.[0]).toEqual({
      participantName: 'Dr. Alice Reyes',
      participantRole: 'attender',
      participantSpecialty: 'Endocrinology',
      participantRoleCode: ['ATND', 'PPRF'],
    });
    expect(back?.hasParticipant?.[1]).toEqual({
      participantName: 'Dr. Ben Okafor',
      participantRole: 'referrer',
      participantRoleCode: 'REF',
    });
  });

  it('keeps two participations in the SAME role distinct', () => {
    // This is the case the rejected flat-predicate design could not represent
    // at all, so it is the one worth proving.
    const sameRole: EncounterParticipant[] = [
      { participantName: 'Dr. First', participantRole: 'consultant' },
      { participantName: 'Dr. Second', participantRole: 'consultant' },
    ];
    const back = deserialize<Encounter>(
      serialize(encounterWithParticipants(sameRole)),
      'Encounter',
    )[0];
    expect(back?.hasParticipant).toEqual(sameRole);
  });

  it('does not merge participations when many blank nodes are parsed at once', () => {
    // Blank-node labels were minted from Date.now() plus four random base-36
    // characters, which collide for nodes created in the same millisecond. With
    // one summary per manifest that was survivable; with N participations per
    // encounter a collision silently attributes one clinician's role to
    // another's name. Six participations, parsed together, must stay six.
    const many: EncounterParticipant[] = Array.from({ length: 6 }, (_, i) => ({
      participantName: `Dr. Number ${i}`,
      participantRole: `role-${i}`,
    }));
    const back = deserialize<Encounter>(
      serialize(encounterWithParticipants(many)),
      'Encounter',
    )[0];
    expect(back?.hasParticipant).toHaveLength(6);
    expect(back?.hasParticipant).toEqual(many);
  });

  it('mints blank-node labels from a counter, not from a clock plus RNG', () => {
    // Asserted on the minter directly, because the labels never reach a caller
    // and the scheme they replaced fails only PROBABILISTICALLY: an assertion
    // routed through deserialize() would be a flake, not a tripwire, and the
    // six-participation test above stays green under the old scheme.
    //
    // Old scheme: `_:b${Date.now()}${Math.random().toString(36).slice(2, 6)}`.
    // Two labels minted in the same millisecond collide whenever their four
    // random characters agree, and a collision here merges two participations,
    // silently attributing one clinician's role to another's name.
    const first = nextBlankNodeId();
    const second = nextBlankNodeId();
    expect(first).toMatch(/^_:b\d+$/);
    expect(second).toMatch(/^_:b\d+$/);
    // Strictly consecutive: no clock-plus-RNG scheme produces this.
    expect(Number(second.slice(3))).toBe(Number(first.slice(3)) + 1);
  });

  it('never repeats a label across many allocations', () => {
    const labels = new Set(Array.from({ length: 5000 }, () => nextBlankNodeId()));
    expect(labels.size).toBe(5000);
  });

  it('accepts a participation carrying only a role, per the shape', () => {
    // FHIR makes every sub-element of Encounter.participant optional, so the
    // shape asserts no sh:minCount on any field. A reader that required a name
    // would fail conformant source data.
    const roleOnly: EncounterParticipant[] = [{ participantRole: 'admitter' }];
    const back = deserialize<Encounter>(
      serialize(encounterWithParticipants(roleOnly)),
      'Encounter',
    )[0];
    expect(back?.hasParticipant).toEqual(roleOnly);
  });

  it('preserves a local role code, which an extensible binding permits', () => {
    const local: EncounterParticipant[] = [
      { participantName: 'Dr. Local', participantRoleCode: 'LOCAL-ROLE-42' },
    ];
    const turtle = serialize(encounterWithParticipants(local));
    expect(turtle).toContain('clinical:participantRoleCode "LOCAL-ROLE-42"');
  });

  it('gives hasParticipant a @set container and no @id coercion', () => {
    // @type: @id would coerce the value to an IRI reference, which would
    // misread the embedded blank node this edge actually carries.
    expect(contextTerms()['hasParticipant']).toEqual({
      '@id': 'clinical:hasParticipant',
      '@container': '@set',
    });
  });
});

// ─── 4. businessIdentifier: the id space that does not join sourceRecordId ──

describe('businessIdentifier (clinical v1.16)', () => {
  it('writes one triple per identifier, with no maximum', () => {
    const enc: Encounter = {
      ...fullEncounter(),
      businessIdentifier: ['http://hospital.example/visits|VN-88213', 'ACC-7781'],
    };
    const turtle = serialize(enc);
    expect(turtle).toContain(
      'clinical:businessIdentifier "http://hospital.example/visits|VN-88213"',
    );
    expect(turtle).toContain('clinical:businessIdentifier "ACC-7781"');
  });

  it('preserves the FHIR token form verbatim, pipe and all', () => {
    // "{system}|{value}" is the ratified way to write a system-qualified
    // identifier as one string. This SDK stores it and does NOT split, parse or
    // validate it — and must not invent a system for the bare form.
    const enc: Encounter = {
      ...fullEncounter(),
      businessIdentifier: 'urn:oid:1.2.840.114350|E-1099',
    };
    const back = deserialize<Encounter>(serialize(enc), 'Encounter')[0];
    expect(back?.businessIdentifier).toBe('urn:oid:1.2.840.114350|E-1099');
  });

  it('stays a separate predicate from sourceRecordId', () => {
    // The two id spaces do not join: one system's logical id for a visit and
    // another's business identifier for it are different strings, and the same
    // string in the two spaces means nothing in common.
    const enc: Encounter = {
      ...fullEncounter(),
      sourceRecordId: 'abc-123-logical',
      businessIdentifier: 'VN-88213',
    };
    const turtle = serialize(enc);
    expect(turtle).toContain('health:sourceRecordId "abc-123-logical"');
    expect(turtle).toContain('clinical:businessIdentifier "VN-88213"');

    const back = deserialize<Encounter>(turtle, 'Encounter')[0];
    expect(back?.sourceRecordId).toBe('abc-123-logical');
    expect(back?.businessIdentifier).toBe('VN-88213');
  });

  it('is domain-free: it round-trips on a record that is not an encounter', () => {
    // The vocabulary deliberately declares NO rdfs:domain, because .identifier
    // exists on every FHIR resource.
    const cond = {
      id: 'urn:uuid:33333333-3333-4333-8333-333333333333',
      type: 'ConditionRecord',
      conditionName: 'Type 2 diabetes mellitus',
      businessIdentifier: ['MRN-SYS|C-4412'],
      dataProvenance: 'ClinicalGenerated',
      schemaVersion: '1.3',
    } as unknown as CascadeRecord;
    const back = deserialize<CascadeRecord>(serialize(cond), 'ConditionRecord')[0];
    expect(back?.businessIdentifier).toBe('MRN-SYS|C-4412');
  });
});

// ─── 5. Document status, authorship and attestation ─────────────────────────

describe('document terms (clinical v1.16)', () => {
  // PREDICATES ONLY. This SDK models no clinical:ClinicalDocument class, so
  // there is no model to hang these on — the same position core v3.4's
  // device-source terms are in. Registration is still what makes them survive a
  // round trip instead of being dropped, so that is what is asserted.
  it('round-trips all three on a record that carries them', () => {
    const doc = {
      id: 'urn:uuid:44444444-4444-4444-8444-444444444444',
      type: 'Encounter',
      encounterType: 'Discharge summary filing',
      documentReferenceStatus: 'superseded',
      documentAuthorName: ['Dr. Resident Author', 'Dr. Attending Author'],
      authenticatorName: 'Dr. Attending Signer',
      dataProvenance: 'ClinicalGenerated',
      schemaVersion: '1.3',
    } as unknown as CascadeRecord;

    const turtle = serialize(doc);
    expect(turtle).toContain('clinical:documentReferenceStatus "superseded"');
    expect(turtle).toContain('clinical:authenticatorName "Dr. Attending Signer"');

    const back = deserialize<Record<string, unknown>>(turtle, 'Encounter')[0] as
      | Record<string, unknown>
      | undefined;
    expect(back?.['documentReferenceStatus']).toBe('superseded');
    expect(back?.['authenticatorName']).toBe('Dr. Attending Signer');
  });

  it('keeps EVERY author, which providerName maxCount 1 had been discarding', () => {
    const doc = {
      id: 'urn:uuid:55555555-5555-4555-8555-555555555555',
      type: 'Encounter',
      encounterType: 'Co-signed progress note',
      providerName: 'Dr. Resident Author',
      documentAuthorName: ['Dr. Resident Author', 'Dr. Attending Author'],
      dataProvenance: 'ClinicalGenerated',
      schemaVersion: '1.3',
    } as unknown as CascadeRecord;

    const turtle = serialize(doc);
    expect(turtle).toContain('clinical:documentAuthorName "Dr. Resident Author"');
    expect(turtle).toContain('clinical:documentAuthorName "Dr. Attending Author"');
    // providerName is retained and unchanged as the single display name.
    expect(turtle).toContain('clinical:providerName "Dr. Resident Author"');

    const back = deserialize<Record<string, unknown>>(turtle, 'Encounter')[0] as
      | Record<string, unknown>
      | undefined;
    expect(back?.['documentAuthorName']).toEqual([
      'Dr. Resident Author',
      'Dr. Attending Author',
    ]);
  });

  it('does not share a predicate with clinical:status', () => {
    // "entered-in-error" is in BOTH value sets and means different things in
    // each, which is the reason these cannot be folded together.
    expect(PROPERTY_PREDICATES['documentReferenceStatus']).toBe(
      'clinical:documentReferenceStatus',
    );
    expect(PROPERTY_PREDICATES['documentReferenceStatus']).not.toBe(
      PROPERTY_PREDICATES['isActive'],
    );
  });
});

// ─── 6. Attachment: a subject with an IRI, not a sub-node ───────────────────

const ATTACHMENT_ID = 'urn:uuid:aaaaaaaa-0000-4000-8000-000000000001';

function attachment(): Attachment {
  return {
    id: ATTACHMENT_ID,
    type: 'Attachment',
    attachmentPath: 'attachments/sha-256/3f786850e387550fdab836ed7e6dc881de23001b',
    contentHash: '3f786850e387550fdab836ed7e6dc881de23001b',
    hashAlgorithm: 'sha-256',
    attachmentMediaType: 'application/pdf',
    byteSize: 148213,
    attachmentTitle: 'Endocrinology visit summary',
  };
}

describe('attachments (core v3.7)', () => {
  it('serializes as its own cascade:Attachment subject', () => {
    const turtle = serialize(attachment());
    expect(turtle).toContain(`<${ATTACHMENT_ID}> a cascade:Attachment`);
    expect(turtle).toContain(
      'cascade:attachmentPath "attachments/sha-256/3f786850e387550fdab836ed7e6dc881de23001b"',
    );
    expect(turtle).toContain(
      'cascade:contentHash "3f786850e387550fdab836ed7e6dc881de23001b"',
    );
    expect(turtle).toContain('cascade:hashAlgorithm "sha-256"');
    expect(turtle).toContain('cascade:attachmentMediaType "application/pdf"');
    expect(turtle).toContain('cascade:attachmentTitle "Endocrinology visit summary"');
  });

  it('types byteSize xsd:integer, as cascade:AttachmentShape requires', () => {
    expect(serialize(attachment())).toContain('cascade:byteSize "148213"^^xsd:integer');
  });

  it('reads byteSize back as a number, not a string', () => {
    const back = deserialize<Attachment>(serialize(attachment()), 'Attachment')[0];
    expect(back?.byteSize).toBe(148213);
  });

  it('round-trips every attachment field', () => {
    const back = deserialize<Attachment>(serialize(attachment()), 'Attachment')[0];
    expect(back?.attachmentPath).toBe(
      'attachments/sha-256/3f786850e387550fdab836ed7e6dc881de23001b',
    );
    expect(back?.contentHash).toBe('3f786850e387550fdab836ed7e6dc881de23001b');
    expect(back?.hashAlgorithm).toBe('sha-256');
    expect(back?.attachmentMediaType).toBe('application/pdf');
    expect(back?.attachmentTitle).toBe('Endocrinology visit summary');
  });

  it('writes hasAttachment as an IRI, never a literal or a blank node', () => {
    // cascade:HasAttachmentEdgeShape declares sh:nodeKind sh:IRI so that the
    // record and the attachment can live in different files. This is the exact
    // point on which core v3.7 and clinical v1.16 diverge: a participation may
    // be a blank node, an attachment may not.
    const enc: Encounter = { ...fullEncounter(), hasAttachment: [ATTACHMENT_ID] };
    const turtle = serialize(enc);
    expect(turtle).toContain(`cascade:hasAttachment <${ATTACHMENT_ID}>`);
    expect(turtle).not.toContain(`cascade:hasAttachment "${ATTACHMENT_ID}"`);
    expect(turtle).not.toMatch(/cascade:hasAttachment\s+\[/);
  });

  it('repeats the edge, because one report has a PDF and an HTML rendering', () => {
    const second = 'urn:uuid:aaaaaaaa-0000-4000-8000-000000000002';
    const enc: Encounter = {
      ...fullEncounter(),
      hasAttachment: [ATTACHMENT_ID, second],
    };
    const turtle = serialize(enc);
    expect(turtle).toContain(`cascade:hasAttachment <${ATTACHMENT_ID}>`);
    expect(turtle).toContain(`cascade:hasAttachment <${second}>`);

    const back = deserialize<Encounter>(turtle, 'Encounter')[0];
    expect(back?.hasAttachment).toEqual([ATTACHMENT_ID, second]);
  });

  it('writes a single bare IRI as a resource too', () => {
    const enc: Encounter = { ...fullEncounter(), hasAttachment: ATTACHMENT_ID };
    expect(serialize(enc)).toContain(`cascade:hasAttachment <${ATTACHMENT_ID}>`);
  });

  it('gives hasAttachment an @id-coerced @set in the context', () => {
    expect(contextTerms()['hasAttachment']).toEqual({
      '@id': 'cascade:hasAttachment',
      '@type': '@id',
      '@container': '@set',
    });
  });

  it('does not inline the bytes', () => {
    // FHIR permits Attachment.data (inline base64); Cascade takes Attachment.url
    // instead, because Turtle in a pod is parse-critical and read in full by
    // every consumer. There is no field here that could carry bytes.
    expect(PROPERTY_PREDICATES['attachmentData']).toBeUndefined();
    expect(serialize(attachment())).not.toContain('base64');
  });
});

// ─── 7. coverage:status ─────────────────────────────────────────────────────

function plan(): Coverage {
  return {
    id: 'urn:uuid:22222222-2222-4222-8222-222222222222',
    type: 'InsurancePlan',
    providerName: 'Meridian Health',
    status: 'cancelled',
    dataProvenance: 'SelfReported',
    schemaVersion: '1.3',
  };
}

describe('coverage:status (coverage v1.5)', () => {
  it('writes the coverage: spelling on an InsurancePlan', () => {
    const turtle = serialize(plan());
    expect(turtle).toContain('coverage:status "cancelled"');
    expect(turtle).not.toContain('health:status "cancelled"');
  });

  it('leaves a CoverageRecord on health:status', () => {
    // coverage:status has rdfs:domain coverage:InsurancePlan. Asserting it on a
    // subject typed clinical:CoverageRecord would entail, to a reasoner, that
    // the subject is an InsurancePlan, so the override is declared for the plan
    // type only.
    const rec = { ...plan(), type: 'CoverageRecord' } as Coverage;
    const turtle = serialize(rec);
    expect(turtle).toContain('health:status "cancelled"');
    expect(turtle).not.toContain('coverage:status');
  });

  it('reads coverage:status back into the status field', () => {
    const back = deserialize<Coverage>(serialize(plan()), 'InsurancePlan')[0];
    expect(back?.status).toBe('cancelled');
  });

  it('accepts each of the four fm-status codes at the type level', () => {
    for (const code of ['active', 'cancelled', 'draft', 'entered-in-error'] as const) {
      const value: Coverage['status'] = code;
      expect(value).toBe(code);
    }
  });

  it('rejects a value outside the required binding at the type level', () => {
    // @ts-expect-error coverage v1.5 binds Coverage.status REQUIRED and the
    // shape constrains the value at sh:Violation, so the union is closed —
    // unlike coverageType, which stays open because FHIR binds Coverage.type
    // extensibly. Meaningful only under tsconfig.typecheck.json: vitest does
    // not typecheck, and the build config excludes test files.
    const bad: Coverage['status'] = 'lapsed';
    expect(bad).toBe('lapsed');
  });

  it('KNOWN GAP: an InsurancePlan is still emitted as clinical:CoverageRecord', () => {
    // Pinned rather than fixed. TYPE_MAPPING resolves both 'InsurancePlan' and
    // 'CoverageRecord' to rdfType clinical:CoverageRecord, so this SDK cannot
    // emit a coverage:InsurancePlan subject at all, and coverage's own shapes —
    // which target coverage:InsurancePlan — never see these records.
    //
    // The consequence for THIS release is a one-way trip: the class is lost on
    // read, so re-serializing what comes back writes health:status instead of
    // coverage:status. Retargeting the class would change what every existing
    // InsurancePlan record serializes as, which is a migration, not a
    // vocabulary sync. Tracked in the root backlog.
    expect(TYPE_MAPPING['insurance']?.rdfType).toBe('clinical:CoverageRecord');
    const back = deserialize<Coverage>(serialize(plan()), 'InsurancePlan')[0];
    expect(back?.type).toBe('CoverageRecord');
    expect(serialize(back as Coverage)).toContain('health:status "cancelled"');
  });
});

// ─── 8. Nothing already shipped moved ───────────────────────────────────────

describe('wave-4 is additive', () => {
  it('leaves the existing summary blank nodes on cascade: predicates', () => {
    // The nested-predicate namespace became per-field in this release. The
    // pre-existing sub-structures must be unaffected: a `name` inside an
    // emergencyContact is cascade:name, while the top-level `name` is foaf:name,
    // so a blanket PROPERTY_PREDICATES lookup would have silently rewritten
    // output that has been stable since those sub-structures were introduced.
    const manifest = {
      id: 'urn:uuid:66666666-6666-4666-8666-666666666666',
      type: 'ExportManifest',
      title: 'Pod export',
      clinicalSummary: { domain: 'clinical', conditionCount: 4 },
    } as unknown as CascadeRecord;
    const turtle = serialize(manifest);
    expect(turtle).toContain('cascade:domain "clinical"');
    expect(turtle).toContain('cascade:conditionCount "4"^^xsd:integer');
    expect(turtle).not.toContain('clinical:domain');
  });

  it('still writes health:status for a condition', () => {
    const cond = {
      id: 'urn:uuid:77777777-7777-4777-8777-777777777777',
      type: 'ConditionRecord',
      conditionName: 'Hypertension',
      status: 'active',
      dataProvenance: 'ClinicalGenerated',
      schemaVersion: '1.3',
    } as unknown as CascadeRecord;
    expect(serialize(cond)).toContain('health:status "active"');
  });

  it('keeps the four pre-existing 0..* code fields arity-preserving', () => {
    const cond = {
      id: 'urn:uuid:88888888-8888-4888-8888-888888888888',
      type: 'ConditionRecord',
      conditionName: 'Hypertension',
      icd10Code: 'http://hl7.org/fhir/sid/icd-10-cm/I10',
      dataProvenance: 'ClinicalGenerated',
      schemaVersion: '1.3',
    } as unknown as CascadeRecord;
    const back = deserialize<Record<string, unknown>>(serialize(cond), 'ConditionRecord')[0] as
      | Record<string, unknown>
      | undefined;
    expect(back?.['icd10Code']).toBe('http://hl7.org/fhir/sid/icd-10-cm/I10');
  });
});
