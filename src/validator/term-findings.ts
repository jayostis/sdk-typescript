/**
 * What the TERM MODULES say about a record, as findings.
 *
 * Lifted out of `validator.ts` unchanged so both the old top-level walk and
 * `CascadeEntityValidator` can reach it without importing each other. Nothing
 * about the rules moved; only the file did.
 *
 * These are the PREDICATE-LEVEL facts — a value set, a cap, a child a term does
 * not declare — true wherever the predicate appears, which is why they belong
 * to a term rather than to any one record type. What varies BY record type is
 * the per-type business of a validator.
 *
 * @module validator/term-findings
 */

import { allTerms, childPredicateFor, ownEntry, ruleFor, severityFor, termFor } from '../terms/index.js';
import { undeclaredChildKeys } from '../terms/index.js';
import type { CascadeEntity } from '../models/common.js';
import type { Finding, RecordFields } from './entity-validator.js';

/** A finding, under the name `validator.ts` gives it. */
type ValidationError = Finding;

/**
 * Whether a field carries a value at all.
 *
 * An empty array is ABSENT, not present: a 0..* property serializes to zero
 * triples when empty, so treating `testCode: []` as a coding would suppress the
 * missing-coding warning on a record that carries none.
 */
function hasField(rec: RecordFields, field: string): boolean {
  const val = rec[field];
  if (val === undefined || val === null) return false;
  if (Array.isArray(val)) return val.length > 0;
  return true;
}
/**
 * Too many values for a field whose vocabulary caps them.
 *
 * The first check here that is not hand-transcribed. Every rule above restates
 * a constraint `spec` already declares — `sh:minCount`, `sh:in` — retyped from
 * a shapes file nothing diffs it against, which is why they drift in both
 * directions at once: `resultValue` is required here and has no `sh:minCount`
 * anywhere, while `health:interpretation`'s value set is unchecked and
 * `lab-010` is accepted with a value the shapes reject.
 *
 * This reads the cap off the term instead, so one declaration answers both the
 * writer and the validator. `termFor` is undefined for every field no module
 * claims, which is nearly all of them: this reports on the handful that are
 * termed and stays silent on the rest. Silent is the honest answer for a field
 * whose cardinality nothing in this SDK knows — the alternative is guessing at
 * 1 and rejecting conformant records, which is the defect above, reproduced.
 *
 * The COUNT is what the graph would carry, not what the JSON looks like: a bare
 * scalar is one value and an array is its length, because `emitField` writes one
 * triple per member either way. An absent field is nothing to count.
 */
