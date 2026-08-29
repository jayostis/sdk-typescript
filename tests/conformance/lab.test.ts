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
 * lab-013 is asked three things: what this SDK WRITES, what it READS BACK, and
 * what verdict the shapes give it. All three are one claim and it is about
 * ARITY. `health:LabResultRecordShape` caps `health:interpretationSourceCode`
 * at `sh:maxCount 1`, and two values is exactly why both have to be written: a
 * shape can only judge what reached the graph, so a writer that keeps the first
 * hands the validator nothing left to violate and gets back a clean verdict on
 * incomplete data.
 *
 * The verdict is askable at all because `clinical.shapes.ttl` is vendored.
 * Before it was, `serialize()` writing lab-013's value and unit as
 * `clinical:value` / `clinical:unit` put two predicates in the graph that no
 * loaded shape declared an `sh:path` for, and `assertCovered` refused the whole
 * record rather than return the vacuous `conforms: true` that silence produces.
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
import { validate } from '../../src/validator/index.js';
import { loadCascadeRecordFixture } from '../support/fixtures.js';
import { health, parseTurtle } from '../support/graph.js';
import { sh, shaclCheck } from '../support/shacl.js';
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
    // Asked separately from the write, because reading is where the loss used
    // to happen: the reader kept the first triple of any field it had no arity
    // entry for and dropped the rest in silence. Re-serializing what came back
    // then wrote a single code, and `sh:maxCount 1` had nothing left to object
    // to — the same clean verdict on incomplete data as above, arriving from
    // the other end.
    const parsed = deserializeOne<LabResult>(
      serialize(lab013.input),
      lab013.input.type,
    );

    expect(parsed?.interpretationSourceCode).toEqual(['ZQ7', 'HIGH-LOCAL']);
  });

  it('earns the verdict the fixture declares, from the maxCount rule', async () => {
    // The three-way agreement: this SDK writes both codes, the shape objects to
    // there being two, and the fixture's own `shouldAccept: false` says that is
    // the right answer. Any two of the three agreeing proves nothing — a writer
    // that dropped the second code would earn `conforms: true` here and look
    // exactly as correct.
    //
    // `sourceConstraintComponent` rather than `message`: the message is prose
    // spec is free to reword, the component is the rule.
    const report = await shaclCheck(lab013.input);

    expect(report.conforms).toBe(lab013.shouldAccept);
    expect(report.results).toHaveLength(1);

    const [violation] = report.results;
    expect(violation?.sourceConstraintComponent.value).toBe(sh.MaxCountConstraintComponent?.value);
    expect(violation?.path.value).toBe(health.interpretationSourceCode?.value);
  });

  it('reports the same violation through the SHIPPED validator', () => {
    // The SHACL verdict above is a TEST-TIME answer and cannot stand in for
    // this one. `rdf-validate-shacl` is a devDependency and the shapes are not
    // in package.json's `files`, so nothing a consumer installs can reach any
    // of it. `validate()` is the whole of what ships, and a record this SDK
    // writes and reads back faithfully is not helped by a rule only its own
    // test suite can apply.
    //
    // DELIBERATELY NOT asserted on `result.valid`. That is already `false`, for
    // reasons with nothing to do with this fixture: `validate()` requires
    // `resultValue` and `resultUnit`, which lab-013 spells `value` / `unit` and
    // which `health:LabResultRecordShape` gives no `sh:minCount` at all — and
    // absent-003 earns the IDENTICAL two errors while breaking an entirely
    // different rule. A vacuous REJECTION is as misleading as a vacuous
    // `conforms: true` and harder to spot, because the verdict agrees with
    // `shouldAccept` and looks like the shapes and the SDK saying the same
    // thing. Only the field named in the error tells them apart.
    const result = validate(lab013.input);

    expect(result.errors.map((e) => e.field)).toContain('interpretationSourceCode');
  });
});
