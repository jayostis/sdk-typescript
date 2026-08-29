/**
 * core v3.6 — `cascade:dataAbsentReason`: why a record's primary VALUE is
 * absent, bound to the 15 codes of the HL7 data-absent-reason code system.
 *
 * One describe per fixture. Its title spells the fixture's description out as a
 * literal, so the file and the test output both read as the corpus does without
 * anyone loading a fixture to find out; the first `it` is what keeps that
 * literal honest, comparing it against what the fixture actually says.
 *
 * Where the fixture is serialized correctly today, it is asked two things: what
 * this SDK WRITES, and what verdict that output EARNS from spec's shapes. The
 * second is a three-way agreement — SDK, shapes, and the fixture's declared
 * `shouldAccept` — so a failure says they disagree, not which one is wrong.
 *
 * absent-003 is asked a third: what this SDK READS BACK. Arity is that
 * fixture's entire claim, and a claim about arity that only ever asks the
 * serializer is half a claim. The writer and the reader keep their 0..*
 * fields in two separate tables — `MULTI_VALUE_FIELDS` in
 * turtle-serializer.ts and another of the same name in turtle-parser.ts —
 * and nothing but a round trip asks them the same question.
 *
 * An EARNS question is only asked where the vendored shapes can actually answer
 * it. `shaclCheck` refuses a graph they are silent on rather than returning the
 * vacuous conforms:true silence produces, and absent-001 is such a graph: it
 * carries a `clinical:loincCode` triple no vendored shape constrains. Only
 * absent-002 is asked both questions here — see each describe below.
 *
 * Claims that hold only WHILE a defect exists are not on the shared branch;
 * they belong on that issue's work branch, committed red: #3, #4. This IS #2's
 * work branch, so absent-003's claims are here and they are red — see its
 * describe below.
 *
 * `parseTurtle` takes text, so the `serialize()` under test stays visible.
 * `shaclCheck` takes a record and serializes it itself.
 *
 * @see spec/ontologies/core/v1/core.ttl         cascade:dataAbsentReason
 * @see spec/ontologies/core/v1/core.shapes.ttl  cascade:DataAbsentReasonShape
 */

import { describe, it, expect } from 'vitest';
import { serialize } from '../../src/serializer/turtle-serializer.js';
import { deserializeOne } from '../../src/deserializer/turtle-parser.js';
import { loadCascadeRecordFixture } from '../support/fixtures.js';
import { cascade, parseTurtle, triples } from '../support/graph.js';
import { sh, shaclCheck } from '../support/shacl.js';
import type { CascadeRecord } from '../../src/models/common.js';

const absent001 = loadCascadeRecordFixture('absent-001');
const absent002 = loadCascadeRecordFixture('absent-002');
const absent003 = loadCascadeRecordFixture('absent-003');

/**
 * `CascadeRecord` does not declare `dataAbsentReason`. The property is
 * registered in `PROPERTY_PREDICATES` and owned by a term module, but no model
 * interface carries it yet, so the read below is widened HERE rather than cast
 * away — this file typechecks under tsconfig.typecheck.json, and an `any`
 * would switch that off for the one assertion that needs it most.
 */
type RecordWithAbsentReason = CascadeRecord & { dataAbsentReason?: string | string[] };

describe('absent-001 — Happy path: lab result with no value, carrying a ratified reason for the absence', () => {
  // `task.suite` is the enclosing describe. Asserting the title against the
  // fixture rather than repeating the string here keeps one copy of it, in the
  // place a reader sees first, and still fails if the corpus is reworded.
  it('is the fixture this file thinks it is', ({ task }) => {
    expect(task.suite?.name).toContain(absent001.description);
    expect(absent001.shouldAccept).toBe(true);
  });

  it('writes the reason as a single literal on the record subject', () => {
    const record = absent001.input;
    const node = parseTurtle(serialize(record)).namedNode(record.id);

    expect(node.out(cascade.dataAbsentReason).values).toEqual(['not-performed']);
  });

  // NO EARNS QUESTION, and it is the shapes rather than the SDK that cannot
  // answer it. `serialize()` writes this fixture's LOINC code as
  // `clinical:loincCode`, and tests/shapes/ vendors core and health only —
  // health.shapes.ttl constrains `health:testCode` on LabResultRecordShape and
  // `cascade:loincCode` on DailyVitalReadingShape, so no vendored shape has an
  // sh:path this triple matches.
  //
  // `expect(report.results).toEqual([])` therefore used to assert the absence
  // of violations no shape in the graph could have raised — a pass that was
  // three-way for three of the four data triples and silent about the fourth,
  // which is exactly the vacuous verdict this file's EARNS question exists to
  // be the opposite of. `assertCovered` now refuses the graph outright; the
  // refusal is pinned in tests/support/shacl.test.ts.
  //
  // What it also hid is worth recording: absent-001.json's expectedOutput.turtle
  // declares `health:loincCode`, the SDK writes `clinical:loincCode`, and
  // spec/ontologies/clinical/v1/clinical.shapes.ttl is the only ontology that
  // declares an sh:path for either spelling — `clinical:loincCode`. Nothing in
  // this repo can settle which side changes.
  //
  // Restoring the question needs one of: clinical.shapes.ttl added to
  // tests/shapes/vendored.json, or the fixture and the SDK agreeing on a
  // predicate the vendored shapes already constrain.
});

