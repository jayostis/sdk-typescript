/**
 * Loading conformance fixtures.
 *
 * Deliberately free of `n3`, `clownface` and `rdf-validate-shacl`, so a suite
 * that only reads fixtures does not pay for them. Measured at import: this
 * module 27 ms, `graph.ts` ~500 ms to load the RDF libraries, `shacl.ts` a
 * further ~350 ms to index the vendored shapes.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import type { CascadeEntity, CascadeRecord } from '../../src/models/common.js';

const fixturesDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../conformance/fixtures');

/**
 * A conformance fixture, whatever kind of subject it carries.
 *
 * `input` is a `CascadeEntity` because not every fixture is a health record —
 * `pod-001` is an `ldp:BasicContainer` with no `dataProvenance`, a directory
 * listing rather than an observation.
 */
export interface Fixture {
  description: string;
  input: CascadeEntity;
  expectedOutput: { turtle: string };
  /** The verdict the corpus declares this input should earn. */
  shouldAccept: boolean;
}

/** A fixture whose input is a health record: `dataProvenance` and `schemaVersion` present. */
export interface CascadeRecordFixture extends Fixture {
  input: CascadeRecord;
}

export function loadFixture(id: string): Fixture {
  return JSON.parse(readFileSync(resolve(fixturesDir, `${id}.json`), 'utf-8')) as Fixture;
}

/** Load a fixture, checking rather than asserting that its input is a health record. */
export function loadCascadeRecordFixture(id: string): CascadeRecordFixture {
  const fixture = loadFixture(id);
  const { dataProvenance, schemaVersion } = fixture.input;

  if (!dataProvenance || !schemaVersion) {
    throw new Error(
      `${id} is not a record fixture — dataProvenance=${dataProvenance}, `
      + `schemaVersion=${schemaVersion}. Use loadFixture() for pod and container fixtures.`,
    );
  }
  return fixture as CascadeRecordFixture;
}
