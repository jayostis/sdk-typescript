/**
 * A nested child a term's `children` map does not declare.
 *
 * One rule, all three layers — and a fourth here that the other files in this
 * directory do not carry, because this rule is the one whose whole point is
 * what the SHAPES cannot do. `max-count` and `value-set` can leave SHACL to
 * `tests/conformance/`: the shapes judge those, so a conformance fixture is a
 * second opinion. Nothing in `tests/shapes/` is `sh:closed`, so an undeclared
 * predicate earns a vacuous `conforms: true` from plain SHACL, and the reason
 * `validate()` has to grow this check is not observable anywhere except beside
 * the check itself.
 *
 * TWO CASES, and they are not the same question. Both are children the term
 * omits and the writer therefore drops today (`childrenOf`, term.ts:368,
 * `if (declared && !childRule) return []`), and they part company at the
 * validator:
 *
 *   DECLARED BY THE SHAPES, omitted by the term. `RecordSummary extends
 *   CascadeEntity`, so `dataProvenance` is reachable on a nested summary, and
 *   `cascade:RecordSummaryShape` declares `sh:path cascade:dataProvenance`.
 *   Dropping it is pure data loss: the value was legal, the caller set it, and
 *   nothing anywhere reports that it did not arrive. The writer must write it
 *   and the validator must stay silent.
 *
 *   DECLARED BY NOBODY. `cascade:supplementTally` and `cascade:contactNickname`
 *   are the next `cascade:contactEmail` — a spelling no ontology declares,
 *   under no domain, no range and no shape. The writer must still write it,
 *   because a writer that drops it hands the validator a record with nothing
 *   left to violate; the validator is what refuses it.
 *
 * The FORM of a nested `dataProvenance` is a decision this file makes rather
 * than reports: `{ kind: 'uri' }`, matching what the top-level writer emits
 * (`turtle-serializer.ts:578`, `sub.uri(pred, 'cascade:' + value)`). The shape
 * constrains neither form — no `sh:in`, no `sh:datatype`, no `sh:nodeKind` —
 * so both would conform, and the pre-term nested path wrote a plain literal.
 * One document carrying provenance in two spellings is a reader's problem, not
 * a validator's, which is why the tie is broken here and not by the shapes.
 *
 * NO PATIENT PROFILE IN THE SHACL LAYER, though `emergencyContact` is the
 * reviewer's own example and is asked about at the writer and validator layers.
 * Every profile this SDK writes carries `foaf:name`, no vendored shape declares
 * an `sh:path` for any `foaf:` predicate, and `assertCovered` refuses the graph
 * on that ground alone — a refusal naming the wrong predicate, which would be
 * red for a reason this rule did not cause. See tests/conformance/profile.test.ts.
 *
 * @see src/terms/term.ts:355          childrenOf, where the drop happens
 * @see tests/rules/max-count.test.ts  why this directory is keyed on the rule
 */

import { describe, it, expect } from 'vitest';

import { validate } from '../../src/validator/index.js';
import { termFor } from '../../src/terms/index.js';
import { serialize } from '../../src/serializer/turtle-serializer.js';
import { deserialize, deserializeOne } from '../../src/deserializer/turtle-parser.js';
import { shaclCheck } from '../support/shacl.js';
import { parseTurtle } from '../support/graph.js';
import { errorFields, messageFor, record } from './records.js';

/**
 * An export manifest carrying what `cascade:ExportManifestShape` requires.
 *
 * `title` and `created` are `dcterms:title` and `dcterms:created`, both
 * `sh:minCount 1`. Without them every SHACL assertion below would report on
 * two missing manifest properties instead of on the summary's children.
 */
const manifest = (extra: Record<string, unknown> = {}) =>
  record('ExportManifest', {
    title: 'Cascade export',
    created: '2026-08-29T00:00:00Z',
    dataProvenance: 'EHRVerified',
    ...extra,
  });

/** A summary nested under `clinicalSummary`, minimal and conformant on its own. */
const summary = (extra: Record<string, unknown> = {}) => ({
  type: 'RecordSummary',
  id: 'urn:uuid:summary-0001-aaaa-bbbb-ccccddddeeee',
  domain: 'clinical',
  conditionCount: 3,
  ...extra,
});

/** The children of the single blank node a term writes for `field`. */
function childrenWritten(field: string, rec: Record<string, unknown>) {
  const [output] = termFor(field)?.outputsFor(rec) ?? [];
  if (output?.kind !== 'blankNode') {
    throw new Error(`${field} wrote ${output?.kind ?? 'nothing'}, not a blank node`);
  }
  return output.children;
}

