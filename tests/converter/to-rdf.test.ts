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

import env from '@zazuko/env';
import SHACLValidator from 'rdf-validate-shacl';
import { describe, it, expect } from 'vitest';

import { convertToRdf, convertToTurtle } from '../../src/converter/to-rdf.js';
import { graphDifference, health, parseDataset, quadsFromTurtle } from '../support/graph.js';
import { loadFixture } from '../support/fixtures.js';
import { shapesGraph, SHACL_NS } from '../support/spec-sources.js';
import { SPEC_TERMS } from '../../src/spec/derived/terms.generated.js';
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

  it('refuses an unrecognized prefix even when the local name it strips off is a real member', () => {
    // `zz:Whatever` above fails the scheme test for an unrelated reason —
    // `Whatever` is not a member either. `bogus:ClinicalGenerated` isolates the
    // real bug: stripping everything up to the first colon, regardless of
    // whether the prefix means anything, finds `ClinicalGenerated` — a genuine
    // member — and accepts an IRI spec never published under a prefix this SDK
    // does not recognize.
    expect(() => convertToRdf({ ...immunization, dataProvenance: 'bogus:ClinicalGenerated' }))
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

  it('refuses a local name that collides with an inherited Object.prototype property', () => {
    // `members[localName]` read the value set by computed key with no
    // `hasOwnProperty` guard, unlike the prefix check two lines above that
    // guards the exact same class of lookup. `cascade:constructor` is no
    // member of `cascade:DataProvenance`, but `members.constructor` resolves
    // to the inherited `Object` constructor function — truthy — so the
    // unguarded lookup wrote that function's source into the graph instead of
    // falling through to "no such member".
    expect(() => convertToRdf({ ...immunization, dataProvenance: 'cascade:constructor' }))
      .toThrow(/Cannot express "dataProvenance"/);
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

describe('a JavaScript number with no expressible XSD String() form', () => {
  const immunization = { id: 'urn:uuid:test', type: 'ImmunizationRecord' };

  // `trendPolarity` carries neither a context `@type` nor an ontology
  // `rdfs:range`, so `objectTerm` falls all the way to "the JavaScript value,
  // last" and infers `xsd:double` from `typeof value === 'number'`.

  it('spells Infinity as the XSD lexical form INF, not String(Infinity)', () => {
    expect(convertToRdf({ ...immunization, trendPolarity: Infinity }))
      .toContain('"INF"^^<http://www.w3.org/2001/XMLSchema#double>');
  });

  it('spells -Infinity as -INF', () => {
    expect(convertToRdf({ ...immunization, trendPolarity: -Infinity }))
      .toContain('"-INF"^^<http://www.w3.org/2001/XMLSchema#double>');
  });

  it('still spells NaN as NaN, which happens to already be the XSD form', () => {
    expect(convertToRdf({ ...immunization, trendPolarity: NaN }))
      .toContain('"NaN"^^<http://www.w3.org/2001/XMLSchema#double>');
  });
});

describe('the absolute-IRI test excludes every C0 control character', () => {
  const immunization = { id: 'urn:uuid:test', type: 'ImmunizationRecord', schemaVersion: '1.3' };

  it('refuses a NUL byte, which \\s does not match but the IRIREF grammar excludes', () => {
    expect(() => convertToRdf({ ...immunization, creatorWebID: 'urn:webid:al\x00ice' }))
      .toThrow(/"creatorWebID"/);
  });

  it('refuses an ESC byte, for the same reason', () => {
    expect(() => convertToRdf({ ...immunization, creatorWebID: 'urn:webid:al\x1bice' }))
      .toThrow(/"creatorWebID"/);
  });

  it('still accepts an ordinary IRI with none of those bytes', () => {
    expect(convertToRdf({ ...immunization, creatorWebID: 'urn:webid:alice' }))
      .toContain('<urn:webid:alice>');
  });
});

describe('a `@container: @list` field is written as an ordered rdf:List', () => {
  const immunization = { id: 'urn:uuid:test', type: 'ImmunizationRecord', schemaVersion: '1.3' };

  it('chains the subject through blank nodes in the given order, not as flat repeated triples', () => {
    // `provenanceLayers` is core v3.4's, `@container: @list`, `@type: @id`.
    // Flat repeated triples — what every other multi-valued field above gets —
    // cannot carry an order at all; a reader recovering `["a", "b"]` from them
    // has no way to tell that from `["b", "a"]`.
    const written = convertToRdf({
      ...immunization,
      provenanceLayers: ['urn:uuid:layer-a', 'urn:uuid:layer-b'],
    });
    const quads = quadsFromTurtle(written);

    const head = quads.find((quad) =>
      quad.predicate.value === 'https://ns.cascadeprotocol.org/core/v1#provenanceLayers');
    expect(head, 'the subject points at a list node, not directly at a value').toBeDefined();

    const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
    const firstNode = head!.object;
    const first = quads.find((q) => q.subject.value === firstNode.value && q.predicate.value === `${RDF}first`);
    const rest = quads.find((q) => q.subject.value === firstNode.value && q.predicate.value === `${RDF}rest`);
    expect(first?.object.value).toBe('urn:uuid:layer-a');

    const secondNode = rest!.object;
    const second = quads.find((q) => q.subject.value === secondNode.value && q.predicate.value === `${RDF}first`);
    const tail = quads.find((q) => q.subject.value === secondNode.value && q.predicate.value === `${RDF}rest`);
    expect(second?.object.value).toBe('urn:uuid:layer-b');
    expect(tail?.object.value).toBe(`${RDF}nil`);
  });

  it('writes rdf:nil directly for an empty list, rather than an empty blank-node chain', () => {
    const written = convertToRdf({ ...immunization, provenanceLayers: [] });

    expect(written).toContain(
      '<https://ns.cascadeprotocol.org/core/v1#provenanceLayers> '
      + '<http://www.w3.org/1999/02/22-rdf-syntax-ns#nil> .',
    );
  });

  it('still refuses an item with no expressible form, naming the field', () => {
    expect(() => convertToRdf({ ...immunization, provenanceLayers: ['not an iri', 'urn:uuid:ok'] }))
      .toThrow(/Cannot express "provenanceLayers"/);
  });
});

describe('a term whose range is unclassifiable — neither members nor fields', () => {
  // `health:HRVReading` is one of the six structured classes spec declares and
  // never gives a single `rdfs:domain`-linked property (#91). It is not a code
  // list — `SPEC_TERMS.valueSets` has no entry for it — so today's `objectTerm`
  // falls through the closed-set branch to "any absolute IRI", and a value that
  // happens to look like one is written permissively: an IRI spec never
  // published, into a pod, on a term nothing here can tell a valid value from
  // an invalid one for. No conformance fixture carries `hrvHistory` or any of
  // the other ten unclassifiable terms — measured, not assumed — so this
  // record is constructed rather than loaded.
  const immunization = { id: 'urn:uuid:test', type: 'ImmunizationRecord', schemaVersion: '1.3' };

  it('refuses a value on hrvHistory, naming the term, its range and what spec would add', () => {
    const withValue = { ...immunization, hrvHistory: 'urn:uuid:some-hrv-reading' };

    expect(() => convertToRdf(withValue)).toThrow(/hrvHistory/);
    expect(() => convertToRdf(withValue)).toThrow(/HRVReading/);
    // Not just "this value is invalid" — the refusal must point at spec, since
    // the fix is a class spec declares and never populates, not a mistake in
    // the record.
    expect(() => convertToRdf(withValue)).toThrow(/spec/i);
  });

  it('leaves a record that does not carry hrvHistory at all unaffected', () => {
    // Both directions, so the refusal cannot quietly become a blanket one:
    // the ambiguity is per VALUE, not per type. A record that never mentions
    // the term must convert exactly as it does today.
    expect(() => convertToRdf(immunization)).not.toThrow();
  });
});

/**
 * The shapes, as a judge over the graph THIS writer produces.
 *
 * `tests/support/shacl.ts` validates what `serialize()` writes — the legacy
 * path — and keeps its validator private, so a verdict on `convertToRdf`'s
 * output needs one built here from the same shapes graph. Assertions are on
 * `sourceConstraintComponent` and `path`, never on `message` or a bare
 * `conforms`: a message is prose spec owns, and a `conforms: true` over a graph
 * the shapes hold nothing for would be a pass on nothing.
 */
const oracle = new SHACLValidator(shapesGraph());
const sh = env.namespace(SHACL_NS);
const xsd = env.namespace('http://www.w3.org/2001/XMLSchema#');

const judge = (record: object) =>
  oracle.validate(parseDataset(convertToRdf(record as Record<string, unknown>)));

const resultsAt = (report: { results: readonly { path: unknown; sourceConstraintComponent: unknown }[] }, path: unknown) =>
  report.results
    .filter((r) => (r.path as { equals(o: unknown): boolean }).equals(path))
    .map((r) => (r.sourceConstraintComponent as { value: string }).value);

describe('a value whose JavaScript type disagrees with the declared datatype', () => {
  // The writer writes the value in ITS OWN type, so the graph shows what was
  // handed over and the shape can see it. Stringifying under the term's
  // declared type made a mistyped value a conformant literal — `vaccineName: 42`
  // reached the graph as `"42"`, which satisfies `sh:datatype xsd:string` — and
  // no judge of that graph could tell. Refusing at the writer is not taken: a
  // throw on a wrong type is a judgement, and only the validator judges.
  const imm001 = loadFixture('imm-001');
  const fam002 = loadFixture('fam-002');

  it('writes a number under an xsd:string term as xsd:integer, and the oracle rejects it', async () => {
    const record = { ...imm001.input, vaccineName: 42 };

    expect(convertToRdf(record)).toContain('"42"^^<http://www.w3.org/2001/XMLSchema#integer>');
    expect(resultsAt(await judge(record), health.vaccineName))
      .toContain(sh.DatatypeConstraintComponent.value);
  });

  it('writes a non-integer number under an xsd:string term as xsd:double', () => {
    expect(convertToRdf({ ...imm001.input, vaccineName: 0.5 }))
      .toContain('"0.5"^^<http://www.w3.org/2001/XMLSchema#double>');
  });

  it('writes a boolean under an xsd:string term as xsd:boolean', () => {
    expect(convertToRdf({ ...imm001.input, vaccineName: true }))
      .toContain('"true"^^<http://www.w3.org/2001/XMLSchema#boolean>');
  });

  it('writes a string under an xsd:integer term as a plain literal, and the oracle rejects it', async () => {
    // The mirror. `onsetAge` is the term rather than one named in the issue
    // because fam-002 is the one numeric-valued fixture this writer converts
    // whole; the declared type is read back from the generated terms so the
    // test cannot keep passing on a term that stopped being an integer.
    expect(SPEC_TERMS.vocabularies['health']?.['onsetAge']?.type).toBe(xsd.integer.value);

    const record = { ...fam002.input, onsetAge: '52' };

    expect(convertToRdf(record)).toMatch(/<https:\/\/ns\.cascadeprotocol\.org\/health\/v1#onsetAge> "52" \./);
    expect(resultsAt(await judge(record), health.onsetAge))
      .toContain(sh.DatatypeConstraintComponent.value);
  });
});

describe('a date-precision value under an xsd:dateTime term', () => {
  // `health.jsonld` gives `administrationDate` no `@type` (`jayostis/spec#46`),
  // so the datatype comes from `rdfs:range xsd:dateTime` whatever the value's
  // precision, and `health:ImmunizationRecordShape`'s
  // `sh:or ( [ sh:datatype xsd:date ] [ sh:datatype xsd:dateTime ] )` has one
  // alternative the writer could never produce. Its message says a source
  // that stated only a calendar day must not be given an invented time.
  const imm001 = loadFixture('imm-001');

  it('writes a well-formed xsd:date lexical form as xsd:date, and the oracle conforms', async () => {
    const record = { ...imm001.input, administrationDate: '2024-01-15' };

    expect(convertToRdf(record)).toContain('"2024-01-15"^^<http://www.w3.org/2001/XMLSchema#date>');

    const report = await judge(record);
    expect(resultsAt(report, health.administrationDate)).toEqual([]);
    expect(report.conforms).toBe(true);
  });

  it('keeps a timezone on the date, which the xsd:date grammar permits', () => {
    expect(convertToRdf({ ...imm001.input, administrationDate: '2024-01-15Z' }))
      .toContain('"2024-01-15Z"^^<http://www.w3.org/2001/XMLSchema#date>');
    expect(convertToRdf({ ...imm001.input, administrationDate: '2024-01-15-05:00' }))
      .toContain('"2024-01-15-05:00"^^<http://www.w3.org/2001/XMLSchema#date>');
  });

  it('still writes a value well-formed for neither type as xsd:dateTime, which the oracle rejects', async () => {
    // Admitting well-formed dates must not admit arbitrary strings.
    const record = { ...imm001.input, administrationDate: 'yesterday' };

    expect(convertToRdf(record)).toContain('"yesterday"^^<http://www.w3.org/2001/XMLSchema#dateTime>');
    expect(resultsAt(await judge(record), health.administrationDate))
      .toContain(sh.OrConstraintComponent.value);
  });

  it('leaves a full xsd:dateTime value typed as xsd:dateTime', () => {
    expect(convertToRdf({ ...imm001.input, administrationDate: '2024-01-15T00:00:00Z' }))
      .toContain('"2024-01-15T00:00:00Z"^^<http://www.w3.org/2001/XMLSchema#dateTime>');
  });
});
