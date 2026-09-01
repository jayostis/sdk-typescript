/**
 * `profile-002` — the one fixture in the family carrying all three of the nested
 * sub-structures a `cascade:PatientProfile` holds inline: an emergency contact,
 * a postal address and a preferred pharmacy.
 *
 * `profile-001` and `profile-003` have no file rather than an empty one —
 * nothing but this sentence can say that the gap is unclaimed ground and not an
 * oversight.
 *
 * Two questions about those structures, and the second is not a formality. The
 * writer and the reader keep their nested-blank-node knowledge in entirely
 * separate places — `BLANK_NODE_TYPES` in turtle-serializer.ts against
 * `NESTED_BLANK_NODE_FIELDS` and `REVERSE_PREDICATE_MAP` in turtle-parser.ts —
 * and a structure can be written perfectly and come back as the bare string
 * `"_:b1"`, or as `{}`, with nothing in between to notice.
 *
 * NO EARNS QUESTION, and it is the shapes rather than the SDK that cannot answer
 * it — but NOT over the three sub-structures. `cascade:PatientProfileShape` in
 * core.shapes.ttl declares an `sh:path` for `cascade:emergencyContact`,
 * `cascade:address` and `cascade:preferredPharmacy`, along with ten more.
 *
 * It is the patient's NAME. Every profile this SDK writes carries `foaf:name`,
 * `foaf:givenName` and `foaf:familyName`, and no shapes file declares a path for
 * any `foaf:` predicate — `PatientProfileShape` constrains thirteen properties
 * and none of them is the one identifying the person. `assertCovered` refuses
 * the graph rather than return the vacuous `conforms: true` that silence
 * produces, which is right: a verdict reached without looking at the name would
 * be indistinguishable from a name that satisfied every constraint.
 *
 * Vendoring cannot restore this question, and adding a `foaf:` path to
 * `PatientProfileShape` is probably not the fix either. `core.ttl:262` describes
 * a two-document Solid WebID model in which the name lives on a SHAREABLE
 * `foaf:Agent` card and `cascade:PatientProfile` holds only health-specific data
 * — the two are separate documents so that they can carry different
 * access-control policies. On that reading the shape is right and this SDK is
 * wrong to write the name here at all.
 *
 * Left refused rather than resolved, because resolving it is a cross-repo change
 * with an open question at the front of it (#35): `validate()` REQUIRES
 * `givenName` and `familyName`, `profile-001` and `profile-002` carry them in
 * their expected output, and `profile-003` — which follows the two-document
 * model — is the fixture `validate()` rejects.
 *
 * THE CONTRACT ASKS QUESTION 7 ANYWAY, and `shaclCheck` throws rather than
 * answer it. That is the refusal above arriving where it can be seen. It could
 * be silenced — an argument saying this fixture skips question 7 — and it must
 * not be: an exemption would be available to every fixture and most attractive
 * to the one with the most to hide, which is the whole reason the contract has
 * no such argument. A question that cannot be answered is a question that fails
 * loudly, naming the three `foaf:` predicates nothing constrains.
 *
 * WHY NOT `triples()`, AND WHAT CHANGED. A blank node compares by its
 * parser-assigned label there, stable within one parse and not across two, so a
 * whole-graph comparison against `expectedOutput.turtle` would read `_:b0_b1`
 * against `_:b0_b3` as a disagreement that is not one. That is still true of
 * `triples()`. It is no longer true of the file: `graphDifference` canonicalises
 * both sides under RDFC-1.0, which names a blank node from the graph's own shape
 * rather than from the order it was parsed in, and questions 2 and 3 are askable
 * of this fixture for the first time because of it.
 *
 * THE TRAVERSALS STAY, and are not made redundant by question 2. A canonical
 * diff says which LINES differ; a traversal says which STRUCTURE lost which
 * field. They also differ in what a change to one blank node does: because
 * canonical labels are derived from the graph, a single missing triple
 * renumbers the nodes around it and widens the diff to lines that are fine —
 * question 3's failure on this fixture is one missing `rdf:type` per structure
 * reported as eight differing lines. The traversal points at the field.
 *
 * `parseTurtle` takes text, so the `serialize()` under test stays visible.
 *
 * @see spec/ontologies/core/v1/core.ttl  cascade:EmergencyContact, cascade:Address, cascade:PharmacyInfo
 */

import { describe, it, expect } from 'vitest';

import { serialize } from '../../../src/serializer/turtle-serializer.js';
import { deserializeOne } from '../../../src/deserializer/turtle-parser.js';
import { loadCascadeRecordFixture } from '../../support/fixtures.js';
import { followsTheFixtureContract } from '../../support/fixture-contract.js';
import { cascade, parseTurtle, rdf } from '../../support/graph.js';
import type { PatientProfile } from '../../../src/models/patient-profile.js';

const profile002 = loadCascadeRecordFixture('profile-002');

/** The record subject of `profile-002`, as a traversable pointer into what `serialize()` wrote. */
function serializedProfile() {
  const record = profile002.input;
  return parseTurtle(serialize(record)).namedNode(record.id);
}

