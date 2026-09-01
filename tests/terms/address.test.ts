/**
 * The `address` term: `cascade:address`, a typed blank node holding the
 * patient's postal address.
 *
 * Pure. No serializer, no fixture loader, no RDF library — a term returns DATA
 * and this file reads that data, so what fails here is the term's own rule and
 * nothing downstream of it. `tests/conformance/profile.test.ts` asks the other
 * half of the question, of a real graph.
 *
 * Six children, and the count is the claim. An address is the widest of the
 * three profile sub-structures, so it is where a writer that stops at the first
 * child, or drops the last, is cheapest to see: five of six is a deliverable
 * address missing its country, and nothing about the output says a field went
 * missing.
 *
 * Reached through `termFor` rather than by importing the module, so the
 * assertions also say the term is REGISTERED. A term left out of
 * `src/terms/index.ts` is dead code that still compiles: the serializer takes
 * its type-driven default and nothing about the SDK's output has changed.
 *
 * @see spec/ontologies/core/v1/core.ttl  cascade:Address
 */

import { describe, it, expect } from 'vitest';

import { termFor } from '../../src/terms/index.js';

const PROFILE_ID = 'urn:uuid:a1b2c3d4-e5f6-7890-abcd-ef1234567890';

describe('address', () => {
  it('is a registered term keyed on the field, under the predicate spec declares', () => {
    const term = termFor('address');

    expect(term?.key).toBe('address');
    expect(term?.predicate).toBe('cascade:address');
  });

  it('writes one typed blank node whose children are all six address fields', () => {
    // profile-002's input verbatim, in the order the fixture gives it.
    expect(
      termFor('address')?.outputsFor({
        id: PROFILE_ID,
        type: 'PatientProfile',
        address: {
          addressLine: '742 Evergreen Terrace',
          addressCity: 'Portland',
          addressState: 'OR',
          addressPostalCode: '97205',
          addressCountry: 'US',
          addressUse: 'home',
        },
      }),
    ).toEqual([
      {
        kind: 'blankNode',
        predicate: 'cascade:address',
        rdfType: 'cascade:Address',
        children: [
          { kind: 'literal', predicate: 'cascade:addressLine', value: '742 Evergreen Terrace' },
          { kind: 'literal', predicate: 'cascade:addressCity', value: 'Portland' },
          { kind: 'literal', predicate: 'cascade:addressState', value: 'OR' },
          { kind: 'literal', predicate: 'cascade:addressPostalCode', value: '97205' },
          { kind: 'literal', predicate: 'cascade:addressCountry', value: 'US' },
          { kind: 'literal', predicate: 'cascade:addressUse', value: 'home' },
        ],
      },
    ]);
  });

  it('writes addressType, which cascade:AddressShape declares beside the six', () => {
    // The seventh child. `cascade:AddressShape` gives `cascade:addressType` an
    // `sh:in ( "postal" "physical" "both" )`, so it is constrained vocabulary
    // rather than a spelling nobody declares — and now that `children` is
    // declared, an undeclared key is DROPPED rather than written. A caller
    // passing it got a node with the type silently missing.
    expect(
      termFor('address')?.outputsFor({
        id: PROFILE_ID,
        type: 'PatientProfile',
        address: { addressLine: '742 Evergreen Terrace', addressType: 'postal' },
      }),
    ).toEqual([
      {
        kind: 'blankNode',
        predicate: 'cascade:address',
        rdfType: 'cascade:Address',
        children: [
          { kind: 'literal', predicate: 'cascade:addressLine', value: '742 Evergreen Terrace' },
          { kind: 'literal', predicate: 'cascade:addressType', value: 'postal' },
        ],
      },
    ]);
  });

  it('writes only the fields a partial address actually carries', () => {
    // Every field of `Address` is optional in the model, and a profile
    // imported from a source that holds only a city and a state is ordinary.
    // The absent four are absent, not empty strings: `cascade:addressCountry ""`
    // is a country claim, and a reader cannot tell it from a real one.
    expect(
      termFor('address')?.outputsFor({
        id: PROFILE_ID,
        type: 'PatientProfile',
        address: { addressCity: 'Portland', addressState: 'OR' },
      }),
    ).toEqual([
      {
        kind: 'blankNode',
        predicate: 'cascade:address',
        rdfType: 'cascade:Address',
        children: [
          { kind: 'literal', predicate: 'cascade:addressCity', value: 'Portland' },
          { kind: 'literal', predicate: 'cascade:addressState', value: 'OR' },
        ],
      },
    ]);
  });

  it('writes nothing for a profile that carries no address', () => {
    // The common case — profile-001 and profile-003 through profile-005 all
    // omit the field.
    expect(termFor('address')?.outputsFor({ id: PROFILE_ID, type: 'PatientProfile' })).toEqual([]);
  });
});
