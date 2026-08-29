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

const BY_KEY: ReadonlyMap<string, Term> = new Map(TERMS.map((term) => [term.key, term]));

/**
 * Every registered term, in barrel order.
 *
 * Exists so the registry invariants can be run against the registry we SHIP,
 * not only against synthetic input. `duplicateKeys` and `unregisteredKeys`
 * proven on hand-built arrays say the detectors work; pointed here they say
 * this SDK is clean, which is the claim that matters. `unbarrelled` already
 * gets to make it by reading the directory.
 *
 * Reading it, not mutating it: the array is frozen, so a caller cannot register
 * a term at runtime and route the writer through vocabulary no module declares.
 */
export function allTerms(): readonly Term[] {
  return TERMS;
}

/**
 * The term that claims `key`, or `undefined` when no module claims it — not an
 * error: the registered fields with no rule reach the serializer's type-driven
 * defaults.
 */
export function termFor(key: string): Term | undefined {
  return BY_KEY.get(key);
}
