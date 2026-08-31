/**
 * coverage v1.7 — an insurance plan is `coverage:InsurancePlan`, written in the
 * `coverage:` vocabulary, and `clinical:CoverageRecord` is a spelling this SDK
 * READS and never writes.
 *
 * One describe per fixture. Its title spells the fixture's description out as a
 * literal, so the file and the test output both read as the corpus does without
 * anyone loading a fixture to find out; the first `it` is what keeps that
 * literal honest, comparing it against what the fixture actually says.
 *
 * WHY THE WHOLE GRAPH, AND NOT THE rdf:type TRIPLE. There are ten defects here,
 * not one: the class, seven predicates written `clinical:` where the corpus says
 * `coverage:`, `sourceRecordId` written `health:`, and two `xsd:dateTime`
 * effective dates the vocabulary ranges `xsd:date`. Nine of the ten are
 * invisible to a type assertion, and fixing only the class is WORSE than the
 * bug: `coverage:InsurancePlanShape` declares `sh:minCount 1` at `sh:Violation`
 * on `coverage:providerName`, `coverage:memberId` and `coverage:coverageType`,
 * so retyping the subject while still writing `clinical:` makes the shape see
 * the record for the first time and report three violations plus two datatype
 * violations, on a record whose data is correct. All ten move together.
 *
 * `clinical:payorName` IS NOT ONE OF THEM AND MUST NOT MOVE. coverage-001
 * expects it under `clinical:` on a `coverage:InsurancePlan` subject, because
 * coverage has no payor property distinct from `coverage:providerName`, which is
 * `sh:maxCount 1`. A blanket "clinical: -> coverage: for InsurancePlan" rewrite
 * passes coverage-002 and coverage-003 — neither carries the field — and breaks
 * coverage-001. That is why coverage-001 is asked the shapes question below
 * rather than left out: it is the fixture that catches an over-broad fix.
 *
 * Compared as a GRAPH, not as text. `p "a" ; p "b"` and `p "a", "b"` are the
 * same two triples and different bytes, and none of these fixtures carries a
 * blank node, which is what makes `triples()` sound here.
 *
 * `parseTurtle` and `triples` take text, so the `serialize()` under test stays
 * visible. `shaclCheck` takes a record and serializes it itself.
 *
 * @see spec/ontologies/coverage/v1/coverage.ttl         coverage:InsurancePlan
 * @see spec/ontologies/coverage/v1/coverage.shapes.ttl  coverage:InsurancePlanShape
 * @see spec/ontologies/clinical/v1/clinical.ttl:187     the deprecation, clinical v1.5
 */

import { describe, it, expect } from 'vitest';

import { serialize } from '../../src/serializer/turtle-serializer.js';
import { deserializeOne } from '../../src/deserializer/turtle-parser.js';
import { loadCascadeRecordFixture } from '../support/fixtures.js';
import { clinical, coverage, parseTurtle, rdf, triples } from '../support/graph.js';
import { sh, shaclCheck } from '../support/shacl.js';
import { NAMESPACES } from '../../src/vocabularies/namespaces.js';
import type { Coverage } from '../../src/models/coverage.js';

const coverage001 = loadCascadeRecordFixture('coverage-001');
const coverage002 = loadCascadeRecordFixture('coverage-002');
const coverage003 = loadCascadeRecordFixture('coverage-003');
const coverage004 = loadCascadeRecordFixture('coverage-004');

const INSURANCE_PLAN = `${NAMESPACES.coverage}InsurancePlan`;

describe('coverage-002 — Full fields: Coverage record with all available insurance fields including pharmacy benefits', () => {
  // `task.suite` is the enclosing describe. Asserting the title against the
  // fixture rather than repeating the string here keeps one copy of it, in the
  // place a reader sees first, and still fails if the corpus is reworded.
  it('is the fixture this file thinks it is', ({ task }) => {
    expect(task.suite?.name).toContain(coverage002.description);
    expect(coverage002.shouldAccept).toBe(true);
    expect(coverage002.input.type).toBe('InsurancePlan');
  });

  it('serializes to the graph the fixture expects', () => {
    // THE OUTER LOOP. Every one of the ten defects is a triple this comparison
    // disagrees about, and nothing else in this file subsumes it: the shapes
    // cannot catch a predicate written under a vocabulary they are silent on,
    // and the round trip cannot catch a spelling the reader maps back.
    expect(triples(serialize(coverage002.input))).toEqual(
      triples(coverage002.expectedOutput.turtle),
    );
  });

  it('types the subject as its own class, in its own vocabulary', () => {
    // Redundant against the graph comparison above and kept anyway, because it
    // is the one defect whose failure message is worth reading on its own: the
    // whole-graph diff is seventeen triples wide and says which line changed
    // rather than what went wrong.
    const record = coverage002.input;
    const node = parseTurtle(serialize(record)).namedNode(record.id);

    expect(node.out(rdf.type).values).toEqual([INSURANCE_PLAN]);
  });

  it('reads its own class back off the graph it just wrote', () => {
    // Serializing correctly while the reader maps the class back to the other
    // name reads a pod full of plans as coverage records, and re-serializing
    // what came back writes `health:status` where the plan had
    // `coverage:status` — the loss arriving from the other end, with the writer
    // now innocent.
    const parsed = deserializeOne<Coverage>(serialize(coverage002.input), 'InsurancePlan');

    expect(parsed?.type).toBe('InsurancePlan');
  });
});

