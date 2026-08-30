/**
 * core v2.2 — `cascade:emergencyContact`: the person to call about this
 * patient, written inline as a `cascade:EmergencyContact` blank node.
 *
 * Not a new term. The predicate, the class and its three properties have been
 * in core since v2.2 and on the `PatientProfile` model since; what was missing
 * was the `PROPERTY_PREDICATES` row, without which `emitField` returned at
 * `if (!pred) return;` and the whole structure was dropped from every document
 * this SDK wrote (#27).
 *
 * `{ form: 'blankNode' }` is the whole rule, and `rdfType` is not decorative:
 * `cascade:EmergencyContactShape` targets the class, so an untyped node is
 * valid Turtle that no shape reaches and no query for a contact finds.
 *
 * NO `nestedPrefix`. `childrenOf` defaults to `cascade`, and this node's
 * children are `cascade:contactName` / `cascade:contactRelationship` /
 * `cascade:contactPhone` — which is what `profile-002` expects, because the
 * fixture's child keys are already disambiguated in the JSON. Declaring the
 * default would only invite the reader to look for a reason it differs.
 *
 * The children are NOT resolved through `PROPERTY_PREDICATES`, and this field
 * is the one where that visibly matters: a nested `contactPhone` is
 * `cascade:contactPhone`, and until this change the table registered a
 * top-level `contactPhone` as `vcard:hasTelephone` — a row nothing could ever
 * write, since the nested writer never consults the table and no record type
 * declares the field at top level. It is gone rather than left beside this
 * module (#27).
 *
 * @see spec/ontologies/core/v1/core.ttl  cascade:EmergencyContact
 */

import { defineTerm, requirePredicate } from './term.js';

export const emergencyContact = defineTerm({
  key: 'emergencyContact',
  predicate: requirePredicate('emergencyContact'),
  // NO maxCount: cascade:PatientProfileShape declares none for this one, where
  // cascade:address and cascade:preferredPharmacy beside it are both capped at
  // one. A profile may name more than one person to call.
  rule: {
    form: 'blankNode',
    rdfType: 'cascade:EmergencyContact',
    // The three properties core.ttl gives cascade:EmergencyContact, and the
    // list stops there. This is now the ONLY place they are written down: the
    // deserializer's reverse map and the JSON-LD context are generated from it.
    children: {
      contactName: { form: 'literal' },
      contactRelationship: { form: 'literal' },
      contactPhone: { form: 'literal' },
    },
  },
});