describe('a child the term does not declare', () => {
  describe('what the writer does', () => {
    it('writes a child the shapes declare and the term omits', () => {
      // The live instance. `dataProvenance` arrives on every RecordSummary a
      // caller builds off the model, is declared by cascade:RecordSummaryShape,
      // and is dropped — silently, which is why the two children pass 1 found
      // missing from this same term were invisible until someone counted them
      // against the shape.
      expect(childrenWritten('clinicalSummary', manifest({
        clinicalSummary: summary({ dataProvenance: 'EHRVerified' }),
      }))).toContainEqual({
        kind: 'uri',
        predicate: 'cascade:dataProvenance',
        value: 'cascade:EHRVerified',
      });
    });

    it('writes a child no ontology declares', () => {
      // Faithful first. `cascade:supplementTally` is not a property; a writer
      // that drops it returns a clean verdict on incomplete data, and that
      // vacuous pass is the failure mode this SDK is least able to detect.
      expect(childrenWritten('clinicalSummary', manifest({
        clinicalSummary: summary({ supplementTally: 9 }),
      }))).toContainEqual({
        kind: 'number',
        predicate: 'cascade:supplementTally',
        value: 9,
      });
    });

    it('writes an undeclared child of an emergency contact too', () => {
      // The same rule on a different term, because `children` is a property of
      // every blankNode rule and a fix that reached only the summary would
      // leave three other terms dropping.
      expect(childrenWritten('emergencyContact', record('PatientProfile', {
        emergencyContact: { contactName: 'A. Doe', contactNickname: 'Mum' },
      }))).toContainEqual({
        kind: 'literal',
        predicate: 'cascade:contactNickname',
        value: 'Mum',
      });
    });

    it('still writes the children the term does declare', () => {
      // The guard is being removed, not the declaration. A change that wrote
      // undeclared children by abandoning the rules would take the counts'
      // xsd:integer with it, and `conditionCount "3"` as a plain string is a
      // different defect that would pass this file's other tests.
      expect(childrenWritten('clinicalSummary', manifest({
        clinicalSummary: summary({ supplementTally: 9 }),
      }))).toContainEqual({
        kind: 'literal',
        predicate: 'cascade:conditionCount',
        value: '3',
        datatype: 'xsd:integer',
      });
    });
  });

  describe('what the validator reports', () => {
    it('says nothing about a child the shapes declare', () => {
      // Writing it is correct and complaining about it would be the opposite
      // error: `validate()` rejecting a record spec accepts.
      const result = validate(manifest({
        clinicalSummary: summary({ dataProvenance: 'EHRVerified' }),
      }));

      expect(errorFields(result)).not.toContain('clinicalSummary.dataProvenance');
      expect(errorFields(result)).not.toContain('dataProvenance');
    });

    it('names the child no ontology declares, and where it sits', () => {
      // `field` is the PATH and not the bare child key: a caller holding a
      // manifest needs to know which nested object carried it, and
      // `supplementTally` alone would read as a top-level field of a record
      // that has no such field.
      const result = validate(manifest({
        clinicalSummary: summary({ supplementTally: 9 }),
      }));

      expect(errorFields(result)).toContain('clinicalSummary.supplementTally');
      expect(messageFor(result, 'clinicalSummary.supplementTally')).toContain('supplementTally');
    });

    it('names an undeclared child of an emergency contact', () => {
      const result = validate(record('PatientProfile', {
        givenName: 'Jane',
        familyName: 'Doe',
        dateOfBirth: '1985-03-12',
        biologicalSex: 'female',
        emergencyContact: { contactName: 'A. Doe', contactNickname: 'Mum' },
      }));

      expect(errorFields(result)).toContain('emergencyContact.contactNickname');
    });

    it('reports every undeclared child, not the first', () => {
      // The same partial answer the reader used to give when it kept
      // `predTriples[0]`. Two wrong keys are two findings.
      const result = validate(manifest({
        clinicalSummary: summary({ supplementTally: 9, contactNickname: 'Mum' }),
      }));

      expect(errorFields(result)).toEqual(expect.arrayContaining([
        'clinicalSummary.supplementTally',
        'clinicalSummary.contactNickname',
      ]));
    });
  });

  describe('what the reader returns', () => {
    // THE OTHER HALF OF FAITHFUL. The writer emitting a triple the reader will
    // not return means this SDK can produce a document it cannot read back, and
    // the loss is worst on someone else's data: deserialize a pod carrying
    // `cascade:wardCount`, change one field, re-serialize, and the key is gone
    // from their document with no error raised anywhere. `validate()` rejecting
    // the value is not an argument for the reader dropping it — that is the
    // judgement this branch exists to keep in one place.

    const roundTrip = (rec: Record<string, unknown>) =>
      deserialize(serialize(rec as never), 'ExportManifest')[0] as Record<string, unknown>;

    it('returns a child no ontology declares, under its local name', () => {
      // Asserted as the WHOLE nested object rather than one presence, so a
      // reader that returned the undeclared child by abandoning the mapped path
      // — losing `conditionCount`'s integer, say — fails here rather than
      // passes. The bare `9` comes back a number because `cascade:supplementTally`
      // was written as a bare token, which is the arithmetic the graph carries.
      expect(roundTrip(manifest({
        clinicalSummary: summary({ supplementTally: 9 }),
      })).clinicalSummary).toEqual({
        domain: 'clinical',
        conditionCount: 3,
        supplementTally: 9,
      });
    });

    it('round-trips a document this SDK wrote without losing a key', () => {
      // The property stated directly: what went in comes back. Weaker than the
      // assertion above and kept anyway, because it is the sentence a reader of
      // this file is looking for and it fails for a different reason — a
      // predicate spelled one way by the writer and read another way.
      const before = summary({ supplementTally: 9, dataProvenance: 'EHRVerified' });
      const after = roundTrip(manifest({ clinicalSummary: before })).clinicalSummary as
        Record<string, unknown>;

      for (const key of Object.keys(before)) {
        if (key === 'type' || key === 'id') continue;
        expect(after, `${key} did not survive the round trip`).toHaveProperty(key);
      }
    });

    // THE TWO CASES THE ABBREVIATION CANNOT CARRY. Neither is dropped: the key
    // is the full IRI and the writer spells it in angle brackets, because
    // Turtle can express any predicate that could have reached the reader — a
    // document carrying one it could not express would not have parsed on the
    // way in. What is being avoided is not an unwritable triple but a WRONG
    // one: `prefix:key` is an abbreviation, and where it would mean something
    // the source document did not say, the long form is used instead.
    const nestedTurtle = (childPredicate: string, object: string) => `
@prefix cascade: <https://ns.cascadeprotocol.org/core/v1#> .

<urn:uuid:profile-foreign-child> a cascade:PatientProfile ;
    cascade:schemaVersion "1.3" ;
    cascade:emergencyContact [
        a cascade:EmergencyContact ;
        cascade:contactName "Maria Rivera" ;
        ${childPredicate} ${object}
    ] .
`;

    it('keeps a child from another namespace in that namespace', () => {
      // `childrenOf` abbreviates a child as `nestedPrefix:key`, so a bare
      // `wardCount` would be written back as `cascade:wardCount` — a DIFFERENT
      // predicate, a triple reassigned to a vocabulary that never declared it,
      // with this SDK's name on the claim. The full IRI is the key, so the
      // writer spells it in angle brackets and says what the document said.
      const parsed = deserializeOne<Record<string, unknown>>(
        nestedTurtle('<https://other.example.org/ns#wardCount>', '7'),
        'PatientProfile',
      );

      expect(parsed?.emergencyContact).toEqual({
        contactName: 'Maria Rivera',
        'https://other.example.org/ns#wardCount': 7,
      });
    });

    it('keeps a local name PN_LOCAL cannot spell', () => {
      // `<…#odd(name)>` is a legal IRI and `cascade:odd(name)` is not a legal
      // prefixed name. Same predicate, and only one of the two spellings
      // parses — so the long one is used rather than the value lost.
      const parsed = deserializeOne<Record<string, unknown>>(
        nestedTurtle('<https://ns.cascadeprotocol.org/core/v1#odd(name)>', '"x"'),
        'PatientProfile',
      );

      expect(parsed?.emergencyContact).toEqual({
        contactName: 'Maria Rivera',
        'https://ns.cascadeprotocol.org/core/v1#odd(name)': 'x',
      });
    });

    it('re-serializes everything it returned, as parseable Turtle', () => {
      // The floor under all of it, asserted on a document carrying all three
      // cases at once: one abbreviable child, one foreign, one unspellable.
      // Whatever either side does about validity, the output parses.
      const doc = `
@prefix cascade: <https://ns.cascadeprotocol.org/core/v1#> .

<urn:uuid:profile-foreign-child> a cascade:PatientProfile ;
    cascade:schemaVersion "1.3" ;
    cascade:emergencyContact [
        a cascade:EmergencyContact ;
        cascade:contactName "Maria Rivera" ;
        cascade:contactEmail "maria@example.org" ;
        <https://other.example.org/ns#wardCount> 7 ;
        <https://ns.cascadeprotocol.org/core/v1#odd(name)> "x"
    ] .
`;
      const parsed = deserializeOne<Record<string, unknown>>(doc, 'PatientProfile');
      const out = serialize(parsed as never);

      // Parsed rather than pattern-matched: the question is whether a Turtle
      // parser accepts it, and only a parser answers that.
      expect(() => parseTurtle(out)).not.toThrow();

      // Every child survives, each in the spelling that means what it meant.
      expect(out).toContain('cascade:contactEmail');
      expect(out).toContain('<https://other.example.org/ns#wardCount>');
      expect(out).toContain('<https://ns.cascadeprotocol.org/core/v1#odd(name)>');
      expect(out).not.toContain('cascade:wardCount');
    });

    it('leaves the record reportable, so the loss is not laundered', () => {
      // The point of returning it. A key the reader drops cannot be reported by
      // anything downstream: the record that comes back conforms, and
      // re-serializing it launders the violation away. Returned, it is still
      // there for `validate()` to refuse.
      const back = roundTrip(manifest({ clinicalSummary: summary({ supplementTally: 9 }) }));

      expect(errorFields(validate(back as never))).toContain('clinicalSummary.supplementTally');
    });
  });

  describe('what the shapes can judge', () => {
    it('conforms with a child the shapes declare', async () => {
      // Proves the writer's new triple is legal rather than merely present:
      // cascade:RecordSummaryShape caps cascade:dataProvenance at one and
      // constrains its form no further, so the IRI this file chose conforms.
      const report = await shaclCheck(manifest({
        clinicalSummary: summary({ dataProvenance: 'EHRVerified' }),
      }) as never);

      expect(report.conforms).toBe(true);
    });

    it('cannot judge a child no ontology declares, which is why validate() must', async () => {
      // The evidence for this whole rule. Nothing in tests/shapes/ is
      // sh:closed, so SHACL returns conforms:true on a graph carrying
      // cascade:supplementTally — indistinguishable from a graph that satisfied
      // every constraint. `assertCovered` is what refuses it, and it is a
      // TEST-TIME helper: `rdf-validate-shacl` is a devDependency and
      // tests/shapes/ is not in package.json's `files`, so nothing a consumer
      // installs can reach this refusal. `validate()` ships alone.
      await expect(shaclCheck(manifest({
        clinicalSummary: summary({ supplementTally: 9 }),
      }) as never)).rejects.toThrow(/cascade:supplementTally/);
    });
  });
});

