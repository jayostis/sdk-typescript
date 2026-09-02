/**
 * Every `sh:path` a nested node's shape declares is a child its term declares.
 *
 * THE OBLIGATION THIS FILE EXISTS TO ENFORCE. `validate()` reads a term's
 * `children` map as the complete list of what a blank node may legally carry —
 * anything else is reported as declared by no vocabulary. That is only true
 * while the map keeps up with the shape, and the cost of it falling behind
 * changed when the check was added: a child the shape declares and the term
 * forgets used to be a silent DROP by the writer, and is now a false REJECTION
 * by the validator. Louder, and wrong in a new way.
 *
 * It is not a hypothetical drift. `clinical-summary` shipped declaring 8 of
 * `cascade:RecordSummaryShape`'s 13 counts, and `address` shipped without
 * `addressType`; both were found by reading the shape by hand, which is the
 * method this file replaces. `cascade:AddressShape`'s five simplified aliases
 * were found the same way, by which point the third hand-count was clearly one
 * too many.
 *
 * Derived rather than listed. The term's own `rdfType` selects the shape — a
 * blank node written `a cascade:Address` is judged by whatever declares
 * `sh:targetClass cascade:Address` — so a term that changes the class it writes
 * moves to the shape it is actually validated against, and a term that names a
 * class no shape targets is reported rather than skipped. A hand-written
 * term-to-shape table would go stale in exactly the way the children maps did.
 *
 * ONE DIRECTION ONLY, deliberately. A child the term declares and the shape
 * does not is NOT an error here: `cascade:PharmacyInfoShape` gives
 * `pharmacyAddress` an sh:path but the model may legitimately carry fields spec
 * has not yet shaped, and the writer is entitled to be ahead. It is the reverse
 * — the shape ahead of the term — that produces the false rejection.
 *
 * @see tests/rules/undeclared-child.test.ts  the rule this obligation serves
 * @see tests/support/spec-sources.ts  how the shapes get here
 */

import { describe, it, expect } from 'vitest';

import { allTerms } from '../../src/terms/index.js';
import { childPredicatesOf } from '../../src/terms/index.js';
import { shapesGraph, expand, SHACL_NS } from '../support/spec-sources.js';

const SHAPES = shapesGraph();

/**
 * Every `sh:path` IRI reachable from the node shape targeting `classIri`.
 *
 * Walked over the raw quads rather than through a SHACL library: the property
 * shapes are blank nodes hanging off the node shape by `sh:property`, and the
 * two hops are the whole traversal. `null` distinguishes "no shape targets this
 * class" from "a shape targets it and declares nothing", which are different
 * findings and get different messages.
 */
function pathsOfShapeTargeting(classIri: string): Set<string> | null {
  const nodeShapes = [...SHAPES]
    .filter((q) => q.predicate.value === `${SHACL_NS}targetClass` && q.object.value === classIri)
    .map((q) => q.subject.value);
  if (nodeShapes.length === 0) return null;

  const propertyShapes = new Set(
    [...SHAPES]
      .filter((q) => q.predicate.value === `${SHACL_NS}property` && nodeShapes.includes(q.subject.value))
      .map((q) => q.object.value),
  );

  return new Set(
    [...SHAPES]
      .filter(
        (q) =>
          q.predicate.value === `${SHACL_NS}path` &&
          propertyShapes.has(q.subject.value) &&
          q.object.termType === 'NamedNode',
      )
      .map((q) => q.object.value),
  );
}

/** Every term that writes a typed blank node and has declared its children. */
const NESTED_TERMS = allTerms().filter(
  (term) => term.rule.form === 'blankNode' && term.rule.children && term.rule.rdfType,
);

describe('a term declares every child its shape does', () => {
  it('finds the terms to check, so an empty sweep cannot pass', () => {
    // Without this the file reports green the day `allTerms()` returns nothing,
    // or the day the filter stops matching — a vacuous pass in a file whose
    // whole subject is vacuous passes.
    expect(NESTED_TERMS.map((t) => t.key).sort()).toEqual([
      'address',
      'clinicalSummary',
      'emergencyContact',
      'preferredPharmacy',
    ]);
  });

  it.each(NESTED_TERMS.map((term) => [term.key, term] as const))(
    '%s declares every sh:path on its shape',
    (key, term) => {
      const classIri = expand(term.rule.rdfType as string);
      const declared = pathsOfShapeTargeting(classIri);

      expect(
        declared,
        `no shape spec publishes declares sh:targetClass <${classIri}>, so nothing judges the children `
          + `${key} writes and validate() is their only reader`,
      ).not.toBeNull();

      const written = new Set(Object.values(childPredicatesOf(term)).map(expand));
      const missing = [...(declared as Set<string>)].filter((iri) => !written.has(iri)).sort();

      expect(
        missing,
        `${key} would REJECT a conformant node carrying ${missing.join(', ')}: its shape declares `
          + `an sh:path for ${missing.length === 1 ? 'it' : 'them'} and the term declares no child, `
          + 'so validate() reports a value spec permits as declared by no vocabulary',
      ).toEqual([]);
    },
  );
});
