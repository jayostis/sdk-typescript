/**
 * The generic writer, against the corpus it has to reproduce.
 *
 * `convertToRdf` reads nothing but `src/spec/derived/` and `src/record-types/`,
 * both generated from what spec publishes. No model, no term module, no
 * predicate table. This compares its output to a fixture's own
 * `expectedOutput.turtle` as GRAPHS, canonically — the fixtures were written
 * against the hand-rolled serializer, so agreement is the claim that the
 * published data says the same thing the code did.
 *
 * The thin slice this replaces reached 13 of 15 triples and stopped, on two
 * gaps in spec's contexts. Reading `rdfs:range` from the ontologies closes
 * both. That does not excuse the gaps — `jayostis/spec#46` and `#47` are filed
 * — it routes around them, using a fact spec has published all along.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import { convertToRdf, convertToTurtle } from '../../src/converter/to-rdf.js';
import { graphDifference, quadsFromTurtle } from '../support/graph.js';
import { loadFixture } from '../support/fixtures.js';
import { escapeTurtleString } from '../../src/serializer/turtle-builder.js';

const fixturesDir = resolve(
  dirname(fileURLToPath(import.meta.url)), '../../../conformance/fixtures',
);

/** The N-Triples this writer produces, as quads. */
const quadsOf = (record: object) =>
  quadsFromTurtle(convertToRdf(record as Record<string, unknown>));

describe('imm-001, end to end from spec data', () => {
  const fixture = loadFixture('imm-001');

  it('produces the same graph as the fixture', async () => {
    // The whole claim, in one assertion. Compared canonically rather than
    // textually: the writers differ in prefix use, statement order and literal
    // spelling, and none of that is a difference in what was said.
    expect(
      await graphDifference(quadsOf(fixture.input), quadsFromTurtle(fixture.expectedOutput.turtle)),
      'convertToRdf disagrees with imm-001. Every difference is a finding: either the published '
      + 'data says something other than what the hand-rolled serializer wrote, or this writer '
      + 'reads it wrongly.',
    ).toBeNull();
  });

  it('types administrationDate, which the context alone cannot', () => {
    // `jayostis/spec#46`. The context gives this key no `@type`, so a
    // context-only converter writes `"2024-10-15T10:00:00Z"` untyped and
    // `health:ImmunizationRecordShape` reports a Violation whose message says
    // "an untyped or xsd:string literal is not either type". The ontology
    // declares `rdfs:range xsd:dateTime`.
    expect(convertToRdf(fixture.input as Record<string, unknown>))
      .toContain('^^<http://www.w3.org/2001/XMLSchema#dateTime>');
  });

  it('resolves the bare dataProvenance token to an absolute IRI', () => {
    // `jayostis/spec#47`. No context declares `@vocab`, so `"ClinicalGenerated"`
    // under `"@type": "@id"` has no resolution rule and a context-only
    // converter emits a relative IRI, which `sh:in (cascade:ClinicalGenerated …)`
    // rejects. The predicate's range is a class whose subclasses are the
    // permitted values.
    expect(convertToRdf(fixture.input as Record<string, unknown>))
      .toContain('<https://ns.cascadeprotocol.org/core/v1#ClinicalGenerated>');
  });

  it('writes the rdf:type triple, from the record type rather than a parameter', () => {
    // The thin slice dropped this: it took its vocabulary as an argument read
    // off the fixture, so it never knew the class. `recordTypeFor` answers it.
    expect(convertToRdf(fixture.input as Record<string, unknown>))
      .toContain('<https://ns.cascadeprotocol.org/health/v1#ImmunizationRecord>');
  });
});

describe('every immunization fixture', () => {
  // The routed type has four fixtures, and one agreeing is not evidence that
  // the published data reproduces the corpus.
  const ids = ['imm-001', 'imm-002', 'imm-003'];

  it.each(ids)('%s produces the same graph as the fixture', async (id) => {
    const fixture = loadFixture(id);

    expect(
      await graphDifference(quadsOf(fixture.input), quadsFromTurtle(fixture.expectedOutput.turtle)),
    ).toBeNull();
  });

  it('reads four fixtures, not zero', () => {
    // Two empty graphs are isomorphic, so a loader returning nothing would make
    // every assertion above pass.
    for (const id of ids) {
      expect(quadsOf(loadFixture(id).input).length, id).toBeGreaterThan(5);
    }
  });
});

