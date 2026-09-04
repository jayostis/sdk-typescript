/**
 * One recursive directory walk, for the scripts that need one.
 *
 * `copy-vendor.mjs` and `copy-spec-data.mjs` each carried their own, identical
 * but for the loop variable's name. Both exist to prove that a directory
 * reached `dist/` and to count what did, so a change to what "every file under
 * here" means — symlinks, dotfiles, a directory to skip — is a change both need
 * and neither had a reason to receive. A shared function is the forcing
 * function; two copies are two chances to fix the wrong one.
 *
 * @module scripts/lib/walk
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every file under `dir`, recursively, as paths joined onto `dir`.
 *
 * Files only — a directory is descended into rather than returned — so the
 * result counts and sizes what a copy actually put on disk.
 *
 * @param {string} dir - The directory to walk.
 * @returns {string[]} Every file beneath it.
 */
export function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]);
}
