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
import { childPredicatesOf, writesBlankNode } from './term.js';
import { address } from './address.js';
import { biologicalSex } from './biological-sex.js';
import { clinicalSummary } from './clinical-summary.js';
import { dateOfBirth } from './date-of-birth.js';
import { interpretation } from './interpretation.js';
import { dataAbsentReason } from './data-absent-reason.js';
import { emergencyContact } from './emergency-contact.js';
import { interpretationSourceCode } from './interpretation-source-code.js';
import { preferredPharmacy } from './preferred-pharmacy.js';
import { resultValue } from './result-value.js';

/**
 * Every term module, one line each. Add the import above and the name here in
 * the same edit; the barrel-completeness check names any file left out.
 *
 * Imported, never re-exported. A term is data this module reads, not a symbol
 * anything outside it has a reason to hold: `termFor` is the whole surface, and
 * re-exporting `dataAbsentReason` would let a caller reach a rule while
 * bypassing the map that decides which rule applies. The import alone satisfies
 * the completeness check, which reads the specifier and not the export.
 *
 * A term is only reachable once it is listed HERE. `termFor` reads this array,
 * so a term left out of it is dead code whose field goes on taking the
 * serializer's type-driven default.
 */
const TERMS: readonly Term[] = Object.freeze([
  address,
  biologicalSex,
  clinicalSummary,
  dateOfBirth,
  interpretation,
  dataAbsentReason,
  emergencyContact,
  interpretationSourceCode,
  preferredPharmacy,
  resultValue,
]);

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

/**
 * Every predicate spelling a term can WRITE, mapped back to the JSON key that
 * produced it: `prefix:localName -> jsonKey`.
 *
 * A reader must accept everything the writer can emit, and a term is where the
 * writer's choices are declared — so this is that obligation computed rather
 * than transcribed. Three sources, and only the first comes free from inverting
 * `PROPERTY_PREDICATES`:
 *
 * - `predicate`, the registered one;
 * - every `predicateByType` value, which nothing else inverts — a vital sign's
 *   `clinical:interpretationSourceCode` was hand-written into the deserializer
 *   for exactly this reason;
 * - every declared blank-node child.
 *
 * What it deliberately does NOT produce is a spelling this SDK only ever READS:
 * the classes clinical v1.13 deprecated, and the `cascade:` aliases core v3.4
 * requires readers to accept. Nothing on the write side knows those exist, so
 * no derivation can find them and they stay hand-written.
 */
export function termSpellings(): Record<string, string> {
  const spellings: Record<string, string> = {};
  for (const term of TERMS) {
    spellings[term.predicate] = term.key;
    for (const override of Object.values(term.predicateByType ?? {})) {
      spellings[override] = term.key;
    }
    for (const [childKey, predicate] of Object.entries(childPredicatesOf(term))) {
      spellings[predicate] = childKey;
    }
  }
  return spellings;
}

/**
 * Every term, for a check that has to run over fields the record does NOT
 * carry.
 *
 * `termFor` answers "what is declared about this key", which is enough for
 * every rule about a value that is present. `minCountByType` is about a value
 * that is absent, and an absent field cannot be reached by walking the record —
 * so this walks the declarations instead.
 *
 * Returns the array itself, which is frozen: a caller can read it and cannot
 * make the registry disagree with `termFor`.
 */
export function allTerms(): readonly Term[] {
  return TERMS;
}

/**
 * The JSON keys of every term that writes an inline blank node for ANY record
 * type — its base rule, or a `ruleByType` override.
 *
 * Reading `t.rule` alone left a term whose node is reachable only through
 * `ruleByType` out of `NESTED_BLANK_NODE_FIELDS`, so the reader returned the
 * bare blank-node identifier and dropped every child. See
 * {@link writesBlankNode}, which `childPredicatesOf` shares so the two cannot
 * disagree about which terms nest.
 */
export function blankNodeTermKeys(): string[] {
  return TERMS.filter(writesBlankNode).map((t) => t.key);
}

/**
 * Every declared blank-node child predicate, `childKey -> prefix:localName`.
 *
 * The deserializer's reverse map and the JSON-LD context are both built from
 * this, so the twelve exist as data in exactly one place — the term that writes
 * them. A term that has not declared its children contributes nothing, which is
 * what lets the old hand-written entries be retired one term at a time.
 *
 * Two terms declaring the same child key under the same prefix is not a
 * conflict — `contactPhone` means one predicate wherever it appears. Two terms
 * declaring it under DIFFERENT prefixes is, and throws here rather than letting
 * barrel order decide which spelling the reader accepts.
 */
export function childPredicates(): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const term of TERMS) {
    for (const [childKey, predicate] of Object.entries(childPredicatesOf(term))) {
      const claimed = merged[childKey];
      if (claimed && claimed !== predicate) {
        throw new Error(
          `Child '${childKey}' is declared as both ${claimed} and ${predicate}. ` +
            `One child key is one predicate; give them different names or one prefix.`,
        );
      }
      merged[childKey] = predicate;
    }
  }
  return merged;
}
