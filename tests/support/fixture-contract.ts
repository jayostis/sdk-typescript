/**
 * The questions every conformance fixture should answer, as one call.
 *
 * A helper, not a test: vitest does not collect this file. `followsTheFixtureContract`
 * registers its `it`s in the CALLER's describe, so a conformance file reads as
 * the fixture's own name, one contract line, and then whatever that fixture
 * specifically claims.
 *
 * WHY PER-`it` AND NOT A NESTED DESCRIBE. Question 1 reads `task.suite?.name` to
 * check the enclosing describe title against the fixture's own description. A
 * helper that opened a describe of its own would compare that title instead —
 * the check would still pass, while having stopped looking at the thing it is
 * for. The flat form is load-bearing, not stylistic.
 *
 * WHAT IS NOT HERE, and both look like gaps. *The two readers agreeing with each
 * other* is subsumed: questions 4 and 5 both compare against `input`, so
 * agreement follows by transitivity and an `it` that cannot fail while its
 * neighbours pass asserts nothing. *`serialize` -> `deserializeOne` ->
 * `serialize` being graph-stable* is subsumed by question 4, which compares at
 * the RECORD level — a reader that rebuilt the input into a different shape
 * which happened to re-serialize identically passes the graph form and fails
 * question 4. Either becomes a real question if 4 or 5 is ever weakened below
 * exact equality, and then it goes in with a note saying which.
 *
 * ALL HELP COMES FROM THE CALL SITE. There is no table keyed by fixture id
 * anywhere: a reader sees the fixture, the contract line, and everything that
 * line needed to know, together. And none of it is an opt-out — no argument
 * lets a fixture skip a question. An unmapped violation is reported, not
 * silently passed; see `unreportedViolations`.
 *
 * @see tests/README.md  where a test goes, and what it may claim
 */

import { it, expect } from 'vitest';
import type { NamedNode } from '@rdfjs/types';

import { serialize } from '../../src/serializer/turtle-serializer.js';
import { deserializeOne } from '../../src/deserializer/turtle-parser.js';
import { toJsonLd, fromJsonLd } from '../../src/jsonld/index.js';
import { validate } from '../../src/validator/index.js';
import type { ValidationResult } from '../../src/validator/index.js';
import type { CascadeRecord } from '../../src/models/common.js';

import type { Fixture } from './fixtures.js';
import { graphDifference, quadsFromJsonLd, quadsFromTurtle } from './graph.js';
import { shaclCheck } from './shacl.js';

/**
 * One row of the predicate-to-field translation question 7 needs.
 *
 * Written out by hand at the call site — `[cascade.dateOfBirth, 'dateOfBirth']`.
 * NOT read from `REVERSE_PREDICATE_MAP`, `PROPERTY_PREDICATES` or `termFor`:
 * deriving it from the code under test would make the two validators agree by
 * construction, which is the one thing question 7 exists to disprove.
 */
export type FieldMapping = readonly [NamedNode, string];

export interface ContractHelp {
  /**
   * What the FILE believes about this fixture, not what the fixture says about
   * itself. Asserting `fixture.shouldAccept` against itself would be vacuous;
   * this is the claim that can be wrong.
   */
  readonly shouldAccept: boolean;

  /**
   * Predicate IRI -> the field name `validate()` uses for it, for question 7.
   *
   * Needed because the two validators do not speak the same language: a SHACL
   * result names an `sh:path`, an IRI, and `validate()` names a JSON key. That
   * is a translation, not a defect, and it is the one thing the contract cannot
   * work out for itself.
   */
  readonly fields?: readonly FieldMapping[];
}

/**
 * The SHACL violations no field of `validate()` accounts for.
 *
 * Takes plain strings rather than a report so it can be exercised directly,
 * which is the only way to know it would speak up — `tests/README.md`, "A
 * detector is proven by making it speak."
 *
 * A path with NO mapping row is reported, not skipped. That is the whole
 * difference between a contract and a suggestion: if an unmapped path passed
 * quietly, omitting a row would be an opt-out from question 7, and the fixture
 * with the most to hide would be the one that opted out. The report says
 * `unmapped` so the reader knows to add the row rather than chase a validator
 * bug.
 */
export function unreportedViolations(
  violationPaths: readonly (string | null)[],
  validatorFields: readonly string[],
  fields: readonly FieldMapping[],
): string[] {
  const byPredicate = new Map(fields.map(([predicate, field]) => [predicate.value, field]));

  return violationPaths
    .map((path) => {
      // A node-level constraint (`sh:closed`, `sh:node`) reports no path at
      // all. It cannot be translated to a field, and it must not vanish.
      if (path === null) return 'a violation with no sh:path';

      const field = byPredicate.get(path);
      if (field === undefined) return `${path} (unmapped)`;
      return validatorFields.includes(field) ? null : `${path} -> ${field}`;
    })
    .filter((entry): entry is string => entry !== null);
}

