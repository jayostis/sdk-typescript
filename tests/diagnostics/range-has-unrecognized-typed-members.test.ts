/**
 * `build-terms.mjs` reports a range class whose members are typed to it
 * directly and in no recognised form, whether or not any term reaches it.
 *
 * MEMBERS ARE PUBLISHED TWO WAYS AND THIS IS A THIRD. `cascade:DataProvenance`
 * declares its values as subclasses; `cascade:ConsentScope` declares them as
 * `owl:NamedIndividual`s typed again to the range; `membersOf` recognises
 * both. `health:WalkingSteadinessLevel`'s four members carry only the range
 * type — no `owl:NamedIndividual`, no `rdfs:subClassOf` — so the value set
 * resolver sees a class with no members at all. Today nothing notices,
 * because the context's `walkingSteadiness` term happens to resolve to an
 * unrelated `xsd:string` range and the class is never looked up; the day that
 * naming mismatch is fixed it would land in `unclassifiableRanges` asking spec
 * to publish members spec already published. The report has to come from a
 * sweep of the ontology, not from the term lookup, or it comes too late.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  HEALTH, OWL_NAMED_INDIVIDUAL, XSD_STRING, cleanupScratch, context, findingsOf, individual, klass,
  ontology, property, rowsFor, runGenerator, scratchData, type Finding,
} from './scratch.js';

const CODE = 'range-has-unrecognized-typed-members';

let rows: Finding[];

beforeAll(() => {
  const data = scratchData({
    ontologies: {
      health: [
        ontology(HEALTH),
        // The WalkingSteadinessLevel form: members typed to the range and nothing else.
        klass(`${HEALTH}Plain`),
        property(`${HEALTH}plainLevel`, { kind: 'Object', range: `${HEALTH}Plain` }),
        individual(`${HEALTH}PlainLow`, `${HEALTH}Plain`),
        individual(`${HEALTH}PlainHigh`, `${HEALTH}Plain`),
        // The ConsentScope form.
        klass(`${HEALTH}Named`),
        property(`${HEALTH}namedLevel`, { kind: 'Object', range: `${HEALTH}Named` }),
        individual(`${HEALTH}NamedA`, OWL_NAMED_INDIVIDUAL, `${HEALTH}Named`),
        // The DataProvenance form.
        klass(`${HEALTH}Sub`),
        property(`${HEALTH}subLevel`, { kind: 'Object', range: `${HEALTH}Sub` }),
        klass(`${HEALTH}SubA`, { subClassOf: [`${HEALTH}Sub`] }),
        // The one property a context reaches, so the context has a term.
        property(`${HEALTH}note`, { range: XSD_STRING }),
      ],
    },
    contexts: {
      health: context({ note: { '@id': 'health:note', '@type': 'xsd:string' } }),
    },
  });

  runGenerator('build-terms', { CASCADE_SPEC_DATA_DIR: data });
  rows = rowsFor(findingsOf(data, 'build-terms'), CODE);
}, 60_000);

afterAll(cleanupScratch);

describe(CODE, () => {
  it('reports the range with plain-typed members, naming them, and neither recognised form', () => {
    expect(rows.map((row) => row.subject)).toEqual([`${HEALTH}Plain`]);
    expect([...(rows[0]?.members as string[])].sort()).toEqual([
      `${HEALTH}PlainHigh`,
      `${HEALTH}PlainLow`,
    ]);
  });
});
