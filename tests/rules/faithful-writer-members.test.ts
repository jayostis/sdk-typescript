/**
 * Every member of a field reaches the graph — at the top level and inside a
 * blank node.
 *
 * THE RULE: `serialize()` writes every value it is handed. Arity and form are
 * separate questions, and a writer that answers "form" with "then I drop it"
 * has answered the arity question too, silently. `emitMember` states this for
 * the top-level path: a value with no expressible form THROWS, naming itself,
 * because "a value written nowhere is worse than an error".
 *
 * TWO PATHS DID NOT FOLLOW IT, and both are reachable from the faithful reader
 * rather than only from a hand-built record — which is what makes them the
 * vacuous pass this branch exists to close. A document goes in carrying two
 * triples, comes back out carrying one, and `validate()` has nothing left to
 * object to:
 *
 *   1. `MULTI_VALUE_FIELDS` filtered its members with `typeof item === 'string'`
 *      and discarded the rest, while the generic member loop three lines below
 *      would have written them.
 *   2. `serializeBlankNode`'s scalar chain had no array case at all, so a
 *      repeated child of an UNTERMED nested node — `wellnessSummary`,
 *      `hasParticipant` — was written nowhere.
 *
 * Each case below is a document in and the same document out, because that is
 * the only form in which the defect is visible: the record in between looks
 * right on both sides of the drop.
 *
 * @see tests/rules/nested-namespace.test.ts  the sibling rule, on which predicate a child keeps
 */

import { describe, it, expect } from 'vitest';

import { serialize } from '../../src/serializer/turtle-serializer.js';
import { deserializeOne } from '../../src/deserializer/turtle-parser.js';

const PREFIXES = `
@prefix cascade: <https://ns.cascadeprotocol.org/core/v1#> .
@prefix health: <https://ns.cascadeprotocol.org/health/v1#> .
@prefix clinical: <https://ns.cascadeprotocol.org/clinical/v1#> .
`;

/** The object of every triple written on `predicate`, in document order. */
function objectsOf(turtle: string, predicate: string): string[] {
  return turtle
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith(`${predicate} `))
    .map((line) => line.slice(predicate.length + 1).replace(/\s*[;.]\s*$/, ''));
}

describe('every member of a top-level field is written', () => {
  it('writes a non-string member of a 0..* code property', () => {
    // The reader converts a typed integer object, so `snomedCode: ["abc", 5]`
    // is a shape a graph really produces. The MULTI_VALUE_FIELDS branch kept
    // the string and dropped the 5 — one triple written where two were read.
    const out = serialize({
      id: 'urn:uuid:member-0001',
      type: 'ConditionRecord',
      schemaVersion: '1.3',
      dataProvenance: 'ClinicalGenerated',
      conditionName: 'Hypertension',
      status: 'active',
      snomedCode: ['http://snomed.info/id/38341003', 5],
    } as never);

    expect(objectsOf(out, 'health:snomedCode')).toEqual([
      '<http://snomed.info/id/38341003>',
      '5',
    ]);
  });

  it('still writes a single code exactly as it did before', () => {
    // THE GUARD. The fix is about the members a filter removed, not about the
    // form of the ones it kept: a record carrying one code must serialize
    // byte-identically, or every fixture moves for no reason. Both forms are
    // asserted, because `URI_FIELDS` membership is what decides between them
    // and the filter sat upstream of that decision for every member.
    const out = serialize({
      id: 'urn:uuid:member-0002',
      type: 'LabResultRecord',
      schemaVersion: '1.3',
      dataProvenance: 'ClinicalGenerated',
      testName: 'Ferritin',
      resultValue: '412',
      resultUnit: 'ng/mL',
      labCategory: 'chemistry',
      testCode: 'http://loinc.org/2276-4',
    } as never);

    expect(objectsOf(out, 'health:labCategory')).toEqual(['"chemistry"']);
    expect(objectsOf(out, 'health:testCode')).toEqual(['<http://loinc.org/2276-4>']);
  });
});

describe('every member of a nested child is written', () => {
  it('round-trips a repeated child of an untermed nested node', () => {
    // `wellnessSummary` has no term, so its children go through
    // `serializeBlankNode`'s own chain rather than `childrenOf`. The reader is
    // faithful for ANY repeated child now, not just a MULTI_VALUE_FIELDS one,
    // so it hands that chain an array — which no branch of it claimed.
    const doc = `${PREFIXES}
<urn:uuid:member-0003> a cascade:ExportManifest ;
    cascade:schemaVersion "1.3" ;
    cascade:wellnessSummary [
        a cascade:RecordSummary ;
        cascade:domain "wellness" ;
        cascade:domain "sleep"
    ] .
`;
    const record = deserializeOne<Record<string, unknown>>(doc, 'ExportManifest');
    expect(record?.['wellnessSummary']).toEqual({ domain: ['wellness', 'sleep'] });

    expect(objectsOf(serialize(record as never), 'cascade:domain')).toEqual([
      '"wellness"',
      '"sleep"',
    ]);
  });

  it('writes a non-string member of a repeated nested child', () => {
    // The same filter as the top-level one, in `serializeBlankNode`'s copy of
    // it. A count and a word under one predicate is not a document anything
    // should PRODUCE — it is one the reader will hand back, and the writer's
    // job is to put back what it was given.
    const out = serialize({
      id: 'urn:uuid:member-0004',
      type: 'ExportManifest',
      schemaVersion: '1.3',
      dataProvenance: 'ClinicalGenerated',
      wellnessSummary: { domain: 'wellness', sleepDays: [30, 60] },
    } as never);

    expect(objectsOf(out, 'cascade:sleepDays')).toEqual([
      '"30"^^xsd:integer',
      '"60"^^xsd:integer',
    ]);
  });

  it('still writes every member of a 0..* child of a nested node', () => {
    // THE OTHER GUARD, and the reason the nested defect stayed invisible:
    // `participantRoleCode` IS in `MULTI_VALUE_FIELDS`, so the one nested
    // branch that understood arrays already covered it. The rule is not "a
    // declared 0..* child keeps its members" — it is that EVERY child does,
    // which is why the two tests above ask about children no table names.
    const out = serialize({
      id: 'urn:uuid:member-0005',
      type: 'Encounter',
      schemaVersion: '1.3',
      dataProvenance: 'ClinicalGenerated',
      hasParticipant: [{ participantRoleCode: ['ATND', 'REF'] }],
    } as never);

    expect(objectsOf(out, 'clinical:participantRoleCode')).toEqual(['"ATND"', '"REF"']);
  });

  it('still writes a single nested scalar exactly as it did before', () => {
    // THE GUARD for the nested path: string, boolean and the two number forms
    // keep the spelling they had, so the member loop is the only change.
    const out = serialize({
      id: 'urn:uuid:member-0006',
      type: 'ExportManifest',
      schemaVersion: '1.3',
      dataProvenance: 'ClinicalGenerated',
      wellnessSummary: { domain: 'wellness', sleepDays: 30 },
    } as never);

    expect(objectsOf(out, 'cascade:domain')).toEqual(['"wellness"']);
    expect(objectsOf(out, 'cascade:sleepDays')).toEqual(['"30"^^xsd:integer']);
  });
});
