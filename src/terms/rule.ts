/**
 * Which rule applies, and what it says about a record type.
 *
 * A term declares one `rule` and may override it per record type in
 * `ruleByType`. Everything here answers a question about the ACTIVE rule for a
 * given record, which is the question every writer and the validator all have
 * to ask before they can do anything else.
 *
 * @module terms/rule
 */

import { ownEntry } from './predicate.js';
import type { FieldRule, Severity, TermSpec } from './types.js';

/**
 * The severity every rule this term declares reports at, for this record type.
 *
 * `error` is the default because SHACL's is `sh:Violation`: a shape that says
 * nothing about severity is rejecting, not reporting.
 *
 * One function rather than the expression written out at each call site, and
 * that is what the finding was. `maxCount` and `values` resolved it and the
 * `minCountByType` loop hardcoded `'error'` beside them — latent only because
 * no term declares both `severityByType` and `minCountByType` today. The day
 * one does, a shape saying "reported, not rejected" would have REJECTED, and
 * since `valid` is computed from `errors` alone that is a conformant record
 * refused. A default spelled once cannot be honoured in two places and not a
 * third.
 */
export function severityFor(
  spec: TermSpec,
  recordType: string | undefined,
): Severity {
  return ownEntry(spec.severityByType, recordType) ?? 'error';
}

/** The rule a term applies to a record of this type, resolving `ruleByType`. */
export function ruleFor(spec: TermSpec, recordType: string | undefined): FieldRule {
  return ownEntry(spec.ruleByType, recordType) ?? spec.rule;
}

/**
 * Every rule a term can apply: its base rule, and each `ruleByType` override.
 *
 * A TERM MAY WRITE A BLANK NODE THROUGH `ruleByType` ALONE, and `defineTerm`
 * accepts that — it validates children across both. Reading `spec.rule` by
 * itself made two derivations disagree with the writer, which resolves the
 * ACTIVE rule per record: `childPredicatesOf` feeds the deserializer's reverse
 * map and the JSON-LD context, and `blankNodeTermKeys` feeds
 * `NESTED_BLANK_NODE_FIELDS`. A node written correctly and reachable from
 * neither comes back as the bare identifier `"_:b0"` with every child lost,
 * which is the failure #27 documented for the three profile sub-structures.
 *
 * Latent when written — no term declares a `ruleByType` — and closed here
 * rather than left for whoever declares the first one to debug.
 */
export function rulesOf(spec: TermSpec): FieldRule[] {
  return [spec.rule, ...Object.values(spec.ruleByType ?? {})];
}

/** Whether a term writes an inline blank node for ANY record type. */
export function writesBlankNode(spec: TermSpec): boolean {
  return rulesOf(spec).some((rule) => rule.form === 'blankNode');
}