describe('coverage-003 — Provenance: Coverage with EHRVerified provenance for dependent relationship', () => {
  it('is the fixture this file thinks it is', ({ task }) => {
    expect(task.suite?.name).toContain(coverage003.description);
    expect(coverage003.shouldAccept).toBe(true);
  });

  it('serializes to the graph the fixture expects', () => {
    // A second fixture asked the identical question, so the fix cannot be
    // shaped to one record. coverage-003 differs from coverage-002 in the
    // fields it OMITS — no planName, no effectiveEnd, no pharmacy benefits —
    // which is what a per-field special case would trip over.
    expect(triples(serialize(coverage003.input))).toEqual(
      triples(coverage003.expectedOutput.turtle),
    );
  });
});

describe('coverage-004 — Negative: Coverage missing required providerName field', () => {
  it('is the fixture this file thinks it is', ({ task }) => {
    expect(task.suite?.name).toContain(coverage004.description);
    expect(coverage004.shouldAccept).toBe(false);
  });

  it('writes every field it was handed, and invents no provider name', () => {
    // The half a type assertion would skip. `serialize()` writes what it is
    // given and lets the shapes object; a writer that filled in an empty
    // `coverage:providerName` to satisfy `sh:minCount` would earn the clean
    // verdict below on a record the corpus declares invalid.
    expect(triples(serialize(coverage004.input))).toEqual(
      triples(coverage004.expectedOutput.turtle),
    );
  });

  it('earns the verdict the fixture declares, from the minCount rule', async () => {
    // And the other half. The two are one claim: a record judged by no shape
    // conforms vacuously, and a record whose missing field was invented
    // conforms honestly — both report `conforms: true`, and only asking what
    // was WRITTEN as well as what was JUDGED tells them apart.
    //
    // The PATH is what makes this fixture's verdict this fixture's. A record
    // typed `clinical:CoverageRecord` is judged by `clinical:CoverageRecordShape`
    // instead, which requires the deprecated `clinical:providerName` — so the
    // report can carry a minCount violation naming the wrong predicate and look
    // exactly as correct while `coverage:InsurancePlanShape` never ran.
    //
    // `sourceConstraintComponent` rather than `message`: the message is prose
    // spec is free to reword, the component is the rule.
    const report = await shaclCheck(coverage004.input);

    expect(report.conforms).toBe(coverage004.shouldAccept);
    expect(report.results).toHaveLength(1);

    const [violation] = report.results;
    expect(violation?.sourceConstraintComponent.value).toBe(sh.MinCountConstraintComponent?.value);
    expect(violation?.path.value).toBe(coverage.providerName?.value);
  });
});

describe('coverage:InsurancePlanShape is a shape that actually evaluates', () => {
  /**
   * A plan whose `coverage:status` is outside the FHIR R4 fm-status binding.
   *
   * Built rather than loaded: no fixture carries an invalid status, and the
   * point of this record is that it is the one thing a live constraint can
   * report and a skipped constraint cannot.
   */
  function planWithStatus(status: string): Coverage {
    return {
      ...(coverage003.input as Coverage),
      id: 'urn:uuid:c0vr-banana-aaaa-bbbb-ccccddddeeee',
      status,
    } as Coverage;
  }

  it('judges coverage-001 AS AN INSURANCE PLAN, and finds nothing wrong with it', async () => {
    // coverage-001 is here for two reasons. It is the only fixture carrying
    // `clinical:payorName`, so a fix that rewrote every `clinical:` predicate
    // on an InsurancePlan turns it red — and it is the only one carrying
    // `sourceRecordId`, which is written `health:` today and which coverage
    // gives its own spelling. Both are single-fixture defects and neither is
    // visible in coverage-002 or -003.
    //
    // `assertCovered` inside `shaclCheck` is what makes a clean verdict worth
    // anything: it refuses a graph no loaded shape targets rather than
    // returning the `conforms: true` that silence produces, so REACHING a
    // verdict is part of what this asserts. Askable at all only since spec#11
    // gave `coverage:sourceRecordId` an `sh:path`; before that it threw here.
    //
    // `results` as well as `conforms`, because the two can disagree — a report
    // carrying only `sh:Warning` results still conforms, and `planType "ppo"`
    // must not trip `coverage:CoverageTypeVocabularyShape`.
    //
    // WHICH SHAPE REACHED IT IS PART OF THE CLAIM, and is asserted first.
    // coverage-001 conforms cleanly TODAY, judged by
    // `clinical:CoverageRecordShape` — a shape written to accept a spelling
    // that is only read, which relaxes the effective-date datatype the
    // deprecated importer got wrong and binds no status at all. A clean verdict
    // from it is not the clean verdict this fixture is owed, and the two are
    // indistinguishable in the report.
    const record = coverage001.input;
    const types = parseTurtle(serialize(record)).namedNode(record.id).out(rdf.type).values;
    expect(types).toEqual([INSURANCE_PLAN]);

    const report = await shaclCheck(record);

    expect(report.conforms).toBe(coverage001.shouldAccept);
    expect(report.results).toEqual([]);
  });

  it('rejects a status outside the fm-status binding', async () => {
    // THE PROOF THE SHAPE RAN. A clean verdict above is consistent with a shape
    // that never fired; a violation is not. `coverage:InsurancePlanShape` is
    // `sh:targetClass coverage:InsurancePlan`, so a subject typed
    // `clinical:CoverageRecord` matches no target and every constraint the
    // shape holds is skipped in silence — the four-value `sh:in` on
    // `coverage:status` included. A plan with a nonsense status conforms today,
    // which is the vacuous `conforms: true` this epic exists to eliminate.
    const report = await shaclCheck(planWithStatus('banana'));

    expect(report.conforms).toBe(false);
    expect(report.results).toHaveLength(1);

    const [violation] = report.results;
    expect(violation?.sourceConstraintComponent.value).toBe(sh.InConstraintComponent?.value);
    expect(violation?.path.value).toBe(coverage.status?.value);
  });

  it('accepts a status inside it', async () => {
    // The control. Without it, a shape that rejected every status would satisfy
    // the assertion above and look exactly as correct.
    const report = await shaclCheck(planWithStatus('active'));

    expect(report.conforms).toBe(true);
    expect(report.results).toEqual([]);
  });
});

