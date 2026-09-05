/**
 * Each implemented constraint component rejects the record it should, and
 * only that one.
 *
 * ONE SHAPE/RECORD PAIR PER COMPONENT, on hand-written Turtle, each violating
 * exactly that component, and beside it a near miss that satisfies it. The
 * near miss asserts `evaluated > 0` as well as an empty report: a component
 * declared implemented that never fires passes every violating record and
 * every near miss alike, and an empty report alone cannot tell "evaluated and
 * satisfied" from "never looked". That is what `sh:datatype` already is in the
 * legacy chain.
 *
 * THE ORACLE JUDGES THE PAIRS TOO. A pair the oracle disagrees with is a
 * defect in this file, not in the engine, so every case compares the two.
 */

import { describe, it, expect } from 'vitest';

import { engineOver, oracleOver, oracleTuplesOf, tuplesOf, EX, SH } from './harness.js';

/** A node shape targeting `ex:Thing` with one property shape on `ex:p`. */
const shape = (constraint: string): string =>
  `ex:S a sh:NodeShape ; sh:targetClass ex:Thing ; sh:property [ sh:path ex:p ; ${constraint} ] .`;

/** One subject of the targeted class, carrying whatever `ex:p` is given. */
const thing = (objects?: string): string =>
  objects === undefined ? 'ex:s a ex:Thing .' : `ex:s a ex:Thing ; ex:p ${objects} .`;

interface Pair {
  readonly component: string;
  readonly constraint: string;
  readonly violates: string | undefined;
  readonly satisfies: string;
}

const PAIRS: readonly Pair[] = [
  {
    component: 'DatatypeConstraintComponent',
    constraint: 'sh:datatype xsd:dateTime',
    violates: '"2024-10-15T10:00:00Z"',
    satisfies: '"2024-10-15T10:00:00Z"^^xsd:dateTime',
  },
  {
    component: 'MinCountConstraintComponent',
    constraint: 'sh:minCount 1',
    violates: undefined,
    satisfies: '"present"',
  },
  {
    component: 'MaxCountConstraintComponent',
    constraint: 'sh:maxCount 1',
    violates: '"one", "two"',
    satisfies: '"one"',
  },
  {
    component: 'MinLengthConstraintComponent',
    constraint: 'sh:minLength 1',
    violates: '""',
    // One character is what the vocabulary asks for, and a space is one:
    // SHACL measures the value converted to string and never trims.
    satisfies: '" "',
  },
  {
    component: 'MaxLengthConstraintComponent',
    constraint: 'sh:maxLength 3',
    violates: '"abcd"',
    satisfies: '"abc"',
  },
  {
    component: 'PatternConstraintComponent',
    constraint: String.raw`sh:pattern "^[0-9]+\\.[0-9]+$"`,
    violates: '"abc"',
    satisfies: '"1.3"',
  },
  {
    component: 'InConstraintComponent',
    constraint: 'sh:in ("completed" "not-done")',
    violates: '"pending"',
    satisfies: '"not-done"',
  },
  {
    component: 'NodeKindConstraintComponent',
    constraint: 'sh:nodeKind sh:IRI',
    violates: '"a string, not a reference"',
    satisfies: 'ex:other',
  },
  {
    component: 'OrConstraintComponent',
    constraint: 'sh:or ( [ sh:datatype xsd:date ] [ sh:datatype xsd:dateTime ] )',
    violates: '"2024-10-15"',
    satisfies: '"2024-10-15"^^xsd:date',
  },
];

describe('evaluate', () => {
  describe.each(PAIRS.map((pair) => [pair.component, pair] as const))('sh:%s', (component, { constraint, violates, satisfies }) => {
    const iri = `${SH}${component}`;

    it('rejects the violating record on exactly this component', async () => {
      const report = engineOver(shape(constraint), thing(violates));

      expect(report.conforms).toBe(false);
      expect(report.results.map((r) => r.sourceConstraintComponent)).toEqual([iri]);
      expect(report.results[0]).toMatchObject({ focusNode: `${EX}s`, path: `${EX}p` });
      expect(tuplesOf(report)).toEqual(oracleTuplesOf(await oracleOver(shape(constraint), thing(violates))));
    });

    it('accepts the near miss, having evaluated it', async () => {
      const report = engineOver(shape(constraint), thing(satisfies));

      expect(report.results).toEqual([]);
      expect(report.evaluated).toBeGreaterThan(0);
      expect(report.conforms).toBe(true);
      expect((await oracleOver(shape(constraint), thing(satisfies))).conforms).toBe(true);
    });
  });

  describe('sh:datatype on an ill-formed literal', () => {
    // The datatype IRI is right and the lexical form is not. A check that
    // compares datatype IRIs passes this, and it is the case the routed writer
    // produces for `administrationDate: "yesterday"`.
    it('rejects "yesterday"^^xsd:dateTime', async () => {
      const data = thing('"yesterday"^^xsd:dateTime');
      const report = engineOver(shape('sh:datatype xsd:dateTime'), data);

      expect(report.results.map((r) => r.sourceConstraintComponent))
        .toEqual([`${SH}DatatypeConstraintComponent`]);
      expect(tuplesOf(report))
        .toEqual(oracleTuplesOf(await oracleOver(shape('sh:datatype xsd:dateTime'), data)));
    });

    it('rejects it through sh:or too, as one result on the or', async () => {
      // The member shapes' own failures stay inside the disjunction: the
      // oracle reports one OrConstraintComponent result, not two datatype ones.
      const constraint = 'sh:or ( [ sh:datatype xsd:date ] [ sh:datatype xsd:dateTime ] )';
      const data = thing('"yesterday"^^xsd:dateTime');
      const report = engineOver(shape(constraint), data);

      expect(report.results.map((r) => r.sourceConstraintComponent)).toEqual([`${SH}OrConstraintComponent`]);
      expect(tuplesOf(report)).toEqual(oracleTuplesOf(await oracleOver(shape(constraint), data)));
    });
  });

  describe('sh:in over IRIs', () => {
    // `cascade:dataProvenance` is an IRI list. A literal spelled like a member
    // is not a member, and the engine has to compare terms, not strings.
    const constraint = 'sh:in (ex:Completed ex:NotDone)';

    it('rejects a member spelled as a literal', async () => {
      const report = engineOver(shape(constraint), thing(`"${EX}Completed"`));

      expect(report.results.map((r) => r.sourceConstraintComponent)).toEqual([`${SH}InConstraintComponent`]);
      expect(tuplesOf(report))
        .toEqual(oracleTuplesOf(await oracleOver(shape(constraint), thing(`"${EX}Completed"`))));
    });

    it('accepts a member', () => {
      const report = engineOver(shape(constraint), thing('ex:NotDone'));

      expect(report.results).toEqual([]);
      expect(report.evaluated).toBeGreaterThan(0);
    });
  });
});
