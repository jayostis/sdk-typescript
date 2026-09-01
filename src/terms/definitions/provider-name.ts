/**
 * coverage v1 — `coverage:providerName`: the insurer named on a plan.
 *
 * Termed for `sh:minCount 1` on `coverage:InsurancePlanShape`, and reading the
 * shape narrows the rule. `validateTypeSpecific` required a provider name on
 * BOTH `InsurancePlan` and the deprecated `CoverageRecord` spelling, from one
 * `case` covering the two. Only `coverage:InsurancePlanShape` declares the
 * `sh:minCount`; `clinical:CoverageRecordShape` requires the deprecated
 * `clinical:providerName` instead, and this SDK reads that spelling and never
 * writes it (#26). Requiring it of a record type nothing here emits was a rule
 * with no source.
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
  minCountByType: { InsurancePlan: 1 },
  // The cap sits in the same property block as the minCount in every shape
  // that declares it. A cap answers HOW MANY and a minCount answers AT LEAST
  // ONE; neither substitutes for the other, and two values pass both.
  maxCount: 1,
  rule: { form: 'literal' },
});
