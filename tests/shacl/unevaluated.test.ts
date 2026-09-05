/**
 * What the engine does not implement is REPORTED, never skipped.
 *
 * THE MOST IMPORTANT SHAPE IN THIS DIRECTORY. A record satisfying every
 * implemented constraint, under a shape that also carries constraints the
 * engine has no validator for. A wrong engine passes it in silence, and
 * silence is indistinguishable from correctness — every other suite here
 * would stay green over an engine that quietly judged half of each shape.
 *
 * THE PARAMETER LIST IS WRITTEN BY HAND, not imported from the engine's own
 * table of what it implements (`tests/README.md`, never derive the expected
 * value from the code under test). An engine that moved `sh:class` from
 * "unimplemented" to "implemented as a no-op" would agree with its own list.
 */

import { describe, it, expect } from 'vitest';

import { engineOver, SH } from './harness.js';

/**
 * A shape carrying six parameters the engine does not judge, beside two it
 * does. The record satisfies both of the judged ones.
 */
const SHAPE = `ex:S a sh:NodeShape ;
    sh:targetClass ex:Thing ;
    sh:closed true ;
    sh:property [ sh:path ex:a ; sh:datatype xsd:string ; sh:minCount 1 ; sh:hasValue "a" ] ;
    sh:property [ sh:path ex:b ; sh:not [ sh:datatype xsd:integer ] ] ;
    sh:property [ sh:path ex:c ; sh:qualifiedValueShape [ sh:datatype xsd:string ] ; sh:qualifiedMinCount 1 ] ;
    sh:property [ sh:path ex:d ; sh:node ex:Other ] ;
    sh:property [ sh:path ex:e ; sh:class ex:Kind ] .`;

const RECORD = 'ex:s a ex:Thing ; ex:a "a" ; ex:b "b" ; ex:c "c" ; ex:d ex:x ; ex:e ex:y .';

const UNIMPLEMENTED = ['hasValue', 'not', 'closed', 'qualifiedValueShape', 'node', 'class']
  .map((parameter) => `${SH}${parameter}`);

describe('evaluate', () => {
  describe('a shape carrying parameters it has no validator for', () => {
    it('does not conform, though every implemented constraint is satisfied', () => {
      const report = engineOver(SHAPE, RECORD);

      expect(report.conforms).toBe(false);
    });

    it('names each of the six', () => {
      const report = engineOver(SHAPE, RECORD);

      expect(report.unevaluated).toEqual(expect.arrayContaining(UNIMPLEMENTED));
    });

    it('does not name what it did evaluate', () => {
      // `sh:datatype` and `sh:minCount` sit on the same property shape as
      // `sh:hasValue`. Reporting the whole shape as unevaluated would be
      // honest and useless; the list has to be per parameter.
      const report = engineOver(SHAPE, RECORD);

      expect(report.unevaluated).not.toContain(`${SH}datatype`);
      expect(report.unevaluated).not.toContain(`${SH}minCount`);
      expect(report.evaluated).toBeGreaterThan(0);
    });

    it('lists each parameter once, sorted, so two reports compare with toEqual', () => {
      const report = engineOver(SHAPE, RECORD);

      expect(report.unevaluated).toEqual([...new Set(report.unevaluated)].sort());
    });
  });

  describe('sh:or over a non-datatype alternative', () => {
    // Catches an engine that implements the datatype form of `sh:or` and
    // treats every other `sh:or` as satisfied. The value fails the datatype
    // alternative, so only the alternative the engine cannot judge could
    // rescue it — and the honest answer is that nobody looked.
    const shape = 'ex:S a sh:NodeShape ; sh:targetClass ex:Thing ; sh:property [ sh:path ex:p ; '
      + 'sh:or ( [ sh:datatype xsd:integer ] [ sh:class ex:Kind ] ) ] .';
    const record = 'ex:s a ex:Thing ; ex:p ex:something .';

    it('is unevaluated, and the report does not conform', () => {
      const report = engineOver(shape, record);

      expect(report.unevaluated).toContain(`${SH}or`);
      expect(report.conforms).toBe(false);
    });
  });

  describe('a made-up sh:* parameter', () => {
    // The index keeps it (`tests/spec-data/build-shapes.test.ts`); the engine
    // has to say it did not judge it, or keeping it bought nothing.
    const shape = 'ex:S a sh:NodeShape ; sh:targetClass ex:Thing ; sh:property [ sh:path ex:p ; sh:frobnicate 3 ] .';
    const record = 'ex:s a ex:Thing ; ex:p "x" .';

    it('is reported unevaluated', () => {
      const report = engineOver(shape, record);

      expect(report.unevaluated).toContain(`${SH}frobnicate`);
      expect(report.conforms).toBe(false);
    });
  });

  describe('a sh:pattern this engine cannot compile', () => {
    // The one parameter form that THREW instead of refusing: a regular
    // expression JavaScript rejects, or flags it does not know (SPARQL's `q`
    // among them), came out of `evaluate()` as a bare SyntaxError, with no
    // catch between it and `validate()`'s caller. Every other unreadable
    // parameter lands in `unevaluated`; this one now does too.
    const record = 'ex:s a ex:Thing ; ex:p "x" .';

    it.each([
      ['an unterminated group', String.raw`sh:pattern "^(a$"`],
      ['flags JavaScript does not accept', 'sh:pattern "^a$" ; sh:flags "xyz"'],
      ['the SPARQL-only q flag', 'sh:pattern "^a$" ; sh:flags "q"'],
    ])('with %s, is reported unevaluated rather than thrown', (_, constraint) => {
      const shape = `ex:S a sh:NodeShape ; sh:targetClass ex:Thing ; sh:property [ sh:path ex:p ; ${constraint} ] .`;

      const report = engineOver(shape, record);

      expect(report.unevaluated).toContain(`${SH}pattern`);
      expect(report.conforms).toBe(false);
    });

    it('is refused even where the path has no values, where the oracle would conform', () => {
      // The oracle compiles per value and never reaches the pattern here. A
      // refusal is the permitted direction of disagreement: loud, never a pass.
      const shape = String.raw`ex:S a sh:NodeShape ; sh:targetClass ex:Thing ; sh:property [ sh:path ex:p ; sh:pattern "^(a$" ] .`;

      const report = engineOver(shape, 'ex:s a ex:Thing .');

      expect(report.unevaluated).toContain(`${SH}pattern`);
    });
  });

  describe('a shape it evaluates in full', () => {
    // The other direction: `sh:path`, `sh:message`, `sh:severity`, `sh:name`
    // and `sh:description` are not constraints, and an engine that listed them
    // would make `unevaluated` non-empty on every shape spec publishes.
    const shape = 'ex:S a sh:NodeShape ; sh:targetClass ex:Thing ; sh:property [ sh:path ex:p ; sh:datatype xsd:string ; '
      + 'sh:name "P"@en ; sh:description "the p"@en ; sh:message "p must be a string"@en ; sh:severity sh:Warning ] .';
    const record = 'ex:s a ex:Thing ; ex:p "x" .';

    it('reports nothing unevaluated', () => {
      const report = engineOver(shape, record);

      expect(report.unevaluated).toEqual([]);
      expect(report.evaluated).toBeGreaterThan(0);
    });
  });
});
