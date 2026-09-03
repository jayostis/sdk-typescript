/**
 * Copy `src/vendor/` into `dist/vendor/`, verbatim.
 *
 * WHY THIS IS NOT tsc's JOB. `tsconfig.json` has `include: ["src/**\/*.ts"]`, so
 * tsc never looks at a `.js` file and the vendored parser would simply be absent
 * from the published package — with `npm run build` exiting 0 and every test
 * green, because tests import from `src/`.
 *
 * AND NOT AN IMPORT'S JOB EITHER. `resolveJsonModule` does carry an *imported*
 * data file into `dist/`, which is how `src/data/cascade-terminology.json` gets
 * there — but tsc REPRINTS it rather than copying (3,580 bytes in, 3,730 out,
 * differing from byte 2 on line endings and indent). A verbatim copy is the whole
 * point here: the drift test compares this directory byte-for-byte against
 * `node_modules/n3/lib/`, and upstream's own test suite is what validates it.
 *
 * The licence travels with the code. MIT requires its notice in "all copies or
 * substantial portions", and `package.json` `files` ships only `dist`, so
 * `LICENSE.md` has to arrive here as well as in the root `NOTICE`.
 */
import { cpSync, existsSync, statSync } from 'node:fs';

import { walk } from './lib/walk.mjs';

const SRC = 'src/vendor';
const OUT = 'dist/vendor';

if (!existsSync(SRC)) {
  console.log('copy-vendor: no src/vendor, nothing to do');
  process.exit(0);
}

cpSync(SRC, OUT, { recursive: true });

const copied = walk(OUT);
const bytes = copied.reduce((n, f) => n + statSync(f).size, 0);
console.log(`copy-vendor: ${copied.length} files, ${(bytes / 1024).toFixed(0)}K -> ${OUT}`);

// The licence must be among them. Failing the build is the right outcome: a
// published package carrying MIT code without its notice is the one thing the
// licence actually forbids, and nothing downstream would report it.
const licences = copied.filter((f) => /LICENSE/i.test(f));
if (licences.length === 0) {
  console.error(`copy-vendor: FAILED — no LICENSE file reached ${OUT}`);
  process.exit(1);
}
