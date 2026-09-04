# Vendored: N3.js

This directory holds third-party code, **bundled from its source by a declared,
reproducible transform**. Do not edit `n3.js`; re-run the script.

| | |
|---|---|
| package | `n3` |
| version | `2.6.0` |
| resolved | https://registry.npmjs.org/n3/-/n3-2.6.0.tgz |
| integrity | `sha512-iG8yKHcAZNxI+ModlltpLXncdzdgNZWFqA7Hux/p9VSPqyiK2ET5c7Q9+aka/6nWuuamapFw8L4xN4ZFx9KBqQ==` |
| license | MIT (SPDX: `MIT`) — see `LICENSE.md`, copied unchanged |
| copyright | © 2012–present N3.js contributors |
| upstream | https://github.com/rdfjs/N3.js |
| vendored | 2026-09-04 (first vendored 2026-09-03 as the CommonJS build; #95) |
| built by | `scripts/vendor-n3.mjs`, esbuild `0.21.5` (exact devDependency) |
| modifications | **none by hand.** Two applied at bundle time, both declared in the script: relative imports resolved and inlined; `import { Buffer } from 'buffer'` answered by a shim that throws |

## Files

```
n3.js       the bundle: n3's Parser and Writer and what they import, one ES module
n3.d.ts     OURS — declarations for the sliver this SDK calls; n3@2 ships no types
LICENSE.md  upstream's, copied unchanged
VENDOR.md   this file
```

## Which of the two paths #95 offered, and why

Issue #95 named two ways to make the vendored parser bundleable: copy `n3/src/`
and rewrite its specifiers at copy time, or bundle a single ESM file. **This is the
second.** One import site, one file, nothing for a runtime to resolve, and the
`buffer` question answered once at build time rather than left for every
consumer's bundler to answer differently. The cost is a larger diff on upgrade
— 2,500 lines regenerate — which a byte-for-byte drift test makes harmless: the
diff is never read, it is reproduced.

Not `browser/n3.min.js`, which upstream also ships: a UMD global rather than an
import, minified, and so unreviewable.

## Why a bundle and not a copy

`n3/src/` is the ESM original and does not run here as-is: every relative
import in it is **extensionless** (`import N3Lexer from './N3Lexer'`), which
Node's ESM resolver refuses under this package's `"type": "module"`, and
`N3Lexer.js` imports `Buffer` from the `buffer` package. The previous copy dodged
both by taking the CommonJS build and reaching it through `createRequire` —
which no browser bundle can resolve, and which is what D-BROWSER-1 forbids.

esbuild resolves the extensionless specifiers exactly as CommonJS resolution
would have, inlines every module reached, and the one external is answered by
the shim. What comes out is a single ES module with no `import` in it.

## The `buffer` import

`N3Lexer` reaches `Buffer.concat` on one path only: `tokenize` handed a
**stream**, joining a chunk onto the bytes a previous chunk left mid-codepoint.
This SDK hands the parser a complete string, so the path is never entered. The
shim keeps the import satisfiable without carrying the `buffer` polyfill for a
branch nothing takes, and throws a message naming this file if a future caller
ever reaches it.

## How the drift test is defined now

The copy this replaced could be compared byte-for-byte against
`node_modules/n3/lib`. A bundle cannot be, so the comparison moves one step
earlier. `tests/vendor-drift.test.ts` imports `buildVendoredN3` from
`scripts/vendor-n3.mjs`, runs it against the installed `n3` and `esbuild`, and
requires `n3.js` to equal the output **exactly**. So:

1. **Upstream's test suite still validates this code.** Every transform is
   declared in one script; nothing is edited by hand.
2. **A divergence is reported rather than discovered** — an edit to `n3.js`, a
   bumped `n3` pin, a different `esbuild` — all fail the same test with the same
   message.
3. **Re-vendoring a fix is a re-run**, not a merge.

The test also holds that the bundle carries no `import` or `require(`, that this
directory holds exactly the four files above, that `LICENSE.md` is upstream's
unaltered, that the version named here and in `NOTICE` is the one installed,
and that all of it reaches `dist/vendor/n3/` when the package is built.

`.gitattributes` marks `src/vendor/**` `-text`, so the bytes committed are the
bytes on disk on every platform.

## Re-vendoring

```
npm install --save-dev n3@<version>   # update the pin
node scripts/vendor-n3.mjs            # rebuild n3.js and re-copy LICENSE.md
```

Then update the table above, check `NOTICE` at the repository root still states
the right version, and re-read `n3.d.ts` against the new `src/N3Parser.js` and
`src/N3Writer.js` — it declares only what this SDK calls, by hand.
