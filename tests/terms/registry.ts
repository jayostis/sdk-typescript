/**
 * Registry-wide checks over the term modules.
 *
 * Each is a function over inputs the CALLER supplies rather than something that
 * reads `src/terms/` directly, because a detector cannot be proven by pointing
 * it only at cases where it should stay silent. The tests hand each one input
 * where it MUST speak, and then point it at us.
 *
 * The directory read lives here rather than in `src/terms/index.ts` because
 * tests are not bundled and `src/` is: this is the one place that can look at
 * the filesystem and still be true of what consumers install.
 */

import { readdirSync } from 'node:fs';

import { PROPERTY_PREDICATES } from '../../src/vocabularies/namespaces.js';

/**
 * Basenames of the term files in `termsDir` that `barrelSource` does not
 * re-export.
 *
 * A file counts as barrelled when the barrel names its `./name.js` specifier,
 * which is what an import of it has to say. `index.ts` is the barrel itself and
 * is never one of its own entries.
 */
export function unbarrelled(termsDir: string, barrelSource: string): string[] {
  return readdirSync(termsDir)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.d.ts') && name !== 'index.ts')
    .filter((name) => !barrelSource.includes(`./${name.slice(0, -'.ts'.length)}.js`))
    .sort();
}

/** Keys claimed by more than one term in `terms`. */
export function duplicateKeys(terms: readonly { key: string }[]): string[] {
  const seen = new Set<string>();
  const duplicated = new Set<string>();

  for (const { key } of terms) {
    if (seen.has(key)) duplicated.add(key);
    seen.add(key);
  }

  return [...duplicated];
}

/** Keys in `terms` that are not registered in PROPERTY_PREDICATES. */
export function unregisteredKeys(terms: readonly { key: string }[]): string[] {
  const unregistered = terms
    .map(({ key }) => key)
    .filter((key) => !Object.prototype.hasOwnProperty.call(PROPERTY_PREDICATES, key));

  return [...new Set(unregistered)];
}
