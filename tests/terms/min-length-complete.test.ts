/**
 * Every `sh:minLength` a vendored shape puts on a predicate a term claims, that
 * term declares.
 *
 * THE DRIFT THIS CATCHES is the quiet one. `sh:maxCount` and `sh:in` falling
 * behind produce a false ACCEPT — a record with three values or an invented code
 * comes back clean — and so does this: a required field satisfied by `''` is a
 * record that passed without being looked at. `validate()` is the only judge a
 * consumer can reach, `rdf-validate-shacl` being a devDependency, so a length
 * the shapes declare and no term carries is a rule that ships unenforced.
 *
 * It has already happened once, which is why the file exists. `Constraint`
 * carried a `minLength` field that nothing read for the whole life of
 * `CascadeEntityValidator`, and `medicationName: { minCount: 1, minLength: 1 }`
 * looked like a transcribed shape while accepting the empty string.
 *
 * ONE DIRECTION ONLY, the same asymmetry {@link ./children-complete.test.ts}
 * takes: a term declaring a length the shapes do not is NOT reported here. A
 * term is entitled to be ahead of `spec`, and the failure mode that matters is
 * the shape being ahead of the term.
 *
 * TERMED PREDICATES ONLY. 28 predicates carry an `sh:minLength` and six are
 * termed; the other 22 have no term to hang a rule on and are not this file's
 * business — they are the general "a field with no term has no term rules" gap
 * that `maxCount` has too. What is reported is a predicate a term ALREADY
 * claims, whose shape says something the term does not.
 *
 * @see tests/rules/min-length.test.ts  the rule this obligation serves
 * @see tests/shapes/README.md          how the shapes get here
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { allTerms } from '../../src/terms/index.js';
import { NAMESPACES } from '../../src/vocabularies/namespaces.js';
import { parseDataset } from '../support/graph.js';

const shapesDir = resolve(dirname(fileURLToPath(import.meta.url)), '../shapes');
const MANIFEST = JSON.parse(readFileSync(resolve(shapesDir, 'vendored.json'), 'utf-8')) as Record<
  string,
  { specPath: string }
>;

const SHAPES = parseDataset(
  Object.keys(MANIFEST)
    .sort()
    .map((f) => readFileSync(resolve(shapesDir, f), 'utf-8'))
    .join('\n'),
);

const SHACL = 'http://www.w3.org/ns/shacl#';

/** `prefix:localName` → full IRI, so a term's spelling can be compared to a shape's. */
function expand(curie: string): string {
  const [prefix, local] = curie.split(':');
  const ns = (NAMESPACES as Record<string, string>)[prefix];
  return ns ? `${ns}${local}` : curie;
}

/**
 * predicate IRI → the longest `sh:minLength` any shape puts on it.
 *
 * The MAXIMUM, because a term carries one flat number for a predicate that may
 * appear in several shapes: satisfying the longest satisfies them all. Today
 * every declared value is 1 and the choice is invisible, which is exactly when
 * to make it deliberately — the alternative, taking whichever the parse
 * happened to reach last, is a silent answer to a question nobody asked.
 *
 * Walked over raw quads rather than through a SHACL library, as
 * `children-complete` does: a property shape is a blank node carrying both
 * `sh:path` and `sh:minLength`, and joining those two on the subject is the
 * whole traversal.
 */
const SHAPE_MIN_LENGTHS: ReadonlyMap<string, number> = (() => {
  const pathOf = new Map<string, string>();
  for (const q of SHAPES) {
    if (q.predicate.value === `${SHACL}path` && q.object.termType === 'NamedNode') {
      pathOf.set(q.subject.value, q.object.value);
    }
  }

  const longest = new Map<string, number>();
  for (const q of SHAPES) {
    if (q.predicate.value !== `${SHACL}minLength`) continue;
    const path = pathOf.get(q.subject.value);
    if (!path) continue;
    const declared = Number(q.object.value);
    longest.set(path, Math.max(longest.get(path) ?? 0, declared));
  }

  return longest;
})();

/** Every predicate spelling a term writes — its default and each per-type override. */
function predicatesOf(term: { predicate: string; predicateByType?: Record<string, string> }): string[] {
  return [...new Set([term.predicate, ...Object.values(term.predicateByType ?? {})])].map(expand);
}

/** Every term whose predicates include at least one the shapes give a minLength. */
const TERMS_ON_CONSTRAINED_PREDICATES = allTerms().filter((term) =>
  predicatesOf(term).some((iri) => SHAPE_MIN_LENGTHS.has(iri)),
);

describe('the shapes were read at all', () => {
  it('finds sh:minLength in the vendored shapes, so an empty sweep cannot pass', () => {
    // The whole file is derived from this map. If the traversal breaks — a
    // reshaped shapes file, a renamed vendored copy — every assertion below
    // passes on nothing, which is the failure this file is about.
    expect(SHAPE_MIN_LENGTHS.size).toBeGreaterThanOrEqual(28);
  });

  it('finds the terms sitting on those predicates', () => {
    expect(TERMS_ON_CONSTRAINED_PREDICATES.map((t) => t.key).sort()).toEqual([
      'allergen',
      'conditionName',
      'medicationName',
      'providerName',
      'relationship',
      'testName',
      'vaccineName',
    ]);
  });
});

describe('a term carries the minLength its predicate is given', () => {
  it.each(TERMS_ON_CONSTRAINED_PREDICATES.map((term) => [term.key, term] as const))(
    '%s declares the sh:minLength its shape does',
    (key, term) => {
      const required = Math.max(
        ...predicatesOf(term).map((iri) => SHAPE_MIN_LENGTHS.get(iri) ?? 0),
      );

      expect(
        term.minLength,
        `a shape gives ${key}'s predicate an sh:minLength ${required} and the term declares `
          + 'none, so validate() accepts an empty string for it — a required field satisfied '
          + 'without being looked at, and nothing a consumer installs can catch it',
      ).toBeDefined();

      expect(
        term.minLength as number,
        `${key} declares minLength ${term.minLength} where a shape asks for ${required}`,
      ).toBeGreaterThanOrEqual(required);
    },
  );
});
