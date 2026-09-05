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

import { quadsOf, engineOverSpec, specShapes, CASCADE, EX, SH } from './harness.js';

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
      expect(report.results).toEqual([]);
      expect(report.conforms).toBe(false);
    });
  });
});
