/**
 * `build-terms.mjs` reports a range it can classify neither as a code list nor
 * as a structured class, and reports it whatever namespace the range lives in.
 *
 * A SPEC DEFECT IS A FINDING, NOT A BUILD FAILURE. Every row carries a
 * `location`, and for a range with no node in the graph the ontology file is
 * found by namespace — which has an answer only where spec ships an
 * `owl:Ontology` for it. A range under a namespace spec has not manifested
 * (`evidence:`, `workbench:`, a vocabulary not yet pinned) has no such file,
 * and the row is still owed: the context that reached the range is a file a
 * maintainer can open, and the alternative — a row with no location — is
 * refused by the recorder, turning the defect into a crashed generator with
 * neither the term table nor the findings file written.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  CASCADE, cleanupScratch, context, findingsOf, ontology, property, repoRoot, rowsFor,
  runGenerator, scratchData, type Finding,
} from './scratch.js';

const CODE = 'unclassifiable-range';

/** A Cascade namespace the fixture ships no `owl:Ontology` for. */
const EVIDENCE_ASSERTION = 'https://ns.cascadeprotocol.org/evidence/v1#Assertion';

/** The Turtle `core` was built from, as the manifest names it — not spelled here. */
const CORE_ONTOLOGY = (JSON.parse(readFileSync(join(repoRoot, 'spec-sources.json'), 'utf-8')) as
  Record<string, { ontology: string }>).core.ontology;

let rows: Finding[];

beforeAll(() => {
  const data = scratchData({
    ontologies: {
      core: [
        ontology(CASCADE),
        property(`${CASCADE}evidenceRef`, { kind: 'Object', range: EVIDENCE_ASSERTION }),
        property(`${CASCADE}unpopulated`, { kind: 'Object', range: `${CASCADE}Unpopulated` }),
      ],
    },
    contexts: {
      core: context({
        evidenceRef: { '@id': 'cascade:evidenceRef', '@type': '@id' },
        unpopulated: { '@id': 'cascade:unpopulated', '@type': '@id' },
      }),
    },
  });

  runGenerator('build-terms', { CASCADE_SPEC_DATA_DIR: data });
  rows = rowsFor(findingsOf(data, 'build-terms'), CODE);
}, 60_000);

afterAll(cleanupScratch);

describe(CODE, () => {
  it('locates a range in a namespace with no ontology by the context that reached it', () => {
    const row = rows.find((r) => r.subject === EVIDENCE_ASSERTION);

    expect(row, 'no row for the range outside every shipped ontology').toBeDefined();
    expect(row?.location).toEqual(['spec:contexts/v1/core.jsonld']);
    expect(row?.reachedBy).toEqual(['core:evidenceRef']);
  });

  it('locates a range in a shipped namespace by its ontology file', () => {
    const row = rows.find((r) => r.subject === `${CASCADE}Unpopulated`);

    expect(row, 'no row for the unpopulated Cascade class').toBeDefined();
    expect(row?.location).toEqual([`spec:${CORE_ONTOLOGY}`]);
  });
});
