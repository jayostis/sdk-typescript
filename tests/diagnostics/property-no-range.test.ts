/**
 * `build-terms.mjs` reports an ontology property with no `rdfs:range`, and
 * says which context terms reach it.
 *
 * THE ONTOLOGY IS THE ONLY STATEMENT OF WHAT A VALUE LOOKS LIKE. The contexts
 * say what a key means; the ranges say what its values are; a property with
 * neither is one no writer can type and no shape can judge. `reachedBy` is the
 * blast radius: a property some term resolves to is a gap a record can fall
 * into today, and one no term reaches is spec's to tidy at leisure. Both are
 * reported — an empty `reachedBy` is an answer, not an omission.
 *
 * A DEPRECATED PROPERTY IS NOT REPORTED. Nothing should write it, so nothing
 * needs its range; asking spec to type a property it has told everyone to
 * stop using is work for nobody.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  CASCADE, XSD_STRING, cleanupScratch, context, findingsOf, ontology, property, rowsFor,
  runGenerator, scratchData, type Finding,
} from './scratch.js';

const CODE = 'property-no-range';

let rows: Finding[];

beforeAll(() => {
  const data = scratchData({
    ontologies: {
      core: [
        ontology(CASCADE),
        property(`${CASCADE}reached`),
        property(`${CASCADE}unreached`),
        property(`${CASCADE}annotated`, { kind: 'Annotation' }),
        property(`${CASCADE}retired`, { deprecated: true }),
        property(`${CASCADE}ranged`, { range: XSD_STRING }),
      ],
    },
    contexts: {
      core: context({
        reached: { '@id': 'cascade:reached', '@type': 'xsd:string' },
        ranged: { '@id': 'cascade:ranged', '@type': 'xsd:string' },
      }),
    },
  });

  runGenerator('build-terms', { CASCADE_SPEC_DATA_DIR: data });
  rows = rowsFor(findingsOf(data, 'build-terms'), CODE);
}, 60_000);

afterAll(cleanupScratch);

const row = (local: string): Finding | undefined => rows.find((r) => r.subject === `${CASCADE}${local}`);

describe(CODE, () => {
  it('reports every rangeless live property, annotation properties included, and no deprecated one', () => {
    expect(rows.map((r) => r.subject).sort()).toEqual([
      `${CASCADE}annotated`,
      `${CASCADE}reached`,
      `${CASCADE}unreached`,
    ]);
  });

  it('lists the term that reaches a property', () => {
    expect(row('reached')?.reachedBy).toHaveLength(1);
    expect(JSON.stringify((row('reached')?.reachedBy as unknown[])[0])).toContain('reached');
  });

  it('lists nothing for a property no term reaches', () => {
    expect(row('unreached')?.reachedBy).toEqual([]);
  });
});
