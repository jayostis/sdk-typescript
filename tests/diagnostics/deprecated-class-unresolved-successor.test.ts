/**
 * `build-record-types.mjs` reports a deprecated record class whose
 * `rdfs:seeAlso` resolves to no live record class, and only that.
 *
 * A DEPRECATED CLASS IS READ, NOT WRITTEN, and reading one means knowing what
 * superseded it — that is what `supersedes` in the generated table is built
 * from. The loop that builds it does nothing on a miss, so a deprecated class
 * pointing nowhere, or at a class that is not in the population, or at nothing
 * at all, simply fails to appear anywhere: a reader meeting a pod full of it
 * has no forwarding address and no report that one was ever missing.
 *
 * ONE RESOLVING TARGET IS ENOUGH. `clinical:CoverageRecord` names both
 * `coverage:InsurancePlan` and `fhir:Coverage`; the second is documentation,
 * the first is the successor, and a rule that demanded every target resolve
 * would report a class whose forwarding address is fine.
 *
 * SCOPED TO THE RECORD POPULATION. A deprecated property has no successor to
 * resolve and nothing reads it by class; a deprecated class spec never marked
 * as record-bearing is outside the table's business either way.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  CLINICAL, cleanupScratch, context, findingsOf, klass, ontology, property, rowsFor, runGenerator,
  scratchData, type Finding,
} from './scratch.js';

const CODE = 'deprecated-class-unresolved-successor';

let rows: Finding[];

beforeAll(() => {
  const data = scratchData({
    ontologies: {
      clinical: [
        ontology(CLINICAL),
        klass(`${CLINICAL}Live`, { record: true }),
        // Points at a class that does not exist.
        klass(`${CLINICAL}Dangling`, { record: true, deprecated: true, seeAlso: [`${CLINICAL}Vanished`] }),
        // Points at nothing.
        klass(`${CLINICAL}Silent`, { record: true, deprecated: true }),
        // The CoverageRecord shape: one live successor and one external link.
        klass(`${CLINICAL}Forwarded`, {
          record: true,
          deprecated: true,
          seeAlso: [`${CLINICAL}Live`, 'http://hl7.org/fhir/Coverage'],
        }),
        // Deprecated, but not a class.
        property(`${CLINICAL}oldProperty`, { deprecated: true }),
        // Deprecated, a class, and never marked record-bearing.
        klass(`${CLINICAL}Unmarked`, { deprecated: true }),
      ],
    },
    contexts: {
      clinical: context({ Live: 'clinical:Live' }),
    },
  });

  runGenerator('build-record-types', { CASCADE_SPEC_DATA_DIR: data });
  rows = rowsFor(findingsOf(data, 'build-record-types'), CODE);
}, 60_000);

afterAll(cleanupScratch);

describe(CODE, () => {
  it('reports the class whose only target resolves to nothing, and the class with no target', () => {
    expect(rows.map((row) => row.subject).sort()).toEqual([
      `${CLINICAL}Dangling`,
      `${CLINICAL}Silent`,
    ]);
  });

  it('reports neither a class with one resolving target, a deprecated property, nor an unmarked class', () => {
    const subjects = rows.map((row) => row.subject);

    expect(subjects).not.toContain(`${CLINICAL}Forwarded`);
    expect(subjects).not.toContain(`${CLINICAL}oldProperty`);
    expect(subjects).not.toContain(`${CLINICAL}Unmarked`);
  });
});