export function termFindings(record: CascadeEntity): ValidationError[] {
  const errors: ValidationError[] = [];
  const rec: RecordFields = { ...record };

  // Rules about a value that is PRESENT. Walking the record is enough.
  for (const [field, value] of Object.entries(rec)) {
    const term = termFor(field);
    if (!term) continue;
    if (value === undefined || value === null) continue;
    const members = Array.isArray(value) ? value : [value];

    // The severity this term's rules carry ON THIS RECORD TYPE, from the shape
    // that governs it. Read once and applied to every rule below, because
    // `sh:severity` belongs to the property shape rather than to any one
    // constraint inside it: a shape at sh:Warning reports its datatype, its
    // maxCount and its value set alike at Warning.
    //
    // The undeclared-child check above is NOT given it. That rule comes from
    // the term's `children` map and not from a shape at all, so there is no
    // `sh:severity` to read; an undeclared child is an error everywhere.
    const severity = severityFor(term, record.type);

    // An absent maxCount is UNCONSTRAINED, not unknown — `cascade:PatientProfileShape`
    // declares none for `cascade:emergencyContact`, so a profile may name several
    // people to call. Reading it as 1 would reject a conformant record.
    if (term.maxCount !== undefined && members.length > term.maxCount) {
      errors.push({
        field,
        message:
          `${field} carries ${members.length} values; the vocabulary permits ` +
          `at most ${term.maxCount}`,
        severity,
      });
    }

    // A CHILD OF A BLANK NODE that the term declares no rule for.
    //
    // The writer emits it — `childrenOf` writes every present key — so the
    // triple is in the graph under `cascade:<key>`, a predicate no `sh:path`
    // declares. This is the only place that is reportable. Nothing in
    // `tests/shapes/` is `sh:closed`, so SHACL returns `conforms: true` on such
    // a graph, indistinguishable from one that satisfied every constraint; and
    // the shapes are a devDependency besides, so a consumer's only judge is
    // this function. `spec` issue jayostis/spec#2 asks for the shape to close,
    // which would make the corpus able to see it too — this check is what
    // covers the installed package either way.
    //
    // Read off the term, exactly as `maxCount` and `values` above are: the
    // declared children ARE the legal set, which is why `address` declares
    // `cascade:AddressShape`'s five simplified aliases even though the `Address`
    // model does not. A term whose `children` map is short of its shape turns
    // this into a false rejection, and `tests/terms/children-complete.test.ts`
    // is what stops that being discovered by a caller.
    const rule = ruleFor(term, record.type);
    for (const child of undeclaredChildKeys(rule, value)) {
      errors.push({
        field: `${field}.${child}`,
        message:
          `${field} carries a nested "${child}", which no vocabulary declares; ` +
          // THE SPELLING THE WRITER USES, from the writer's own function.
          // Interpolating `${prefix}:${child}` here was right for every child
          // whose key is a JSON name and wrong for the one kind that is not: a
          // predicate from another namespace comes back from
          // `recoverableChildKey` as a full IRI, the writer emits
          // `<https://other.example.org/ns#wardCount>`, and this named
          // `cascade:https://other.example.org/ns#wardCount` — a predicate
          // nothing writes, in a message whose whole job is to name the one
          // that is written.
          `${childPredicateFor(child, rule.nestedPrefix ?? 'cascade')} is written ` +
          `under no domain, range or shape`,
        severity: 'error',
      });
    }

    // Every member, not just the first: a 0..* coded field can be wrong in its
    // second value, and reporting only the first would be the same partial
    // answer the reader used to give.
    if (term.values) {
      for (const member of members) {
        if (typeof member !== 'string' || term.values.includes(member)) continue;
        errors.push({
          field,
          message: `${field} "${member}" is not one of the ${term.values.length} values the vocabulary admits`,
          severity,
        });
      }
    }

    // `sh:minLength`. Every member, for the reason the value set above is:
    // a repeated predicate can be empty in its second triple.
    //
    // CHARACTERS, and no trim — see {@link TermSpec.minLength}. SHACL measures
    // the value node converted to string, so `"  "` is length 2 and conforms.
    // A whitespace-only name is a genuine defect and this is not the constraint
    // that catches it; rejecting it here would put this validator ahead of the
    // shapes, and every fixture judged against both would disagree.
    //
    // Non-strings are skipped rather than coerced, exactly as the value set
    // skips them. `sh:minLength` is ill-formed against a blank node, and
    // stringifying a number to measure it would invent a rule out of a
    // datatype the shape constrains separately.
    if (term.minLength !== undefined) {
      for (const member of members) {
        if (typeof member !== 'string' || member.length >= term.minLength) continue;
        errors.push({
          field,
          message:
            `${field} is ${member.length} characters; the vocabulary requires ` +
            `at least ${term.minLength}`,
          severity,
        });
      }
    }
  }

  // Rules about a value that is ABSENT, which no walk of the record can reach.
  // Per record type: an sh:minCount sits inside one node shape, so a field
  // required of a PatientProfile means nothing on a lab result.
  for (const term of allTerms()) {
    const required = ownEntry(term.minCountByType, record.type);
    if (required === undefined || required < 1) continue;
    if (hasField(rec, term.key)) continue;

    errors.push({
      field: term.key,
      message: `${term.key} is required for ${record.type}`,
      // Off the shape, exactly as `maxCount` and `values` above are.
      // `severityByType` is documented on `TermSpec` as governing every rule
      // the term declares for the type, and `sh:severity` belongs to the
      // property shape rather than to any one constraint inside it — a shape at
      // sh:Warning reports its minCount at Warning too. Hardcoded 'error' here
      // was latent only because no term declares both today; the day one does,
      // a shape saying "reported, not rejected" would REJECT, because `valid`
      // is computed from `errors` alone. That is the verdict flip the severity
      // plumbing was added to prevent, and it would have shipped as a
      // conformant record refused.
      severity: severityFor(term, record.type),
    });
  }

  return errors;
}