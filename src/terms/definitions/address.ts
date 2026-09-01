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

import { defineTerm } from '../term.js';
import { requirePredicate } from '../predicate.js';

export const address = defineTerm({
  key: 'address',
  predicate: requirePredicate('address'),
  // cascade:PatientProfileShape
  maxCount: 1,
  // The cap is graded sh:Info on that shape (core.shapes.ttl:136), not the
  // sh:Violation a bare maxCount is read as. Spec's own message says why: "A
  // postal address is helpful for care coordination and correspondence" — a
  // suggestion, so a profile carrying two is REPORTED and stays valid. Without
  // this the SDK rejects a record the vocabulary only comments on.
  severityByType: { PatientProfile: 'info' },
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
      // `sh:in ( "postal" "physical" "both" )`.
      addressType: { form: 'literal' },

      // THE SIMPLIFIED ALIASES, and they are spec's own word for them:
      // `cascade:AddressShape`'s rdfs:comment reads "Accepts both simplified
      // aliases (city, state) and FHIR-aligned properties (addressCity,
      // addressState)", and the shape declares an `sh:path` for all five.
      //
      // Declared here because the term is what `validate()` reads to decide
      // whether a child is undeclared, and a conformant address carrying `city`
      // would otherwise be REJECTED — the shape permitting exactly what the SDK
      // refused, which is the failure this SDK is least entitled to. They are
      // also already in `spec/contexts/v1/cascade.jsonld` (lines 126–130), so
      // declaring them brings the generated context into agreement with the
      // published one rather than away from it.
      //
      // The `Address` model does not declare them and nothing here proposes it
      // should. Whether this SDK should WRITE the alias spelling is a separate
      // question from whether it may judge one; the shape has answered the
      // second, and only the second is being answered here.
      streetAddress: { form: 'literal' },
      city: { form: 'literal' },
      state: { form: 'literal' },
      postalCode: { form: 'literal' },
      country: { form: 'literal' },
    },
  },
});
