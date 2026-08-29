/**
 * `cascade:PatientProfile` — the patient's demographics and the three nested
 * sub-structures a profile carries inline: an emergency contact, a postal
 * address and a preferred pharmacy.
 *
 * One describe per fixture. Its title spells the fixture's description out as a
 * literal, so the file and the test output both read as the corpus does without
 * anyone loading a fixture to find out; the first `it` is what keeps that
 * literal honest, comparing it against what the fixture actually says.
 *
 * Only `profile-002` is asked anything here. It is the one fixture in the
 * family that carries all three sub-structures, and `profile-001` and
 * `003`–`005` have no describe rather than an empty one — nothing but this
 * sentence can say that the gap is unclaimed ground and not an oversight.
 *
 * Two questions, both about the SAME structures: what this SDK WRITES, and what
 * it READS BACK off the document it just wrote. The second is not a formality.
 * The writer and the reader keep their nested-blank-node knowledge in entirely
 * separate places — `BLANK_NODE_TYPES` in turtle-serializer.ts against
 * `NESTED_BLANK_NODE_FIELDS` and `REVERSE_PREDICATE_MAP` in turtle-parser.ts —
 * and a structure can be written perfectly and come back as the bare string
 * `"_:b1"`, or as `{}`, with nothing in between to notice.
 *
 * NO EARNS QUESTION, and it is the shapes rather than the SDK that cannot
 * answer it — but NOT over the three sub-structures. `cascade:PatientProfileShape`
 * in core.shapes.ttl declares an `sh:path` for `cascade:emergencyContact`,
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
 * `PatientProfileShape` is probably not the fix either. `core.ttl:262`
 * describes a two-document Solid WebID model in which the name lives on a
 * SHAREABLE `foaf:Agent` card and `cascade:PatientProfile` holds only
 * health-specific data — the two are separate documents so that they can carry
 * different access-control policies. On that reading the shape is right and
 * this SDK is wrong to write the name here at all.
 *
 * Left refused rather than resolved, because resolving it is a cross-repo
 * change with an open question at the front of it (#35): `validate()` REQUIRES
 * `givenName` and `familyName`, `profile-001` and `profile-002` carry them in
 * their expected output, and `profile-003` — which follows the two-document
 * model — is the fixture `validate()` rejects.
 *
 * `triples()` is deliberately not used, and its own doc comment says why: a
 * blank node compares by its parser-assigned label, which is stable within one
 * parse and not across two, so a whole-graph comparison against
 * `expectedOutput.turtle` would read `_:b0_b1` against `_:b0_b3` as a
 * disagreement. There is no isomorphism helper in this repo. The blank nodes
 * are reached by TRAVERSAL instead — `out()` follows an edge without ever
 * naming the node it lands on.
 *
 * `parseTurtle` takes text, so the `serialize()` under test stays visible.
 *
 * @see spec/ontologies/core/v1/core.ttl  cascade:EmergencyContact, cascade:Address, cascade:PharmacyInfo
 */

import { describe, it, expect } from 'vitest';

import { serialize } from '../../src/serializer/turtle-serializer.js';
import { deserializeOne } from '../../src/deserializer/turtle-parser.js';
import { loadCascadeRecordFixture } from '../support/fixtures.js';
import { cascade, parseTurtle, rdf } from '../support/graph.js';
import type { PatientProfile } from '../../src/models/patient-profile.js';

const profile002 = loadCascadeRecordFixture('profile-002');

/** The record subject of `profile-002`, as a traversable pointer into what `serialize()` wrote. */
function serializedProfile() {
  const record = profile002.input;
  return parseTurtle(serialize(record)).namedNode(record.id);
}

describe('profile-002 — Full fields: Patient profile with emergency contact, address, pharmacy, and all demographics', () => {
  // `task.suite` is the enclosing describe. Asserting the title against the
  // fixture rather than repeating the string here keeps one copy of it, in the
  // place a reader sees first, and still fails if the corpus is reworded.
  it('is the fixture this file thinks it is', ({ task }) => {
    expect(task.suite?.name).toContain(profile002.description);
    expect(profile002.shouldAccept).toBe(true);
  });

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