describe('the deprecated `CoverageRecord` spelling, arriving as data', () => {
  /**
   * `Coverage['type']` is narrowed to `'InsurancePlan'`, which closes the path
   * for a TypeScript consumer writing a literal — and only for them. The
   * spelling is still live everywhere the type system is not: it is a key of
   * `TYPE_TO_MAPPING_KEY` (`src/vocabularies/namespaces.ts:399`, retained on
   * purpose so `deserialize()` accepts it), it is in `RECOGNIZED_DATA_TYPES`
   * and it is a `case` in `validateRecord`. JSON read off disk, a fixture, or
   * any JavaScript caller reaches `serialize()` with it.
   *
   * And on that path the two halves of the write disagree. The CLASS is chosen
   * through `TYPE_TO_MAPPING_KEY` — which maps both spellings to `insurance` —
   * so the subject is typed `coverage:InsurancePlan`. The PREDICATES are chosen
   * through `TYPE_PREDICATE_OVERRIDES`, keyed on `record.type` verbatim, which
   * had a row for `InsurancePlan` and none for `CoverageRecord` — so they stay
   * `clinical:` and `health:`.
   *
   * That combination is the one state this file's header calls worse than the
   * bug, reached from the other direction: `coverage:InsurancePlanShape` targets
   * the class, matches, and reports `sh:minCount` violations on
   * `coverage:providerName`, `coverage:memberId` and `coverage:coverageType`
   * against a record carrying all three. Before the class moved, such a record
   * wrote a coherent `clinical:CoverageRecord` graph and was judged by the
   * clinical shape; the half-migrated graph is a regression the deprecated
   * spelling cannot be blamed for.
   */
  function asDeprecatedSpelling(record: Coverage): Coverage {
    // The cast is the point: this is what a `JSON.parse` result is, and the
    // model's narrowing is exactly the thing that cannot stop it.
    return { ...record, type: 'CoverageRecord' } as unknown as Coverage;
  }

  it('writes the same graph under either spelling of the type', () => {
    // The whole graph, for the reason the header gives: the class is one triple
    // of ten and it is the one already correct here.
    expect(triples(serialize(asDeprecatedSpelling(coverage002.input as Coverage)))).toEqual(
      triples(serialize(coverage002.input)),
    );
  });

  it('does not leave a plan half-migrated: coverage class, clinical predicates', () => {
    // Named separately from the graph comparison because the failure message is
    // the diagnosis. A record typed `coverage:InsurancePlan` whose predicates
    // are `clinical:` has no `coverage:providerName` at all.
    const record = asDeprecatedSpelling(coverage002.input as Coverage);
    const node = parseTurtle(serialize(record)).namedNode(record.id);

    expect(node.out(rdf.type).values).toEqual([INSURANCE_PLAN]);
    expect(node.out(coverage.providerName).values).toEqual(['Aetna']);
    expect(node.out(clinical.providerName).values).toEqual([]);
  });

  it('earns the same clean verdict from the shapes', async () => {
    // The consequence stated as the shapes see it. Three minCount violations on
    // data that has all three fields is what this asserts the absence of, and
    // `assertCovered` inside `shaclCheck` refuses the vacuous pass that an
    // untargeted graph would otherwise produce.
    const report = await shaclCheck(asDeprecatedSpelling(coverage002.input as Coverage));

    expect(report.conforms).toBe(true);
    expect(report.results).toEqual([]);
  });
});
