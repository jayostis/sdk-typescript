/**
 * A blank-node rule reached through `ruleByType`.
 *
 * `TermSpec` lets a term vary its RULE by record type, the same way
 * `predicateByType` varies its predicate — and two derivations read `spec.rule`
 * alone: `childPredicatesOf` (`term.ts`) and `blankNodeTermKeys`
 * (`terms/index.ts`). `defineTerm` already validates children across both, so
 * the declaration is accepted and then half-read.
 *
 * WHAT BREAKS, if one is ever declared. `childPredicatesOf` feeds the
 * deserializer's reverse map and the JSON-LD context; `blankNodeTermKeys` feeds
 * `NESTED_BLANK_NODE_FIELDS`. A term writing a node through `ruleByType` would
 * write it correctly and be unreadable — the node comes back as the bare
 * blank-node identifier `"_:b0"`, every child lost, which is the exact failure
 * #27 documented for the three profile sub-structures.
 *
 * LATENT TODAY, and deliberately tested anyway. No term in the registry
 * declares a `ruleByType` at all, so nothing misbehaves; this is a trap for
 * whoever adds the first one, and a trap is cheaper to close before it is
 * sprung. The registry's emptiness is asserted below rather than assumed, so
 * the day that stops being true the claim is re-checked rather than silently
 * outdated.
 *
 * @see tests/terms/children-complete.test.ts  the sibling obligation on children
 */

import { describe, it, expect } from 'vitest';

import { allTerms, blankNodeTermKeys } from '../../src/terms/index.js';
import { childPredicatesOf, defineTerm, requirePredicate } from '../../src/terms/index.js';

/**
 * A term whose blank node is reachable ONLY through `ruleByType`.
 *
 * Built with `defineTerm` rather than as a bare object literal: the point is
 * that this declaration is legal — `defineTerm` accepts it and checks its
 * children — so a derivation that ignores it is reading less than the term
 * says, not refusing something malformed.
 *
 * Not registered in the barrel, so it changes nothing about the running SDK.
 * `key: 'address'` because `defineTerm` calls `requirePredicate(key)` and a
 * term keyed on a field spec does not define cannot be constructed at all.
 */
const nodeByType = defineTerm({
  key: 'address',
  predicate: requirePredicate('address'),
  rule: { form: 'literal' },
  ruleByType: {
    PatientProfile: {
      form: 'blankNode',
      rdfType: 'cascade:Address',
      children: { addressCity: { form: 'literal' } },
    },
  },
});

/** A term declaring a blank node in BOTH places, with different children. */
const nodeInBoth = defineTerm({
  key: 'address',
  predicate: requirePredicate('address'),
  rule: {
    form: 'blankNode',
    rdfType: 'cascade:Address',
    children: { addressLine: { form: 'literal' } },
  },
  ruleByType: {
    PatientProfile: {
      form: 'blankNode',
      rdfType: 'cascade:Address',
      children: { addressCity: { form: 'literal' } },
    },
  },
});

/** A term with no `ruleByType` at all — the shape every term has today. */
const nodeOnBaseRule = defineTerm({
  key: 'address',
  predicate: requirePredicate('address'),
  rule: {
    form: 'blankNode',
    rdfType: 'cascade:Address',
    children: { addressLine: { form: 'literal' } },
  },
});

describe('a blank node declared through ruleByType', () => {
  describe('childPredicatesOf', () => {
    it('reports the children of a node only reachable by record type', () => {
      // The defect. `rule.form` is `literal` here, so the function returns `{}`
      // and the child never reaches the reverse map or the JSON-LD context —
      // while `childrenOf` writes it, because the writer resolves the active
      // rule per record and this does not.
      expect(childPredicatesOf(nodeByType)).toEqual({
        addressCity: 'cascade:addressCity',
      });
    });

    it('reports the children of both rules, not one instead of the other', () => {
      // A term may write a node for every type AND a different node for one of
      // them. Reading only `ruleByType` would be the same defect mirrored, so
      // the claim is the union — asserted with a child in each place, because a
      // fix that replaced the base rule would pass a test that only had one.
      expect(childPredicatesOf(nodeInBoth)).toEqual({
        addressLine: 'cascade:addressLine',
        addressCity: 'cascade:addressCity',
      });
    });

    it('is unchanged for a term with no ruleByType', () => {
      // The regression guard. Every term in the registry has this shape, so a
      // fix that widened the walk and disturbed the ordinary case would break
      // the reverse map and the context for all four blank-node terms at once.
      expect(childPredicatesOf(nodeOnBaseRule)).toEqual({
        addressLine: 'cascade:addressLine',
      });
    });
  });

  describe('blankNodeTermKeys', () => {
    // NOT DIRECTLY TESTABLE, and the reason is worth stating rather than
    // working around. `blankNodeTermKeys()` reads the module-level `TERMS`
    // barrel, which takes no injection, so a term declared in this file cannot
    // reach it — unlike `childPredicatesOf`, which takes the spec as an
    // argument. What can be asserted is the pair's AGREEMENT, and the fact that
    // makes that assertion vacuous today.

    it('lists every term that declares children anywhere', () => {
      // The invariant: a term whose children are in the reverse map must also
      // be in `NESTED_BLANK_NODE_FIELDS`, or the reader knows the child
      // predicates and never reconstructs the node to put them in.
      //
      // VACUOUS WHILE THE REGISTRY HAS NO `ruleByType` — see the assertion
      // below, which is what dates this one. It becomes the real check the day
      // the first is declared, and it fails then rather than after someone
      // debugs a `"_:b0"`.
      const declaringChildren = allTerms()
        .filter((term) => Object.keys(childPredicatesOf(term)).length > 0)
        .map((term) => term.key);

      expect(blankNodeTermKeys()).toEqual(expect.arrayContaining(declaringChildren));
    });

    it('has no ruleByType in the registry, which is what makes the check above vacuous', () => {
      // Asserted rather than assumed, so the vacuity is dated. When this goes
      // red, the test above has started meaning something and both should be
      // re-read together — the fix is to remove this one, not to widen it.
      expect(allTerms().filter((term) => term.ruleByType !== undefined)).toEqual([]);
    });
  });
});
