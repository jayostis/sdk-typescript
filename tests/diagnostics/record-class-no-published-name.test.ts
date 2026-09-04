/**
 * `build-record-types.mjs` reports a record class no context names, and still
 * names it by its local name.
 *
 * THE FALLBACK IS RIGHT AND THE SILENCE IS NOT. A context is a name→IRI
 * mapping and that is the whole of its job, so a record class with no entry
 * in any context is a class spec has not finished publishing (spec#50 gap 3a).
 * The local name is the correct stand-in and the table keeps using it; what
 * changes is that the build says so, because a fallback nobody reports is a
 * fallback that becomes permanent.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  CLINICAL, cleanupScratch, context, derivedClassesOf, findingsOf, klass, ontology, rowsFor,
  runGenerator, scratchData, type Finding,
} from './scratch.js';

const CODE = 'record-class-no-published-name';

let rows: Finding[];
let data: string;

beforeAll(() => {
  data = scratchData({
    ontologies: {
      clinical: [
        ontology(CLINICAL),
        klass(`${CLINICAL}Named`, { record: true }),
        klass(`${CLINICAL}Unnamed`, { record: true }),
      ],
    },
    contexts: {
      clinical: context({ Named: 'clinical:Named' }),
    },
  });

  runGenerator('build-record-types', { CASCADE_SPEC_DATA_DIR: data });
  rows = rowsFor(findingsOf(data, 'build-record-types'), CODE);
}, 60_000);

afterAll(cleanupScratch);

describe(CODE, () => {
  it('reports the class no context names, and not the one a context does', () => {
    expect(rows.map((row) => row.subject)).toEqual([`${CLINICAL}Unnamed`]);
  });

  it('still lets the table fall back to the local name', () => {
    const unnamed = derivedClassesOf(data).find((entry) => entry.iri === `${CLINICAL}Unnamed`);

    expect(unnamed?.name).toBe('Unnamed');
  });
});
