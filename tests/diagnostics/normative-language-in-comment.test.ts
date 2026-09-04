/**
 * `build-spec-data.mjs` reports an `rdfs:comment` that carries uppercase
 * RFC 2119 language, and only that.
 *
 * THE COMMENT IS THE ONLY PLACE SOME RULES ARE WRITTEN. `build-spec-data`
 * drops `rdfs:comment` from the shipped artifact on purpose — prose no engine
 * reads, a quarter of the payload — and for a rule stated only there, dropping
 * the prose is where the last trace of it goes. A finding is what keeps the
 * fact that a machine-readable form is wanted from going with it.
 *
 * UPPERCASE ONLY, because that is what RFC 2119 says: the keywords are the
 * capitalised ones, and "readers should prefer" is ordinary English. One row
 * per subject, because the unit of work is the subject — two comments on one
 * property are one rule wanting a form, not two. A blank node has no IRI to
 * name and nothing a reader could look up, so it produces nothing.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  CASCADE, cleanupScratch, findingsOf, rowsFor, runGenerator, scratchCheckout, scratchDir, type Finding,
} from './scratch.js';

const CODE = 'normative-language-in-comment';

let rows: Finding[];

beforeAll(() => {
  const checkout = scratchCheckout({
    turtle: {
      core: `cascade:alpha a owl:DatatypeProperty ;
    rdfs:comment "Readers MUST accept this form."@en ;
    rdfs:comment "Writers MUST NOT emit it and SHALL reject it."@en .

cascade:beta a owl:DatatypeProperty ;
    rdfs:comment "readers should prefer this form"@en .

cascade:gamma a owl:Class ;
    rdfs:subClassOf [ a owl:Restriction ; rdfs:comment "This restriction MUST hold."@en ] .
`,
    },
  });
  const data = scratchDir();

  runGenerator('build-spec-data', { CASCADE_SPEC_DIR: checkout, CASCADE_SPEC_DATA_DIR: data });
  rows = rowsFor(findingsOf(data, 'build-spec-data'), CODE);
}, 60_000);

afterAll(cleanupScratch);

describe(CODE, () => {
  it('reports the subject once, however many of its comments carry a keyword', () => {
    expect(rows.map((row) => row.subject)).toEqual([`${CASCADE}alpha`]);
  });

  it('carries the text the keyword was found in', () => {
    // Both of alpha's comments say MUST, so whichever one the row carries —
    // or both — matches.
    expect(JSON.stringify(rows[0]?.text)).toMatch(/\bMUST\b/);
  });

  it('reports neither a lowercase "should" nor a comment on a blank node', () => {
    expect(rows.some((row) => row.subject === `${CASCADE}beta`)).toBe(false);
    expect(rows.some((row) => row.subject.startsWith('_:'))).toBe(false);
  });
});
