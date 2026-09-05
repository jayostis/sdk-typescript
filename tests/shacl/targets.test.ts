/**
 * Which shapes a graph selects, over the shapes spec publishes.
 *
 * Two target types, and a refusal. `sh:targetClass` is exercised by every
 * other suite here; `sh:targetSubjectsOf` is the open-world form spec uses
 * for nine predicates, and it selects by the predicate's exact IRI. And a
 * graph that selects nothing at all is `run_conformance.py`'s `UNSHAPED`
 * brought down to one record: zero constraints evaluated is a refusal, never
 * a pass, because a validator that conforms to everything it does not
 * understand is the vacuous verdict this SDK is least able to detect.
 */

import { describe, it, expect } from 'vitest';

import { quadsOf, engineOver, engineOverSpec, oracleOver, specShapes, CASCADE, EX, SH } from './harness.js';

const CLINICAL = 'https://ns.cascadeprotocol.org/clinical/v1#';
const HEALTH = 'https://ns.cascadeprotocol.org/health/v1#';

/**
 * The nine, written out. Read off the shapes files by hand rather than off the
 * index, so an index that lost a `sh:targetSubjectsOf` is a failure here and
 * not a smaller number nobody questioned.
 */
const TARGET_PREDICATES = [
  `${CASCADE}sourceIdentity`,
  `${CASCADE}dataAbsentReason`,
  `${CASCADE}hasAttachment`,
  `${CASCADE}consentScope`,
  `${HEALTH}procedureName`,
  `${CLINICAL}hasEncounter`,
  `${CLINICAL}indicationReference`,
  `${CLINICAL}linkedCondition`,
  `${CLINICAL}parsedIndicationReference`,
].sort();

describe('evaluate', () => {
  describe('sh:targetSubjectsOf', () => {
    it('is declared for exactly the nine predicates in the shipped index', () => {
      const declared = specShapes()
        .flatMap((shape) => (shape['targetSubjectsOf'] as { '@id': string }[] | undefined) ?? [])
        .map((term) => term['@id'])
        .sort();

      expect(declared).toEqual(TARGET_PREDICATES);
    });

    it('selects a subject of one of the nine, and not a subject of a lookalike', () => {
      // `cascade:DataAbsentReasonShape` constrains the value to a code list;
      // "UNK" is the HL7 v3 spelling the shape's own comment says it refuses.
      // The subject's class is targeted by nothing, so any result at all came
      // through the predicate.
      const selected = engineOverSpec(quadsOf('ex:s a ex:Untargeted ; cascade:dataAbsentReason "UNK" .'));

      expect(selected.results.map((r) => r.sourceConstraintComponent)).toEqual([`${SH}InConstraintComponent`]);
      expect(selected.results[0]).toMatchObject({ focusNode: `${EX}s`, path: `${CASCADE}dataAbsentReason` });

      // Same graph, the predicate one character longer. A selector that
      // matched by prefix, or by local name after a namespace strip, selects
      // the shape here too.
      const lookalike = engineOverSpec(quadsOf('ex:s a ex:Untargeted ; cascade:dataAbsentReasonX "UNK" .'));

      expect(lookalike.results).toEqual([]);
      expect(lookalike.evaluated).toBe(0);
    });
  });

  describe('a record no shape targets', () => {
    it('does not conform, having evaluated nothing', () => {
      const report = engineOverSpec(quadsOf('ex:s a ex:NoSuchClass ; ex:p "x" .'));

      expect(report.evaluated).toBe(0);
      expect(report.selected).toBe(0);
      expect(report.results).toEqual([]);
      expect(report.conforms).toBe(false);
    });
  });

  describe('a target form this engine does not select by', () => {
    // `sh:targetObjectsOf` is refused, never silently unselected — but a
    // refusal belongs to a SELECTED shape (the report's own contract), and a
    // shape whose target matches nothing in the graph selected nothing. An
    // engine that reported it for every graph flipped every verdict the day
    // spec published one such shape anywhere in six vocabularies.
    const shapes = 'ex:S a sh:NodeShape ; sh:targetClass ex:Thing ; sh:property [ sh:path ex:p ; sh:datatype xsd:string ] . '
      + 'ex:T a sh:NodeShape ; sh:targetObjectsOf ex:q ; sh:property [ sh:path ex:r ; sh:minCount 1 ] .';

    it('is not reported on a graph its target would select nothing in', async () => {
      const data = 'ex:s a ex:Thing ; ex:p "x" .';
      const report = engineOver(shapes, data);

      expect(report.unevaluated).toEqual([]);
      expect(report.evaluated).toBeGreaterThan(0);
      expect(report.conforms).toBe(true);
      expect((await oracleOver(shapes, data)).conforms).toBe(true);
    });

    it('is reported on a graph its target would select something in', () => {
      const report = engineOver(shapes, 'ex:s a ex:Thing ; ex:p "x" ; ex:q ex:o .');

      expect(report.unevaluated).toEqual([`${SH}targetObjectsOf`]);
      expect(report.conforms).toBe(false);
    });

    it('sh:targetNode is reported whatever the graph holds, because it always selects', () => {
      // A target node is a focus node whether or not the graph mentions it;
      // the oracle evaluates it on an empty set of triples.
      const report = engineOver('ex:T a sh:NodeShape ; sh:targetNode ex:n ; sh:property [ sh:path ex:r ; sh:minCount 1 ] .', 'ex:s a ex:Thing .');

      expect(report.unevaluated).toEqual([`${SH}targetNode`]);
      expect(report.conforms).toBe(false);
    });
  });
});
