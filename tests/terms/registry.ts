/**
 * Does the barrel list every term file on disk?
 *
 * The one registry question `src/` cannot ask about itself. Tests are not
 * bundled and `src/` is, so this is the only place that can read the directory
 * and still be true of what consumers install.
 *
 * The other two invariants are not here. No duplicate key is enforced where
 * `src/terms/index.ts` builds its map, and no key outside the vocabulary is
 * enforced by `defineTerm` — both throw, so they hold for every consumer and
 * cannot be skipped by forgetting to assert them. A check that must be
 * remembered is a weaker thing than one that cannot be avoided.
 *
 * A function over inputs the CALLER supplies, so a test can hand it a directory
 * where it MUST speak before pointing it at ours.
 */

import { readdirSync } from 'node:fs';

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