/**
 * The message has to name the predicate the WRITER emits.
 *
 * That is this rule's entire product. Nothing in `tests/shapes/` is `sh:closed`
 * and the shapes are a devDependency besides, so a consumer's only account of
 * an undeclared child is this string — and a string naming a predicate nothing
 * writes is worse than silence, because it sends them grepping their export for
 * a spelling that is not in it.
 *
 * `${prefix}:${child}` was right for every child key that is a JSON name, and
 * wrong for the one kind that is not. A predicate from another namespace comes
 * back from `recoverableChildKey` as a full IRI, the writer emits
 * `<https://other.example.org/ns#wardCount>`, and the message said
 * `cascade:https://other.example.org/ns#wardCount`.
 */
describe('the predicate an undeclared-child message names', () => {
  const withChild = (key: string, value: unknown) =>
    manifest({ clinicalSummary: summary({ [key]: value }) });

  it('is the CURIE for a child key that is a JSON name', () => {
    // Unchanged, and asserted so the IRI case below is a widening rather than a
    // swap: the ordinary child still gets the node's prefix.
    expect(messageFor(validate(withChild('wardCount', 3)), 'clinicalSummary.wardCount')).toContain(
      'cascade:wardCount is written under no domain, range or shape',
    );
  });

  it('is the angle-bracketed IRI for a child key that is a predicate', () => {
    const iri = 'https://other.example.org/ns#wardCount';
    const message = messageFor(validate(withChild(iri, 9)), `clinicalSummary.${iri}`);

    expect(message).toContain(`<${iri}> is written under no domain, range or shape`);
    expect(message).not.toContain('cascade:https://');
  });

  it('names the predicate that is actually in the document', () => {
    // The assertion that ties the two halves together, and the only one that
    // would have caught this: the message is read against the export, so it is
    // checked against the export.
    const iri = 'https://other.example.org/ns#wardCount';
    const record = withChild(iri, 9);
    const turtle = serialize(record);

    const named = messageFor(validate(record), `clinicalSummary.${iri}`)
      ?.match(/; (.+) is written under no domain/)?.[1];

    expect(named).toBeDefined();
    expect(turtle).toContain(named as string);
  });
});
