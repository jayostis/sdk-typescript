/**
 * Does anything outside `src/terms/` reach past the barrel?
 *
 * `src/terms/index.ts` is meant to be the only way in. It was not: seven
 * modules imported `../terms/term.js` directly, three of them alongside an
 * import of the barrel on the next line, so `term.ts` was a second public entry
 * point nobody had decided to have. That matters as soon as the folder is split
 * — a file broken out of `term.ts` is invisible to outsiders only if outsiders
 * were not already reaching in.
 *
 * A function over inputs the CALLER supplies, so a test can hand it sources
 * where it MUST speak before pointing it at ours — the same shape, and for the
 * same reason, as `unbarrelled` beside it.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Every `.ts` file under `dir`, recursively, as absolute paths. */
function sourcesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourcesUnder(full);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts') ? [full] : [];
  });
}

/**
 * `file -> specifier` for every import of a `src/terms/` file that is not the
 * barrel, made from outside `src/terms/`.
 *
 * Matches the SPECIFIER rather than resolving the module, because the specifier
 * is what a reader sees and what a refactor has to change. A comment mentioning
 * `terms/term.js` in prose is not an import and does not match: the pattern
 * requires the `from '...'` that only an import or a re-export can write.
 *
 * `index.js` is the door and is never a finding. Files inside `src/terms/`
 * import each other freely — that is the point of splitting the folder up.
 */
export function reachesPastTheBarrel(srcDir: string): string[] {
  const termsDir = join(srcDir, 'terms');

  return sourcesUnder(srcDir)
    .filter((file) => !file.startsWith(termsDir))
    .flatMap((file) => {
      const source = readFileSync(file, 'utf-8');
      const specifiers = [...source.matchAll(/from\s+'([^']*terms\/[^']+)'/g)].map((m) => m[1]!);

      return specifiers
        .filter((specifier) => !specifier.endsWith('/terms/index.js'))
        .map((specifier) => `${relative(srcDir, file).replace(/\\/g, '/')} -> ${specifier}`);
    })
    .sort();
}