describe('absent-002 — Negative: raw HL7 v3 NullFlavor code written straight into cascade:dataAbsentReason', () => {
  it('is the fixture this file thinks it is', ({ task }) => {
    expect(task.suite?.name).toContain(absent002.description);
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

describe('absent-003 — Negative: two cascade:dataAbsentReason values on one record', () => {
  // Identity only. BOTH claims this fixture would otherwise carry are red at
  // HEAD, and for ONE cause — #2: `dataAbsentReason` here is an array, which
  // `emitField` matches under no branch, so serialize() writes no triple at all.
  //
  //   WRITES — that output IS the defect.
  //   EARNS  — red for the same cause, not independently. The shape is
  //            sh:targetSubjectsOf cascade:dataAbsentReason, so with no triple
  //            it targets nothing, shaclCheck returns conforms:true, and the
  //            sh:maxCount violation is unobservable until #2 emits the values.
  //
  // So the verdict test goes where the writes test already went: #2's work
  // branch, committed red. That is this file's own rule at the top, applied to
  // the second half as well as the first — a suite that is red on a defect it
  // has declared out of scope cannot tell you anything new when it goes red.
  it('is the fixture this file thinks it is', ({ task }) => {
    expect(task.suite?.name).toContain(absent003.description);
    expect(absent003.shouldAccept).toBe(false);
  });

  it('writes both reasons to the graph', () => {
    // RED at HEAD: `.values` is `[]`. Both reasons are dropped, and dropping
    // them is not a lenient reading of the cardinality rule — it is the writer
    // deciding what the validator gets to see.
    const record = absent003.input;
    const node = parseTurtle(serialize(record)).namedNode(record.id);

    expect(node.out(cascade.dataAbsentReason).values).toEqual(['not-asked', 'asked-unknown']);
  });

  it('reads both reasons back off the graph it just wrote', () => {
    // The write side and the read side resolve arity from separate tables, so
    // emitting both values does not by itself mean both survive a round trip:
    // `dataAbsentReason` reaching turtle-serializer.ts's MULTI_VALUE_FIELDS and
    // not turtle-parser.ts's makes this the first field where the two disagree.
    //
    // That is #2's defect relocated, not removed. The reader keeps the first
    // triple, re-serializing what came back writes ONE reason, and
    // cascade:DataAbsentReasonShape — sh:maxCount 1 — again finds nothing to
    // violate, so an incomplete record earns a clean verdict from the other end.
    const parsed = deserializeOne<RecordWithAbsentReason>(
      serialize(absent003.input),
      absent003.input.type,
    );

    expect(parsed?.dataAbsentReason).toEqual(['not-asked', 'asked-unknown']);
  });

  it('earns the verdict the fixture declares, from the cardinality rule', async () => {
    // RED at HEAD as `expected true to be false`, and that reads as the whole
    // defect: cascade:DataAbsentReasonShape is sh:targetSubjectsOf
    // cascade:dataAbsentReason, so with no triple written it targets nothing,
    // has nothing to violate, and reports conforms:true — a record missing half
    // its data, carrying a clean bill of health.
    //
    // `toHaveLength(1)` and not more: the shape's sh:in
    // (tests/shapes/core.shapes.ttl:693) admits both 'not-asked' and
    // 'asked-unknown', so sh:maxCount is the only rule left for this fixture to
    // break. A second violation would mean the values changed, not the writer.
    const report = await shaclCheck(absent003.input);

    expect(report.conforms).toBe(absent003.shouldAccept);
    expect(report.results).toHaveLength(1);

    const [violation] = report.results;
    expect(violation?.sourceConstraintComponent.value).toBe(sh.MaxCountConstraintComponent?.value);
    expect(violation?.path.value).toBe(cascade.dataAbsentReason?.value);
  });

  it('serializes to the graph the fixture expects', () => {
    // The two dropped triples are the ONLY disagreement with the fixture's own
    // expectedOutput — measured -2 +0 — so once they are emitted the graphs are
    // identical, and this is what says the fix added nothing else.
    //
    // `triples()` and not the Turtle text: the fixture writes an object list
    // (`cascade:dataAbsentReason "not-asked", "asked-unknown"`) and a repeated
    // predicate is the same graph in different bytes. absent-003 carries no
    // blank nodes, which is what makes the comparison sound here.
    expect(triples(serialize(absent003.input))).toEqual(triples(absent003.expectedOutput.turtle));
  });
});
