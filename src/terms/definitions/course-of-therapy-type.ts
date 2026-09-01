/**
 * clinical v1 — `clinical:courseOfTherapyType`: whether a medication is taken
 * for a fixed course, continuously, or unknown.
 *
 * A TERM AND NOT A PER-RECORD RULE, and the corpus is why. Measured across the
 * four vendored shapes files, 48 predicates carry an `sh:in` and only four bind
 * different lists on different shapes — `clinical:status`,
 * `cascade:dataProvenance`, `clinical:verificationStatus` and `health:status`
 * (#45). This is not one of them: one list, on one shape, so the value set is a
 * fact about the PREDICATE rather than about the record type that happens to
 * carry it. Declaring it beside a medication would put a property-level fact in
 * a place that only sees one of the properties' users.
 *
 * `sh:severity sh:Warning` (clinical.shapes.ttl:859), which is the reason this
 * cannot be a bare `values` list. A value outside the set is REPORTED, not
 * rejected: `validate()` computes `valid` from errors alone, so filing this as
 * an error would refuse a record the vocabulary merely comments on. The grade
 * belongs to the property shape, so it governs the `maxCount` here too.
 *
 * `severityByType` and not a flat grade, for the same reason `minCountByType`
 * is per type: an `sh:severity` lives inside ONE node shape and says nothing
 * about any other record that may one day carry the field.
 *
 * @see spec/ontologies/clinical/v1/clinical.shapes.ttl  clinical:MedicationShape
 */

import { defineTerm } from '../term.js';
import { requirePredicate } from '../predicate.js';

export const courseOfTherapyType = defineTerm({
  key: 'courseOfTherapyType',
  predicate: requirePredicate('courseOfTherapyType'),
  // `sh:maxCount 1` sits in the same property block as the `sh:in`, and answers
  // a different question: the value set says WHICH, the cap says HOW MANY. Two
  // admitted members pass the value loop and break the shape.
  maxCount: 1,
  values: ['acute', 'continuous', 'unknown'],
  severityByType: { MedicationRecord: 'warning' },
  rule: { form: 'literal' },
});
