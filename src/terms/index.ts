/**
 * Barrel over the term modules.
 *
 * Hand-written on purpose. `readdirSync` cannot be used here: consumers install
 * `dist`, and every bundler resolves imports statically. Self-registration does
 * not help either — nothing imports a term file unless something lists it, and
 * it buys import-order dependence and defeats tree-shaking. So each term is
 * imported by name below and the `Map` is built from that list, and
 * `tests/terms/registry.test.ts` does the dynamic directory read `src/` cannot,
 * since tests are not bundled.
 *
 * @module terms
 */

export * from './term.js';

import type { Term } from './term.js';

/**
 * Every term module, one line each. Add the import above and the name here in
 * the same edit; the barrel-completeness check names any file left out.
 *
 * Empty for now: this issue establishes the mechanism, and the first real term
 * arrives with its first consumer.
 */
const TERMS: readonly Term[] = Object.freeze([]);

/**
 * Built with an explicit loop rather than `new Map(TERMS.map(...))`, which
 * keeps the last of two terms claiming one key and reports nothing. Which of
 * them won would then depend on barrel order, and the loser's rule would be
 * unreachable with no way to notice.
 *
 * An invariant enforced here holds for every consumer and every test, and
 * cannot be skipped by forgetting to assert it. `defineTerm` guards the other
 * one — a term's key must be registered vocabulary — at declaration.
 */
const BY_KEY: ReadonlyMap<string, Term> = (() => {
  const byKey = new Map<string, Term>();
  for (const term of TERMS) {
    const claimed = byKey.get(term.key);
    if (claimed) {
      throw new Error(
        `Two terms claim '${term.key}': ${claimed.predicate} and ${term.predicate}. ` +
          `One field is declared by one module; delete or rename one of them.`,
      );
    }
    byKey.set(term.key, term);
  }
  return byKey;
})();

/**
 * The term that claims `key`, or `undefined` when no module claims it — not an
 * error: the registered fields with no rule reach the serializer's type-driven
 * defaults.
 */
export function termFor(key: string): Term | undefined {
  return BY_KEY.get(key);
}
