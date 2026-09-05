/**
 * Is the module at `importMetaUrl` the one `node` was started with?
 *
 * Compared through `realpathSync`, because Node resolves the main module
 * through symlinks before it runs it (`--preserve-symlinks-main` is what turns
 * that off): `import.meta.url` is the real path, `process.argv[1]` is the one
 * typed. `resolve(process.argv[1]) === fileURLToPath(import.meta.url)` was
 * false through a directory junction on Windows, a symlinked checkout or a
 * `subst` drive — and a script whose main guard is false does nothing and
 * exits 0. `check-browser-bundle.mjs` reported no verdict for D-BROWSER-1;
 * `vendor-n3.mjs` wrote nothing. `tests/scripts/check-browser-bundle.test.ts`
 * runs the gate through a junction.
 *
 * `fs.realpathSync`, not `.native`: the ESM loader realpaths the main entry
 * with the same JavaScript implementation, so the two sides agree on exactly
 * what a symlink resolves to.
 *
 * @module scripts/lib/main-module
 */

import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * @param {string} importMetaUrl - The caller's `import.meta.url`.
 * @returns {boolean} True when the caller is the script `node` was given.
 */
export function isMainModule(importMetaUrl) {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(importMetaUrl));
  } catch {
    // `argv[1]` is not a path on disk — `node -e`, a REPL, a loader hook.
    return false;
  }
}
