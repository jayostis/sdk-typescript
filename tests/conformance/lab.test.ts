/**
 * health v2.7 — `health:interpretationSourceCode`: the source's own verbatim
 * code for an interpretation whose ratified reading is carried on
 * `health:interpretation` beside it.
 *
 * One describe per fixture. Its title spells the fixture's description out as a
 * literal, so the file and the test output both read as the corpus does without
 * anyone loading a fixture to find out; the first `it` is what keeps that
 * literal honest, comparing it against what the fixture actually says.
 *
 * Only `lab-013` so far, which is the fixture #15 is about. The rest of the
 * `lab-*` family has no conformance coverage yet — `tests/serializer.test.ts`
 * loops over it asserting only that the output is non-empty and carries
 * prefixes — and this file is where each of them belongs when someone writes
 * the claim it makes.
 *
 * lab-013 is asked two things: what this SDK WRITES, and what it READS BACK.
 * Both are one claim and it is about ARITY. `health:LabResultRecordShape` caps
 * `health:interpretationSourceCode` at `sh:maxCount 1`, and two is exactly why
 * both values have to be written: a shape can only judge what reached the
 * graph, so a writer that keeps the first hands the validator nothing left to
 * violate and gets back a clean verdict on incomplete data. The reader is asked
 * separately because it resolves arity from a table of its own — see below.
 *
 * NOT asserted here: that `serialize()` reproduces `expectedOutput.turtle`.
 * lab-013 still differs from it for a reason that is not this issue's (#7), and
 * claiming the whole graph would either fail for that reason or quietly encode
 * a second fix. The two source-code triples are what this file is about.
 *
 * `parseTurtle` takes text, so the `serialize()` under test stays visible.
 *
 * @see spec/ontologies/health/v1/health.ttl        health:interpretationSourceCode
 * @see spec/ontologies/health/v1/health.shapes.ttl health:LabResultRecordShape
 * @see tests/terms/interpretation-source-code.test.ts  the same claim, pure
 */

import { describe, it, expect } from 'vitest';

import { serialize } from '../../src/serializer/turtle-serializer.js';
import { deserializeOne } from '../../src/deserializer/turtle-parser.js';
import { loadCascadeRecordFixture } from '../support/fixtures.js';
import { health, parseTurtle } from '../support/graph.js';
import type { LabResult } from '../../src/models/lab-result.js';

const lab013 = loadCascadeRecordFixture('lab-013');

describe('lab-013 — Negative: two health:interpretationSourceCode values on one record', () => {
  // `task.suite` is the enclosing describe. Asserting the title against the
  // fixture rather than repeating the string here keeps one copy of it, in the
  // place a reader sees first, and still fails if the corpus is reworded.
  it('is the fixture this file thinks it is', ({ task }) => {
    expect(task.suite?.name).toContain(lab013.description);
    expect(lab013.shouldAccept).toBe(false);
  });

  it('writes both source codes on the record subject', () => {
    // In the order given. Two codes for one interpretation is a merge artefact
    // and the corpus says so, but which of them the merge kept is information
    // the writer does not get to discard on the shapes' behalf.
    const record = lab013.input;
    const node = parseTurtle(serialize(record)).namedNode(record.id);

    expect(node.out(health.interpretationSourceCode).values).toEqual(['ZQ7', 'HIGH-LOCAL']);
  });

  it('reads both source codes back off the graph it just wrote', () => {
    // The writer and the reader resolve arity from separate tables, both named
    // MULTI_VALUE_FIELDS — one in turtle-serializer.ts, one in
    // turtle-parser.ts. A field in the first and not the second survives being
    // written and is collapsed on the way back, so re-serializing what came
    // back writes a single code that sh:maxCount 1 has nothing to object to:
    // the same clean verdict on incomplete data, arriving from the other end.
    const parsed = deserializeOne<LabResult>(
      serialize(lab013.input),
      lab013.input.type,
    );

    expect(parsed?.interpretationSourceCode).toEqual(['ZQ7', 'HIGH-LOCAL']);
  });

  // NO EARNS QUESTION, and #15 is not what blocks it. `health.shapes.ttl` does
  // declare the rule this fixture exists to break — `sh:path
  // health:interpretationSourceCode ; sh:maxCount 1`, at
  // tests/shapes/health.shapes.ttl:979 — so once both codes are written the
  // verdict is there to be had. What stops `shaclCheck` reaching it is the
  // record's OTHER two triples: `serialize()` writes lab-013's value and unit
  // as `clinical:value` / `clinical:unit` where the fixture and the vendored
  // shapes both say `health:value` / `health:unit`
  // (tests/shapes/health.shapes.ttl:1640, :1648), and no vendored shape
  // declares an sh:path for the clinical: spelling. Measured:
  //
  //   Error: shaclCheck cannot judge the triples on clinical:value,
  //   clinical:unit: no shape in core.shapes.ttl or health.shapes.ttl declares
  //   sh:path for them [...]
  //
  // That is the same predicate disagreement as the rest of lab-013's residual
  // diff, and it is #7's, not this issue's. Asserting the refusal instead would
  // be a claim that holds only WHILE that defect does, which belongs on #7's
  // branch rather than merged from here.
  //
  // Restoring the question needs one of: `serialize()` writing health:value /
  // health:unit for a LabResultRecord (#7), or clinical.shapes.ttl added to
  // tests/shapes/vendored.json. Either one, and this becomes the same three-way
  // agreement absent-003 gets — SDK, shapes, and the fixture's own
  // `shouldAccept: false` — with `sh:maxCount` the one violation reported.
});