describe('what it refuses', () => {
  const immunization = {
    id: 'urn:uuid:test',
    type: 'ImmunizationRecord',
    schemaVersion: '1.3',
  };

  it('refuses a name no context publishes, and says the class is missing', () => {
    expect(() => convertToRdf({ ...immunization, type: 'NotARecordType' }))
      .toThrow(/No context spec publishes names it/);
  });

  it('refuses a published class that is not a record class, and says THAT instead', () => {
    // The two refusals had one message until the second was noticed to be
    // false: `cascade:Address` is named by `core.jsonld` and declared in
    // `core.ttl`, so "names no class spec declares" was untrue of it. What it
    // lacks is membership of the record population — a different situation
    // with a different remedy, and a reader sent to check their spelling would
    // find nothing wrong with it.
    expect(() => convertToRdf({ ...immunization, type: 'Address' }))
      .toThrow(/spec publishes the name but does not mark its class a record class/);
  });

  it('points the second refusal at the roster, not at the caller', () => {
    // Where a class SHOULD be a record and is not marked, the fix is upstream.
    // The message has to say so, or the reader concludes their record is wrong.
    expect(() => convertToRdf({ ...immunization, type: 'Address' }))
      .toThrow(/jayostis\/spec#50/);
  });

  it('refuses a key no context defines, naming the key', () => {
    // Writing a guessed predicate would put a triple in a pod that no shape can
    // judge — the vacuous pass, created by the writer rather than found by it.
    expect(() => convertToRdf({ ...immunization, notAKey: 'x' }))
      .toThrow(/No context entry for "notAKey"/);
  });

  it('refuses a provenance value that is not a member of the set', () => {
    expect(() => convertToRdf({ ...immunization, dataProvenance: 'MadeItUp' }))
      .toThrow(/Cannot express "dataProvenance"/);
  });

  it('writes every value of a repeated field, not the first', () => {
    // Faithful first, judged second. A writer that kept one would hand the
    // validator a record with nothing left to violate.
    const written = convertToRdf({ ...immunization, dataAbsentReason: ['not-asked', 'asked-unknown'] });

    expect(written).toContain('"not-asked"');
    expect(written).toContain('"asked-unknown"');
  });
});

describe('keys spec declares outside core and the record vocabulary', () => {
  const immunization = { id: 'urn:uuid:test', type: 'ImmunizationRecord', schemaVersion: '1.3' };

  it('writes businessIdentifier, which every record type may carry', () => {
    // Declared on `CascadeEntity` and legal on every record, but published in
    // the `clinical` context — not `core`, not `health`. Resolving against
    // `core ∪ {vocabulary}` alone turned a field the hand-rolled serializer has
    // always written into a hard failure the moment a type was routed.
    expect(convertToRdf({ ...immunization, businessIdentifier: 'biz-1' }))
      .toContain('<https://ns.cascadeprotocol.org/clinical/v1#businessIdentifier> "biz-1"');
  });

  it('still refuses a key whose predicate depends on which context is asked', () => {
    // `supplementName` is `checkup:supplementName` under one context and
    // `clinical:supplementName` under another, and neither `core` nor `health`
    // declares it. This is the case the per-vocabulary stack exists for: there
    // is no single answer, so writing one would be a guess.
    expect(() => convertToRdf({ ...immunization, supplementName: 'x' }))
      .toThrow(/supplementName/);
  });
});

describe('the subject IRI', () => {
  it('refuses a record with no id, rather than writing <>', () => {
    // `<>` is a relative IRI resolving to whatever base the consumer parses
    // with, so every id-less record collides — reaching the graph and
    // validating clean, which is what this module exists not to do.
    expect(() => convertToRdf({ type: 'ImmunizationRecord', vaccineName: 'X' }))
      .toThrow(/"id"/);
  });

  it('refuses an id that is not an IRI, naming id rather than the parser', () => {
    // Left to the vendored parser this surfaced as `Unexpected "<not" on line
    // 1`, which names neither the record nor the field.
    expect(() => convertToRdf({ id: 'not an iri', type: 'ImmunizationRecord', vaccineName: 'X' }))
      .toThrow(/"id"/);
  });
});

describe('IRI-valued fields accept any absolute IRI', () => {
  const immunization = { id: 'urn:uuid:test', type: 'ImmunizationRecord', schemaVersion: '1.3' };

  it('writes a urn: value under a term the context marks @id', () => {
    // `cascade:creatorWebID` has `rdfs:range rdfs:Resource` and therefore no
    // value set, so an http-only test reported every other scheme as
    // inexpressible. Every fixture's own record id is a `urn:uuid:`.
    expect(convertToRdf({ ...immunization, creatorWebID: 'urn:webid:alice' }))
      .toContain('<urn:webid:alice>');
  });

  it('writes a did: value', () => {
    expect(convertToRdf({ ...immunization, creatorWebID: 'did:example:alice' }))
      .toContain('<did:example:alice>');
  });

  it('still resolves a bare token through the range value set', () => {
    expect(convertToRdf({ ...immunization, dataProvenance: 'ClinicalGenerated' }))
      .toContain('<https://ns.cascadeprotocol.org/core/v1#ClinicalGenerated>');
  });

  it('still refuses a bare token that is no member and no IRI', () => {
    expect(() => convertToRdf({ ...immunization, dataProvenance: 'MadeItUp' }))
      .toThrow(/Cannot express "dataProvenance"/);
  });
});

describe('the Turtle header declares what the document uses', () => {
  const immunization = {
    id: 'urn:uuid:test',
    type: 'ImmunizationRecord',
    administrationDate: '2024-10-15T10:00:00Z',
  };

  it('declares no rdf: prefix, because the type triple is written as "a"', () => {
    // Every record has an `rdf:type` triple and n3 renders it `a`, so a filter
    // reading the predicate position declared a prefix nothing used.
    expect(convertToTurtle(immunization)).not.toContain('@prefix rdf:');
  });

  it('declares a prefix for a namespace that appears only outside the predicate', () => {
    // `xsd:` reaches the document as a literal's datatype and never as a
    // predicate, so it was written out in full under a header that had already
    // declared six other vocabularies.
    expect(convertToTurtle(immunization)).toContain('@prefix xsd:');
    expect(convertToTurtle(immunization)).toContain('xsd:dateTime');
  });

  it('ignores a prefix-like string inside a literal', () => {
    // The used-prefix test reads the RENDERED document, because only the writer
    // knows what it abbreviated. A literal is part of that document and is not
    // part of what it abbreviated, so a record whose text happens to contain
    // `clinical:` must not make the header declare a vocabulary the body never
    // names — which is exactly the noise the filter exists to remove.
    const written = convertToTurtle({
      ...immunization,
      vaccineName: 'given per clinical: notes',
    });

    expect(written).not.toContain('@prefix clinical:');
    expect(written, 'the literal itself must survive intact').toContain('per clinical: notes');
  });

  it('still declares the prefixes the body does use', () => {
    // The other direction, so a filter that fixed the case above by declaring
    // nothing at all would fail here.
    const written = convertToTurtle({ ...immunization, vaccineName: 'COVID-19' });

    expect(written).toContain('@prefix health:');
    expect(written).toContain('@prefix xsd:');
  });
});

describe('a term whose range names a closed value set', () => {
  const immunization = { id: 'urn:uuid:test', type: 'ImmunizationRecord', schemaVersion: '1.3' };

  it('refuses a mistyped CURIE rather than writing it as a bare IRI', () => {
    // `core:ClinicalGenerate` — the trailing `d` dropped — is no member of
    // `cascade:DataProvenance`, and it satisfies the scheme test because `core`
    // is a legal IRI scheme. Falling through to that test wrote
    // `<core:ClinicalGenerate>`: an IRI spec never published, invented by the
    // writer, in a pod, on a term whose permitted values are enumerated.
    //
    // The existing coverage is `MadeItUp`, which has no colon and so fails the
    // scheme test for an unrelated reason. The colon is what separates the two
    // cases, and it is the likelier typo.
    expect(() => convertToRdf({ ...immunization, dataProvenance: 'core:ClinicalGenerate' }))
      .toThrow(/Cannot express "dataProvenance"/);
  });

  it('refuses a CURIE under a prefix that names no vocabulary at all', () => {
    expect(() => convertToRdf({ ...immunization, dataProvenance: 'zz:Whatever' }))
      .toThrow(/Cannot express "dataProvenance"/);
  });

  it('still writes a member spelled as its full IRI', () => {
    // The other direction, so a fix that closed the set by refusing everything
    // the local-name lookup misses fails here. A member written out in full is
    // the same value, and the record that carries it is not wrong.
    expect(convertToRdf({
      ...immunization,
      dataProvenance: 'https://ns.cascadeprotocol.org/core/v1#ClinicalGenerated',
    })).toContain('<https://ns.cascadeprotocol.org/core/v1#ClinicalGenerated>');
  });

  it('leaves a range-less @id term taking any absolute IRI', () => {
    // `cascade:creatorWebID` has `rdfs:range rdfs:Resource` and therefore no
    // value set, so closing the enumerated terms must not close this one.
    expect(convertToRdf({ ...immunization, creatorWebID: 'did:example:alice' }))
      .toContain('<did:example:alice>');
  });
});

describe('literals are escaped once, by one function', () => {
  const immunization = { id: 'urn:uuid:test', type: 'ImmunizationRecord' };

  it('spells an awkward literal the way the Turtle serializer spells it', () => {
    // `convertToRdf` is exported, so its N-Triples reach consumers directly
    // rather than always being reparsed here. Two independent escaping schemes
    // in one package means a fix to either is a fix to half the output, and
    // which half a caller gets depends on whether their record type is routed.
    const awkward = 'tab\there, bell\u0007, quote " and backslash \\';

    expect(convertToRdf({ ...immunization, vaccineName: awkward }))
      .toContain(escapeTurtleString(awkward));
  });

  it('round-trips that literal through the vendored parser unchanged', () => {
    const awkward = 'tab\there, bell\u0007, quote " and backslash \\';
    const written = convertToTurtle({ ...immunization, vaccineName: awkward });

    expect(quadsFromTurtle(written).some((quad) => quad.object.value === awkward)).toBe(true);
  });
});
