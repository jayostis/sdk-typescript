/**
 * core v3.6 — `cascade:dataAbsentReason`: why a record's primary VALUE is
 * absent, bound to the 15 codes of the HL7 data-absent-reason code system.
 *
 * One describe per fixture, titled with the fixture's own description. Each
 * asks two things of it: what this SDK WRITES, and what verdict that output
 * EARNS from spec's shapes. The second is a three-way agreement — SDK, shapes,
 * and the fixture's declared `shouldAccept` — so a failure says they disagree,
 * not which one is wrong.
 *
 * Claims that hold only WHILE a defect exists are not here; they belong on that
 * issue's work branch, committed red: #2, #3, #4.
 *
 * `parseTurtle` takes text, so the `serialize()` under test stays visible.
 * `shaclCheck` takes a record and serializes it itself.
 *
 * @see spec/ontologies/core/v1/core.ttl         cascade:dataAbsentReason
 * @see spec/ontologies/core/v1/core.shapes.ttl  cascade:DataAbsentReasonShape
 */

import { describe, it, expect } from 'vitest';
import { serialize } from '../src/serializer/turtle-serializer.js';
import { cascade, loadCascadeRecordFixture, parseTurtle, sh, shaclCheck } from './support/rdf.js';

const absent001 = loadCascadeRecordFixture('absent-001');
const absent002 = loadCascadeRecordFixture('absent-002');
const absent003 = loadCascadeRecordFixture('absent-003');

describe(`absent-001 — ${absent001.description}`, () => {
  // Restating the description asserts nothing and breaks on an upstream
  // reword. Kept for legibility, cheap to delete.
  it('is the fixture this file thinks it is', () => {
    expect(absent001.description).toBe(
      'Happy path: lab result with no value, carrying a ratified reason for the absence',
    );
    expect(absent001.shouldAccept).toBe(true);
  });

  it('writes the reason as a single literal on the record subject', () => {
    const record = absent001.input;
    const node = parseTurtle(serialize(record)).namedNode(record.id);

    expect(node.out(cascade.dataAbsentReason).values).toEqual(['not-performed']);
  });

  it('earns the verdict the fixture declares', async () => {
    const report = await shaclCheck(absent001.input);

    expect(report.conforms).toBe(absent001.shouldAccept);
    expect(report.results).toEqual([]);
  });
});

describe(`absent-002 — ${absent002.description}`, () => {
  it('is the fixture this file thinks it is', () => {
    expect(absent002.description).toBe(
      'Negative: raw HL7 v3 NullFlavor code written straight into cascade:dataAbsentReason',
    );
    expect(absent002.shouldAccept).toBe(false);
  });

  it('writes the source code verbatim rather than guessing a mapping', () => {
    // "UNK" is a real code, but from v3-NullFlavor rather than the value set
    // this property is bound to. Mapping it (UNK -> unknown) is the importer's
    // job; the serializer writes what it was given and lets the shapes object.
    const record = absent002.input;
    const node = parseTurtle(serialize(record)).namedNode(record.id);

    expect(node.out(cascade.dataAbsentReason).values).toEqual(['UNK']);
  });

  it('earns the verdict the fixture declares, from the value-set rule', async () => {
    const report = await shaclCheck(absent002.input);

    expect(report.conforms).toBe(absent002.shouldAccept);
    expect(report.results).toHaveLength(1);

    const [violation] = report.results;
    expect(violation?.sourceConstraintComponent.value).toBe(sh.InConstraintComponent?.value);
    expect(violation?.path.value).toBe(cascade.dataAbsentReason?.value);
    expect(violation?.value.value).toBe('UNK');
  });
});

describe(`absent-003 — ${absent003.description}`, () => {
  // No "writes" test here on purpose: what this record serializes to IS the
  // defect in #2, so that claim is red today and lives on #2's work branch.
  it('is the fixture this file thinks it is', () => {
    expect(absent003.description).toBe(
      'Negative: two cascade:dataAbsentReason values on one record',
    );
    expect(absent003.shouldAccept).toBe(false);
  });

  it('earns the verdict the fixture declares, from the cardinality rule', async () => {
    const report = await shaclCheck(absent003.input);

    expect(report.conforms).toBe(absent003.shouldAccept);
    expect(report.results).toHaveLength(1);

    // Both codes here are ratified, so it is sh:maxCount that trips, not sh:in.
    const [violation] = report.results;
    expect(violation?.sourceConstraintComponent.value).toBe(sh.MaxCountConstraintComponent?.value);
    expect(violation?.path.value).toBe(cascade.dataAbsentReason?.value);
  });
});
