/**
 * The `emergencyContact` term: `cascade:emergencyContact`, a typed blank node
 * holding the person to call about this patient.
 *
 * Pure. No serializer, no fixture loader, no RDF library — a term returns DATA
 * and this file reads that data, so what fails here is the term's own rule and
 * nothing downstream of it. `tests/conformance/profile.test.ts` asks the other
 * half of the question, of a real graph.
 *
 * The claim is that the MECHANISM works, which is separable from whether
 * `profile-002` happens to serialize. A blank-node term declares two things a
 * literal term does not — the `rdf:type` the node carries, and the namespace
 * its children are written under — and both are silent when wrong. An untyped
 * node is valid Turtle that no shape targets, and a child under the wrong
 * prefix is a valid triple that no query for the declared predicate finds.
 *
 * The children are NOT resolved through `PROPERTY_PREDICATES`; they are built
 * from the node's prefix and the JSON key. So a nested key and a top-level key
 * of the same name are different properties, and `cascade:contactPhone` is
 * written out by hand below rather than looked up — if `childrenOf` ever
 * became table-driven, that child would stop resolving and the expected
 * children would go short by one.
 *
 * Reached through `termFor` rather than by importing the module, so the
 * assertions also say the term is REGISTERED. A term left out of
 * `src/terms/index.ts` is dead code that still compiles: the serializer takes
 * its type-driven default and nothing about the SDK's output has changed.
 *
 * @see spec/ontologies/core/v1/core.ttl  cascade:EmergencyContact
 */

import { describe, it, expect } from 'vitest';

import { termFor } from '../../src/terms/index.js';

const PROFILE_ID = 'urn:uuid:a1b2c3d4-e5f6-7890-abcd-ef1234567890';

describe('emergencyContact', () => {
  it('is a registered term keyed on the field, under the predicate spec declares', () => {
    const term = termFor('emergencyContact');

    expect(term?.key).toBe('emergencyContact');
    expect(term?.predicate).toBe('cascade:emergencyContact');
  });

  it('writes one typed blank node whose children are the contact fields', () => {
    // profile-002's input verbatim. One output, not three: the three fields are
    // CHILDREN of a single node, and flattening them onto the record would
    // assert a phone number about the patient rather than about their contact.
    expect(
      termFor('emergencyContact')?.outputsFor({
        id: PROFILE_ID,
        type: 'PatientProfile',
        emergencyContact: {
          contactName: 'Maria Rivera',
          contactRelationship: 'spouse',
          contactPhone: '555-0142',
        },
      }),
    ).toEqual([
      {
        kind: 'blankNode',
        predicate: 'cascade:emergencyContact',
        rdfType: 'cascade:EmergencyContact',
        children: [
          { kind: 'literal', predicate: 'cascade:contactName', value: 'Maria Rivera' },
          { kind: 'literal', predicate: 'cascade:contactRelationship', value: 'spouse' },
          { kind: 'literal', predicate: 'cascade:contactPhone', value: '555-0142' },
        ],
      },
    ]);
  });

  it('writes nothing for a profile that names no emergency contact', () => {
    // The common case — profile-001 and profile-003 through profile-005 all
    // omit the field. An absent contact is not an empty one, and a term that
    // wrote one would put an anonymous node asserting nothing on most of the
    // corpus.
    expect(
      termFor('emergencyContact')?.outputsFor({ id: PROFILE_ID, type: 'PatientProfile' }),
    ).toEqual([]);
  });

  it('writes a child the term does not declare, leaving that to the validator', () => {
    // THE CASE THE DECLARATION EXISTS FOR, and it has a name:
    // `cascade:contactEmail`. #27 hand-mapped that spelling into the
    // deserializer on symmetry with `contactPhone`, and it appears nowhere in
    // spec but one prose aside in checkup.ttl. Read in on one side, it came
    // straight back out of the WRITER on the other — under no domain, no range
    // and no shape.
    //
    // Declaring the three children is what makes that REPORTABLE. It briefly
    // made it invisible instead: an undeclared key was dropped here, which
    // stopped the triple and not the defect — the caller's value vanished with
    // no error, and the record reached `validate()` with nothing left to
    // violate. Faithful first, judged second. The writer emits it and
    // `validate()` refuses it by name; `tests/rules/undeclared-child.test.ts`
    // is where the refusal is asserted, this file staying pure.
    //
    // Asserted as a WHOLE output rather than as one presence, so a change that
    // wrote the undeclared child by abandoning the declared ones would fail
    // here rather than pass.
    const outputs = termFor('emergencyContact')?.outputsFor({
      id: PROFILE_ID,
      type: 'PatientProfile',
      emergencyContact: { contactName: 'Maria Rivera', contactEmail: 'maria@example.com' },
    });

    expect(outputs).toEqual([
      {
        kind: 'blankNode',
        predicate: 'cascade:emergencyContact',
        rdfType: 'cascade:EmergencyContact',
        children: [
          { kind: 'literal', predicate: 'cascade:contactName', value: 'Maria Rivera' },
          { kind: 'literal', predicate: 'cascade:contactEmail', value: 'maria@example.com' },
        ],
      },
    ]);
  });
});