describe('profile-002 — Full fields: Patient profile with emergency contact, address, pharmacy, and all demographics', () => {
  // COMMENTED OUT, and the cost is SIX questions, not one.
  //
  //   https://github.com/jayostis/sdk-typescript/issues/55
  //
  // Only question 7 is blocked. `shaclCheck` throws on this fixture rather than
  // answering, because no shapes file in `spec` declares an `sh:path` for any
  // `foaf:` predicate — all ten checked, the four written here and the six that
  // are not — so a verdict about a profile carrying a name would be the vacuous
  // `conforms: true` that `assertCovered` exists to refuse. Blocked upstream on
  // jayostis/spec#22, and behind that on #35, which asks whether this SDK should
  // write the name here at all.
  //
  // Questions 1 through 6 answer perfectly well and are now not being asked,
  // which matters more here than it would elsewhere: this is the FULL FIELDS
  // fixture, so the graph and round-trip questions cover the three nested
  // structures no other profile fixture carries.
  //
  // Left as a comment rather than solved in the helper. An `it.skip` there would
  // skip question 7 for every fixture, and a per-fixture escape on
  // `ContractHelp` was drafted and reverted — the helper's docblock forbids one
  // in terms, and the first draft was provably wrong in exactly the way that
  // rule predicts: a fixture declaring fewer uncovered predicates than the
  // oracle named still passed. #55 restores this line when question 7 becomes
  // answerable.
  //
  // No `fields` rows when it returns: this fixture is POSITIVE, so a healthy
  // SHACL report names no violation and question 7 has nothing to translate. A
  // row would be an assertion about a violation that should not exist.
  //
  // followsTheFixtureContract(profile002, { shouldAccept: true });

  it('writes the emergency contact as a typed blank node carrying all three of its fields', () => {
    const contact = serializedProfile().out(cascade.emergencyContact);

    // One `toEqual` over the whole node rather than four separate assertions:
    // a partly written structure is the failure worth catching, and four
    // assertions report only the first field that went missing.
    expect({
      rdfType: contact.out(rdf.type).values,
      contactName: contact.out(cascade.contactName).values,
      contactRelationship: contact.out(cascade.contactRelationship).values,
      contactPhone: contact.out(cascade.contactPhone).values,
    }).toEqual({
      rdfType: [cascade.EmergencyContact.value],
      contactName: ['Maria Rivera'],
      contactRelationship: ['spouse'],
      contactPhone: ['555-0142'],
    });
  });

  it('writes the address as a typed blank node carrying all six of its fields', () => {
    const address = serializedProfile().out(cascade.address);

    expect({
      rdfType: address.out(rdf.type).values,
      addressLine: address.out(cascade.addressLine).values,
      addressCity: address.out(cascade.addressCity).values,
      addressState: address.out(cascade.addressState).values,
      addressPostalCode: address.out(cascade.addressPostalCode).values,
      addressCountry: address.out(cascade.addressCountry).values,
      addressUse: address.out(cascade.addressUse).values,
    }).toEqual({
      rdfType: [cascade.Address.value],
      addressLine: ['742 Evergreen Terrace'],
      addressCity: ['Portland'],
      addressState: ['OR'],
      addressPostalCode: ['97205'],
      addressCountry: ['US'],
      addressUse: ['home'],
    });
  });

  it('writes the preferred pharmacy as a typed blank node carrying all three of its fields', () => {
    const pharmacy = serializedProfile().out(cascade.preferredPharmacy);

    expect({
      rdfType: pharmacy.out(rdf.type).values,
      pharmacyName: pharmacy.out(cascade.pharmacyName).values,
      pharmacyAddress: pharmacy.out(cascade.pharmacyAddress).values,
      pharmacyPhone: pharmacy.out(cascade.pharmacyPhone).values,
    }).toEqual({
      rdfType: [cascade.PharmacyInfo.value],
      pharmacyName: ['Cascade Pharmacy'],
      pharmacyAddress: ['100 NW 23rd Ave, Portland, OR 97210'],
      pharmacyPhone: ['555-0199'],
    });
  });

  it('qualifies a nested child with the blank node prefix, not with the key predicate', () => {
    // `contactPhone` is the field where the two rules would visibly disagree.
    // A blank node's children are built from the node's prefix and the JSON
    // key, never looked up in `PROPERTY_PREDICATES`, so a nested key and a
    // top-level key of the same name are different properties. If anything ever
    // makes `childrenOf` table-driven, this child stops resolving and the
    // assertion below goes empty.
    const contact = serializedProfile().out(cascade.emergencyContact);

    expect(contact.out(cascade.contactPhone).values).toEqual(['555-0142']);
  });

  it('reads all three structures back as nested objects off the graph it just wrote', () => {
    // Whole objects, not one key each. A child whose predicate is missing from
    // the reader's reverse map is dropped by `if (!key) continue` with no
    // error, so a structure rebuilt with eleven of its twelve children looks
    // exactly like one rebuilt with all twelve — and an empty `{}` looks like a
    // structure that parsed fine and had nothing in it. Only comparing the
    // whole object tells those apart from the real thing.
    const parsed = deserializeOne<PatientProfile>(
      serialize(profile002.input),
      profile002.input.type,
    );

    expect({
      emergencyContact: parsed?.emergencyContact,
      address: parsed?.address,
      preferredPharmacy: parsed?.preferredPharmacy,
    }).toEqual({
      emergencyContact: {
        contactName: 'Maria Rivera',
        contactRelationship: 'spouse',
        contactPhone: '555-0142',
      },
      address: {
        addressLine: '742 Evergreen Terrace',
        addressCity: 'Portland',
        addressState: 'OR',
        addressPostalCode: '97205',
        addressCountry: 'US',
        addressUse: 'home',
      },
      preferredPharmacy: {
        pharmacyName: 'Cascade Pharmacy',
        pharmacyAddress: '100 NW 23rd Ave, Portland, OR 97210',
        pharmacyPhone: '555-0199',
      },
    });
  });
});
