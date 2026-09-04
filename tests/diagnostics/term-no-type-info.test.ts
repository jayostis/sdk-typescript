/**
 * `build-terms.mjs` reports a property term that neither the context nor the
 * ontology types, and leaves a class term alone.
 *
 * A TERM WITH NO TYPE INFORMATION WRITES AN UNTYPED LITERAL. The context gives
 * it no `@type`, the ontology gives its predicate no `rdfs:range`, and the
 * generated table carries a bare `predicate` — so a converter following it
 * has nothing to say about the value's form and the shapes reject what it
 * wrote (the `administrationDate` case, `jayostis/spec#46`). A class term has
 * no value to type — a context names a class so a record can say what it is —
 * so the same silence there is not a gap.
 *
 * ONE ROW PER PREDICATE, not per context: the same term redeclared in a
 * second context is the same missing fact, and a worklist with it twice is a
 * worklist somebody stops reading.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  CASCADE, CLINICAL, XSD_STRING, cleanupScratch, context, findingsOf, klass, ontology, property,
  rowsFor, runGenerator, scratchData, type Finding,
} from './scratch.js';

const CODE = 'term-no-type-info';

let rows: Finding[];

beforeAll(() => {
  const data = scratchData({
    ontologies: {
      core: [
        ontology(CASCADE),
        property(`${CASCADE}noteworthy`, { kind: 'Annotation' }),
        property(`${CASCADE}typed`, { range: XSD_STRING }),
        klass(`${CASCADE}Thing`),
      ],
      clinical: [
        ontology(CLINICAL),
        property(`${CLINICAL}a`, { range: XSD_STRING }),
        property(`${CLINICAL}b`, { range: XSD_STRING }),
      ],
    },
    contexts: {
      core: context({
        noteworthy: 'cascade:noteworthy',
        typed: { '@id': 'cascade:typed', '@type': 'xsd:string' },
        Thing: 'cascade:Thing',
      }),
      // The same untyped term again, under a context whose majority is
      // clinical so the two contexts cannot tie on the cascade namespace.
      clinical: context({
        noteworthy: 'cascade:noteworthy',
        a: { '@id': 'clinical:a', '@type': 'xsd:string' },
        b: { '@id': 'clinical:b', '@type': 'xsd:string' },
      }),
    },
  });

  runGenerator('build-terms', { CASCADE_SPEC_DATA_DIR: data });
  rows = rowsFor(findingsOf(data, 'build-terms'), CODE);
}, 60_000);

afterAll(cleanupScratch);

describe(CODE, () => {
  it('reports the untyped property term once, by its predicate, and not the class term', () => {
    expect(rows.map((row) => row.subject)).toEqual([`${CASCADE}noteworthy`]);
  });
});

