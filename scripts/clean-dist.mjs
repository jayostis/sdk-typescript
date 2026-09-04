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
 * @module scripts/clean-dist
 */

import { existsSync, rmSync } from 'node:fs';

const OUT = 'dist';

const existed = existsSync(OUT);
rmSync(OUT, { recursive: true, force: true });
console.log(existed ? `clean-dist: removed ${OUT}/` : `clean-dist: no ${OUT}/ to remove`);
