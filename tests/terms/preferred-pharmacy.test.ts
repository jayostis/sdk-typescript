/**
 * The `preferredPharmacy` term: `cascade:preferredPharmacy`, a typed blank node
 * holding where this patient's prescriptions get filled.
 *
 * Pure. No serializer, no fixture loader, no RDF library — a term returns DATA
 * and this file reads that data, so what fails here is the term's own rule and
 * nothing downstream of it. `tests/conformance/profile.test.ts` asks the other
 * half of the question, of a real graph.
 *
 * The `rdf:type` is the one that does not match its field name:
 * `preferredPharmacy` carries `cascade:PharmacyInfo`, where the emergency
 * contact and the address each carry a class spelled like their own key. A
 * rule that derived the type from the key would be right twice and wrong here,
 * and `cascade:PreferredPharmacy` is a class no ontology declares and no shape
 * targets — valid Turtle that validates vacuously.
 *
 * Reached through `termFor` rather than by importing the module, so the
 * assertions also say the term is REGISTERED. A term left out of
 * `src/terms/index.ts` is dead code that still compiles: the serializer takes
 * its type-driven default and nothing about the SDK's output has changed.
 *
 * @see spec/ontologies/core/v1/core.ttl  cascade:PharmacyInfo
 */

import { describe, it, expect } from 'vitest';

import { termFor } from '../../src/terms/index.js';

const PROFILE_ID = 'urn:uuid:a1b2c3d4-e5f6-7890-abcd-ef1234567890';

describe('preferredPharmacy', () => {
  it('is a registered term keyed on the field, under the predicate spec declares', () => {
    const term = termFor('preferredPharmacy');

    expect(term?.key).toBe('preferredPharmacy');
    expect(term?.predicate).toBe('cascade:preferredPharmacy');
  });

  it('writes one blank node typed cascade:PharmacyInfo, not one named for the field', () => {
    // profile-002's input verbatim.
    expect(
      termFor('preferredPharmacy')?.outputsFor({
        id: PROFILE_ID,
        type: 'PatientProfile',
        preferredPharmacy: {
          pharmacyName: 'Cascade Pharmacy',
          pharmacyAddress: '100 NW 23rd Ave, Portland, OR 97210',
          pharmacyPhone: '555-0199',
        },
      }),
    ).toEqual([
      {
        kind: 'blankNode',
        predicate: 'cascade:preferredPharmacy',
        rdfType: 'cascade:PharmacyInfo',
        children: [
          { kind: 'literal', predicate: 'cascade:pharmacyName', value: 'Cascade Pharmacy' },
          {
            kind: 'literal',
            predicate: 'cascade:pharmacyAddress',
            value: '100 NW 23rd Ave, Portland, OR 97210',
          },
          { kind: 'literal', predicate: 'cascade:pharmacyPhone', value: '555-0199' },
        ],
      },
    ]);
  });

  it('writes nothing for a profile that names no preferred pharmacy', () => {
    // The common case — profile-001 and profile-003 through profile-005 all
    // omit the field.
    expect(
      termFor('preferredPharmacy')?.outputsFor({ id: PROFILE_ID, type: 'PatientProfile' }),
    ).toEqual([]);
  });
});
