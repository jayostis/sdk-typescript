/**
 * `build-terms.mjs` reports a predicate this SDK registers that the ontology
 * does not declare, and says whose it is.
 *
 * `PROPERTY_PREDICATES` IS THE SDK'S CLAIM ABOUT SPEC, made by hand. A
 * predicate there that no ontology declares is either the SDK's invention
 * (`owner: sdk` — absent from every context too, so nothing upstream ever
 * named it) or a fact the two sides state differently (`owner: reconcile` — a
 * context publishes it, the ontology does not, and which of them is right is
 * a conversation rather than a fix).
 *
 * SCOPED TO THE NAMESPACES SPEC SHIPS AN ONTOLOGY FOR. `evidence:` and
 * `workbench:` are Cascade namespaces with no ontology in `spec-sources.json`,
 * and `foaf:` is not spec's at all; a predicate there is absent from the
 * ontology by construction, and reporting it would be twenty rows nobody can
 * close. An `owl:AnnotationProperty` is declared, whatever else it is not.
 *
 * `CASCADE_PREDICATES_FILE` points the generator at
 * `tests/diagnostics/fixtures/predicates.ts`, a stand-in in the real file's
 * shape, so every case above can be seeded.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  CASCADE, CLINICAL, XSD_STRING, cleanupScratch, context, findingsOf, ontology, property, rowsFor,
  runGenerator, scratchData, type Finding,
} from './scratch.js';

const CODE = 'declared-predicate-not-in-ontology';
const PREDICATES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/predicates.ts');

let rows: Finding[];

beforeAll(() => {
  const data = scratchData({
    ontologies: {
      core: [
        ontology(CASCADE),
        property(`${CASCADE}present`, { range: XSD_STRING }),
        property(`${CASCADE}annotated`, { kind: 'Annotation' }),
      ],
      clinical: [
        ontology(CLINICAL),
        property(`${CLINICAL}declared`, { range: XSD_STRING }),
      ],
    },
    contexts: {
      core: context({ present: { '@id': 'cascade:present', '@type': 'xsd:string' } }),
      clinical: context({
        declared: { '@id': 'clinical:declared', '@type': 'xsd:string' },
        contextOnly: { '@id': 'clinical:contextOnly', '@type': 'xsd:string' },
      }),
    },
  });

  runGenerator('build-terms', { CASCADE_SPEC_DATA_DIR: data, CASCADE_PREDICATES_FILE: PREDICATES });
  rows = rowsFor(findingsOf(data, 'build-terms'), CODE);
}, 60_000);

afterAll(cleanupScratch);

describe(CODE, () => {
  it('reports the SDK-only predicate as the SDK\'s and the context-published one as reconcile, and nothing else', () => {
    expect(Object.fromEntries(rows.map((row) => [row.subject, row.owner]))).toEqual({
      [`${CASCADE}ghost`]: 'sdk',
      [`${CLINICAL}contextOnly`]: 'reconcile',
    });
  });
});
