/**
 * The generic writer, against the corpus it has to reproduce.
 *
 * `convertToRdf` reads nothing but `src/spec-data/` and `src/record-types/`,
 * both generated from what spec publishes. No model, no term module, no
 * predicate table. This compares its output to a fixture's own
 * `expectedOutput.turtle` as GRAPHS, canonically — the fixtures were written
 * against the hand-rolled serializer, so agreement is the claim that the
 * published data says the same thing the code did.
 *
 * The thin slice this replaces reached 13 of 15 triples and stopped, on two
 * gaps in spec's contexts. Reading `rdfs:range` from the ontologies closes
 * both. That does not excuse the gaps — `jayostis/spec#46` and `#47` are filed
 * — it routes around them, using a fact spec has published all along.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import { convertToRdf } from '../../src/converter/to-rdf.js';
import { graphDifference, quadsFromTurtle } from '../support/graph.js';
import { loadFixture } from '../support/fixtures.js';

const fixturesDir = resolve(
  dirname(fileURLToPath(import.meta.url)), '../../../conformance/fixtures',
);

/** The N-Triples this writer produces, as quads. */
const quadsOf = (record: object) =>
  quadsFromTurtle(convertToRdf(record as Record<string, unknown>));

describe('imm-001, end to end from spec data', () => {
  const fixture = loadFixture('imm-001');

  it('produces the same graph as the fixture', async () => {
    // The whole claim, in one assertion. Compared canonically rather than
    // textually: the writers differ in prefix use, statement order and literal
    // spelling, and none of that is a difference in what was said.
    expect(
      await graphDifference(quadsOf(fixture.input), quadsFromTurtle(fixture.expectedOutput.turtle)),
      'convertToRdf disagrees with imm-001. Every difference is a finding: either the published '
      + 'data says something other than what the hand-rolled serializer wrote, or this writer '
      + 'reads it wrongly.',
    ).toBeNull();
  });

  it('types administrationDate, which the context alone cannot', () => {
    // `jayostis/spec#46`. The context gives this key no `@type`, so a
    // context-only converter writes `"2024-10-15T10:00:00Z"` untyped and
    // `health:ImmunizationRecordShape` reports a Violation whose message says
    // "an untyped or xsd:string literal is not either type". The ontology
    // declares `rdfs:range xsd:dateTime`.
    expect(convertToRdf(fixture.input as Record<string, unknown>))
      .toContain('^^<http://www.w3.org/2001/XMLSchema#dateTime>');
  });

  it('resolves the bare dataProvenance token to an absolute IRI', () => {
    // `jayostis/spec#47`. No context declares `@vocab`, so `"ClinicalGenerated"`
    // under `"@type": "@id"` has no resolution rule and a context-only
    // converter emits a relative IRI, which `sh:in (cascade:ClinicalGenerated …)`
    // rejects. The predicate's range is a class whose subclasses are the
    // permitted values.
    expect(convertToRdf(fixture.input as Record<string, unknown>))
      .toContain('<https://ns.cascadeprotocol.org/core/v1#ClinicalGenerated>');
  });

  it('writes the rdf:type triple, from the record type rather than a parameter', () => {
    // The thin slice dropped this: it took its vocabulary as an argument read
    // off the fixture, so it never knew the class. `recordTypeFor` answers it.
    expect(convertToRdf(fixture.input as Record<string, unknown>))
      .toContain('<https://ns.cascadeprotocol.org/health/v1#ImmunizationRecord>');
  });
});

describe('every immunization fixture', () => {
  // The routed type has four fixtures, and one agreeing is not evidence that
  // the published data reproduces the corpus.
  const ids = ['imm-001', 'imm-002', 'imm-003'];

  it.each(ids)('%s produces the same graph as the fixture', async (id) => {
    const fixture = loadFixture(id);

    expect(
      await graphDifference(quadsOf(fixture.input), quadsFromTurtle(fixture.expectedOutput.turtle)),
    ).toBeNull();
  });

  it('reads four fixtures, not zero', () => {
    // Two empty graphs are isomorphic, so a loader returning nothing would make
    // every assertion above pass.
    for (const id of ids) {
      expect(quadsOf(loadFixture(id).input).length, id).toBeGreaterThan(5);
    }
  });
});

describe('what it refuses', () => {
  const immunization = {
    id: 'urn:uuid:test',
    type: 'ImmunizationRecord',
    schemaVersion: '1.3',
  };

  it('refuses a record type spec does not declare', () => {
    expect(() => convertToRdf({ ...immunization, type: 'NotARecordType' }))
      .toThrow(/names no class spec declares/);
  });

  it('refuses a key no context defines, naming the key', () => {
    // Writing a guessed predicate would put a triple in a pod that no shape can
    // judge — the vacuous pass, created by the writer rather than found by it.
    expect(() => convertToRdf({ ...immunization, notAKey: 'x' }))
      .toThrow(/No context entry for "notAKey"/);
  });

  it('refuses a provenance value that is not a member of the set', () => {
    expect(() => convertToRdf({ ...immunization, dataProvenance: 'MadeItUp' }))
      .toThrow(/Cannot express "dataProvenance"/);
  });

  it('writes every value of a repeated field, not the first', () => {
    // Faithful first, judged second. A writer that kept one would hand the
    // validator a record with nothing left to violate.
    const written = convertToRdf({ ...immunization, dataAbsentReason: ['not-asked', 'asked-unknown'] });

    expect(written).toContain('"not-asked"');
    expect(written).toContain('"asked-unknown"');
  });
});
