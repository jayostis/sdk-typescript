/**
 * Remove `dist/` whole, before anything writes to it.
 *
 * `dist/` is a product of `src/`; nothing in it is worth keeping. Three
 * writers produce it and none of them removes: tsc emits beside whatever is
 * already there, so a renamed or deleted `src/` module leaves its stale `.js`
 * and `.d.ts` in `dist/` as an importable module; `copy-spec-data.mjs` copies
 * file by file, so a renamed or dropped ontology under `src/spec/` survives in
 * `dist/spec/` and ships; and `cpSync` in `copy-vendor.mjs` merges, which is
 * how the `{"type": "commonjs"}` marker of the eight-file n3 outlived the
 * one-file bundle that replaced it (#95) — Node read the new `n3.js` beside it
 * as CommonJS and `import` of the built package failed, on a tree where
 * `npm run build` had just exited 0.
 *
 * One removal at the front of `npm run build` covers all three, rather than a
 * removal inside the copier that happened to bite. Nothing is refused: a
 * fresh clone has no `dist/`, and the first build must not fail on the absence
 * of the thing it is about to create.
 *
 * ANCHORED TO THE REPOSITORY, NOT TO THE SHELL. This is the one script under
 * `scripts/` that deletes, and a forced recursive `rmSync` has no accidental
 * guard: resolved against `process.cwd()`, `node sdk-typescript/scripts/clean-dist.mjs`
 * from a parent directory or a workspace root removed THAT directory's
 * `dist/`, printed "removed", exited 0, and left the stale one this exists to
 * remove. The target is the tree this file lives in. A test hands it a scratch
 * tree as the one positional argument, so the test never points it at the real
 * one and the default never points it at the caller's.
 *
 * @module scripts/clean-dist
 */

import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const tree = process.argv[2] ? resolve(process.argv[2]) : ROOT;
const OUT = resolve(tree, 'dist');

const existed = existsSync(OUT);
rmSync(OUT, { recursive: true, force: true });
console.log(existed ? `clean-dist: removed ${OUT}` : `clean-dist: no ${OUT} to remove`);
