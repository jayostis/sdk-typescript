/**
 * core v2.2 — `cascade:address`: the patient's postal address, written inline
 * as a `cascade:Address` blank node.
 *
 * Not a new term. The predicate has been in core since v2.2 and the class since
 * v2.0; what was missing was the `PROPERTY_PREDICATES` row, without which
 * `emitField` returned at `if (!pred) return;` and the whole structure was
 * dropped from every document this SDK wrote (#27).
 *
 * `{ form: 'blankNode' }` is the whole rule, and `rdfType` is not decorative:
 * `cascade:AddressShape` targets the class, so an untyped node is valid Turtle
 * that no shape reaches and no query for an address finds.
 *
 * NO `nestedPrefix`. `childrenOf` defaults to `cascade`, and this node's
 * children — `cascade:addressLine` through `cascade:addressType` — are what
 * `profile-002` expects, because the fixture's child keys are already
 * disambiguated in the JSON.
 *
 * The list is `cascade:AddressShape`'s, not the fixture's. What it deliberately
 * omits is the shape's five READ-SIDE aliases — `city`, `state`,
 * `streetAddress`, `postalCode`, `country` — which a reader accepts and this
 * writer must never emit: writing both spellings of one fact is how a consumer
 * ends up with two cities to reconcile.
 *
 * The key is the bare word `address`, and it stays that way: it is what the
 * `PatientProfile` model declares and what every fixture writes. No other model
 * in this SDK carries a top-level `address`, so the term claims one field.
 *
 * @see spec/ontologies/core/v1/core.ttl  cascade:Address
 */

import { defineTerm, requirePredicate } from './term.js';

export const address = defineTerm({
  key: 'address',
  predicate: requirePredicate('address'),
  // cascade:PatientProfileShape
  maxCount: 1,
  rule: {
    form: 'blankNode',
    rdfType: 'cascade:Address',
    children: {
      addressLine: { form: 'literal' },
      addressCity: { form: 'literal' },
      addressState: { form: 'literal' },
      addressPostalCode: { form: 'literal' },
      addressCountry: { form: 'literal' },
      addressUse: { form: 'literal' },
      // `cascade:AddressShape` declares this one beside the six, with an
      // `sh:in ( "postal" "physical" "both" )`. Undeclared here it was DROPPED
      // rather than written, since a declared `children` writes nothing else.
      addressType: { form: 'literal' },
    },
  },
});
