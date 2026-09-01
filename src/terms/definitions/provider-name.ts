/**
 * coverage v1 — `coverage:providerName`: the insurer named on a plan.
 *
 * Termed for `sh:minCount 1` on `coverage:InsurancePlanShape`, which requires it
 * of BOTH record types — and an earlier version of this comment argued it
 * required it of only one. The argument was: `clinical:CoverageRecordShape`
 * declares the `sh:minCount` on the deprecated `clinical:providerName`, this SDK
 * reads that spelling and never writes it (#26), so requiring a provider name of
 * a `CoverageRecord` was a rule with no source. Every clause of that is true and
 * the conclusion does not follow.
 *
 * WHAT IT MISSED IS WHICH SHAPE ACTUALLY JUDGES THE RECORD. A record typed
 * `CoverageRecord` serializes to `a coverage:InsurancePlan` carrying
 * `coverage:providerName` — that is what #26 fixed — so the shape that targets
 * it is `coverage:InsurancePlanShape`, the one WITH the `sh:minCount`.
 * `clinical:CoverageRecordShape` is irrelevant not because it is lenient but
 * because nothing this SDK writes is ever a `clinical:CoverageRecord`.
 *
 * MEASURED, not reasoned, after the reasoning had already been wrong once.
 * `shaclCheck` on `{ type: 'CoverageRecord', memberId, coverageType }` returns
 * `conforms: false` with "Insurance provider name is required", byte-identical
 * to what it returns for the same record typed `InsurancePlan`. With the row
 * missing, `validate()` returned `valid: true` on that record — a clean verdict
 * on data the shapes reject, which is the one failure this SDK cannot see.
 *
 * `predicateByType` because the field is written under two vocabularies: the
 * base `PROPERTY_PREDICATES` row is the deprecated `clinical:providerName`,
 * which the serializer already overrides to `coverage:` for a plan
 * (`INSURANCE_PLAN_PREDICATES`). The term states the same thing so the reader,
 * the writer and the validator all resolve it one way.
 *
 * @see spec/ontologies/coverage/v1/coverage.shapes.ttl  coverage:InsurancePlanShape
 */

import { defineTerm } from '../term.js';
import { requirePredicate } from '../predicate.js';

export const providerName = defineTerm({
  key: 'providerName',
  predicate: requirePredicate('providerName'),
  predicateByType: {
    InsurancePlan: 'coverage:providerName',
    // The deprecated spelling this SDK READS and never writes, kept because
    // JSON off disk still carries it and a record typed CoverageRecord is
    // written as a coverage:InsurancePlan either way (#26). Dropping it here
    // leaves the class coverage: and the predicate clinical: — the
    // half-migrated plan that shape targets and then reports minCount
    // violations on data that is present.
    CoverageRecord: 'coverage:providerName',
  },
  // BOTH types, because ONE shape requires it of both: whichever name the
  // caller uses, the record is written `a coverage:InsurancePlan` and judged by
  // `coverage:InsurancePlanShape`. See the module comment for the reasoning
  // this replaced, which had the shapes right and the targeting wrong.
  //
  // The gap was invisible from this file. `predicateByType` directly above
  // already names CoverageRecord, so the term read as complete while accepting
  // a coverage record carrying no provider at all.
  minCountByType: { InsurancePlan: 1, CoverageRecord: 1 },
  // The cap sits in the same property block as the minCount in every shape
  // that declares it. A cap answers HOW MANY and a minCount answers AT LEAST
  // ONE; neither substitutes for the other, and two values pass both.
  maxCount: 1,
  // sh:minLength 1, declared in the same property block as the cap above.
  // CHARACTERS, not content: "  " is two of them and conforms. See TermSpec.
  minLength: 1,
  rule: { form: 'literal' },
});
