/**
 * core v2.2 — `cascade:preferredPharmacy`: where this patient fills their
 * prescriptions, written inline as a `cascade:PharmacyInfo` blank node.
 *
 * Not a new term. The predicate has been in core since v2.2 and the class since
 * v2.0; what was missing was the `PROPERTY_PREDICATES` row, without which
 * `emitField` returned at `if (!pred) return;` and the whole structure was
 * dropped from every document this SDK wrote (#27).
 *
 * `{ form: 'blankNode' }` is the whole rule, and `rdfType` is not decorative:
 * `cascade:PharmacyInfoShape` targets the class, so an untyped node is valid
 * Turtle that no shape reaches and no query for a pharmacy finds.
 *
 * NO `nestedPrefix`. `childrenOf` defaults to `cascade`, and this node's
 * children are `cascade:pharmacyName` / `cascade:pharmacyAddress` /
 * `cascade:pharmacyPhone` — what `profile-002` expects, because the fixture's
 * child keys are already disambiguated in the JSON. `pharmacyAddress` in
 * particular is a plain literal child and not a nested node: the fixture
 * carries the pharmacy's address as one string.
 *
 * @see spec/ontologies/core/v1/core.ttl  cascade:PharmacyInfo
 */

import { defineTerm } from './term.js';
import { requirePredicate } from './predicate.js';

export const preferredPharmacy = defineTerm({
  key: 'preferredPharmacy',
  predicate: requirePredicate('preferredPharmacy'),
  // cascade:PatientProfileShape
  maxCount: 1,
  // sh:Info on that shape (core.shapes.ttl:146), the same grade and the same
  // reasoning as cascade:address beside it: "A preferred pharmacy helps
  // streamline prescription fulfillment" is a suggestion, not a constraint a
  // record fails.
  severityByType: { PatientProfile: 'info' },
  rule: {
    form: 'blankNode',
    rdfType: 'cascade:PharmacyInfo',
    children: {
      pharmacyName: { form: 'literal' },
      pharmacyAddress: { form: 'literal' },
      pharmacyPhone: { form: 'literal' },
    },
  },
});
