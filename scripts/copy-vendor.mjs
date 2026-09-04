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
 * point here: the drift test compares the bundle byte-for-byte against what
 * `scripts/vendor-n3.mjs` builds, and upstream's own test suite is what
 * validates the code inside it.
 *
 * The licence travels with the code. MIT requires its notice in "all copies or
 * substantial portions", and `package.json` `files` ships only `dist`, so
 * `LICENSE.md` has to arrive here as well as in the root `NOTICE`.
 */
import { cpSync, existsSync, rmSync, statSync } from 'node:fs';

import { walk } from './lib/walk.mjs';

const SRC = 'src/vendor';
const OUT = 'dist/vendor';

// REFUSES ON NO VENDOR, the same way `copy-spec-data.mjs` refuses on no
// `src/spec`. `src/converter/to-rdf.ts` and `src/deserializer/n3-adapter.ts`
// import `../vendor/n3/n3.js`, and tsc resolves that against `n3.d.ts` — it
// never checks that the JavaScript beside it exists — so exiting 0 here let
// `npm run build` succeed and ship a package that throws `ERR_MODULE_NOT_FOUND`
// the first time a consumer imported it. An absent build input exiting 0 is the
// failure mode this repository keeps finding.
if (!existsSync(SRC)) {
  console.error(
    `copy-vendor: FAILED — ${SRC} is missing. It is generated rather than committed, so run `
    + 'the vendoring step first — a build that skips it ships with no Turtle parser and no '
    + 'LICENSE.md at ' + OUT + ', and nothing downstream would report it until a consumer '
    + 'called serialize()/deserialize() and hit MODULE_NOT_FOUND.',
  );
  process.exit(1);
}

// REPLACED, NOT MERGED. `cpSync` writes over what is there and leaves the rest,
// so a file the vendor directory no longer holds survived in `dist/` from the
// build before. That is not hypothetical: when the eight-file CommonJS copy of
// n3 became one ES module (#95), the old `{"type": "commonjs"}` marker stayed
// behind in `dist/vendor/n3/`, Node read the new `n3.js` beside it as
// CommonJS, and `import` of the built package failed with "does not provide an
// export named 'Parser'" — on a tree where `npm run build` had just exited 0.
// `dist/` is a product of `src/`; nothing in it is worth keeping.
rmSync(OUT, { recursive: true, force: true });
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