/**
 * Every field the shipped validator SPOKE ABOUT, whatever grade it gave.
 *
 * Question 7 asks whether a rule the vocabulary states is VISIBLE to the only
 * validator that ships — not whether it is fatal. Those are different
 * questions, and question 6 already owns the second one.
 *
 * All three buckets, because `report.results` has all three severities in it.
 * `sh:Warning` and `sh:Info` are grades this SDK deliberately models —
 * `interpretation` declares `severityByType: { VitalSign: 'warning' }`,
 * `address` and `preferredPharmacy` declare `'info'` — and `verdictOf` files
 * each in its own array. Reading `errors` alone would compare a three-grade
 * report against a one-grade answer: a warning-graded rule the validator
 * caught and reported would come back as "unreported", and the only validator
 * able to satisfy question 7 would be one that grades everything `error` —
 * exactly the verdict flip `severityFor` exists to prevent.
 */
export function reportedFields(result: ValidationResult): string[] {
  return [...result.errors, ...result.warnings, ...result.info].map((finding) => finding.field);
}

/**
 * Ask a fixture the seven questions, in the caller's describe.
 *
 * Both directions across both formats, and then the verdict:
 *   1  it is the fixture the file thinks it is
 *   2  Record -> Turtle    matches the corpus
 *   3  Record -> JSON-LD   says what the Turtle says
 *   4  Turtle  -> Record   is the record it started as
 *   5  JSON-LD -> Record   is the record it started as
 *   6  the shipped validator agrees with the corpus
 *   7  the shipped validator reports every violation the shapes name
 */
export function followsTheFixtureContract(fixture: Fixture, help: ContractHelp): void {
  const { shouldAccept, fields = [] } = help;

  it('is the fixture this file thinks it is', ({ task }) => {
    // `task.suite` is the enclosing describe — the caller's, because this
    // helper opens none of its own. Comparing the title against the fixture
    // keeps one copy of the description, in the place a reader sees first, and
    // still fails if the corpus is reworded.
    expect(task.suite?.name).toContain(fixture.description);
    expect(fixture.shouldAccept).toBe(shouldAccept);
  });

  it('writes the graph the corpus expects', async () => {
    // As a GRAPH. Two writers spell one graph differently — a repeated
    // predicate and an object list are the same triples and different bytes —
    // and canonicalization is what lets a fixture carrying blank nodes be
    // compared at all, which `triples()` cannot do.
    const difference = await graphDifference(
      quadsFromTurtle(serialize(fixture.input)),
      quadsFromTurtle(fixture.expectedOutput.turtle),
    );

    expect(difference).toBeNull();
  });

  it('writes JSON-LD that says what its Turtle says', async () => {
    // The question a round trip cannot answer. `toJsonLd` and `fromJsonLd` are
    // consistent with EACH OTHER even where both disagree with the Turtle — a
    // record can survive `fromJsonLd(toJsonLd(x)) === x` exactly while the
    // JSON-LD graph it passed through names different predicates, types its
    // IRIs as strings and drops its lists. Only comparing the two WRITERS
    // catches that, which is why question 5 does not subsume this one.
    const difference = await graphDifference(
      await quadsFromJsonLd(toJsonLd(fixture.input)),
      quadsFromTurtle(serialize(fixture.input)),
    );

    expect(difference).toBeNull();
  });

  it('reads back off its own Turtle as the record it started as', () => {
    // The whole record, not a field of it. A reader that drops a predicate it
    // does not recognise rebuilds something that looks exactly like a record
    // which never had the field, and only comparing everything tells those
    // apart.
    expect(deserializeOne(serialize(fixture.input), fixture.input.type)).toEqual(fixture.input);
  });

  it('reads back off its own JSON-LD as the record it started as', () => {
    // The other reader, and until this contract existed it had no test at all.
    expect(fromJsonLd(toJsonLd(fixture.input))).toEqual(fixture.input);
  });

  it('earns from the shipped validator the verdict the corpus declares', () => {
    // `validate()` is the whole of what ships: `rdf-validate-shacl` is a
    // devDependency and `tests/shapes/` is not in package.json's `files`, so
    // nothing a consumer installs can reach the SHACL verdict below.
    expect(validate(fixture.input).valid).toBe(fixture.shouldAccept);
  });

  it('reports through the shipped validator every violation the shapes name', async () => {
    // SUBSET, not equality. `validate()` reporting MORE than the shapes is
    // allowed and is the case today; what must not happen is a rule the
    // vocabulary states being invisible to the only validator that ships.
    //
    // `shaclCheck` refuses a graph the vendored shapes are silent on rather
    // than returning the vacuous `conforms: true` that silence produces, so
    // reaching a report at all is part of what this asserts.
    const report = await shaclCheck(fixture.input as CascadeRecord);
    const paths = report.results.map((result) => result.path?.value ?? null);

    expect(
      unreportedViolations(paths, reportedFields(validate(fixture.input)), fields),
    ).toEqual([]);
  });
}
