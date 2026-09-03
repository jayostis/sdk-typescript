# Vendored: N3.js

This directory is a **verbatim copy** of third-party source. Do not edit it.

| | |
|---|---|
| package | `n3` |
| version | `2.6.0` |
| resolved | https://registry.npmjs.org/n3/-/n3-2.6.0.tgz |
| integrity | `sha512-iG8yKHcAZNxI+ModlltpLXncdzdgNZWFqA7Hux/p9VSPqyiK2ET5c7Q9+aka/6nWuuamapFw8L4xN4ZFx9KBqQ==` |
| license | MIT (SPDX: `MIT`) — see `LICENSE.md`, copied unchanged |
| copyright | © 2012–present N3.js contributors |
| upstream | https://github.com/rdfjs/N3.js |
| vendored | 2026-09-03 |
| modifications | **none** |

## Files

Copied from `node_modules/n3/lib/` — the CommonJS build, not `n3/src/`:

```
N3Parser.js  N3Lexer.js  N3Writer.js  N3DataFactory.js
N3Util.js    BaseIRI.js  IRIs.js      Util.js
```

`package.json` here is **not** upstream's. It is a one-line `{"type": "commonjs"}`
marker written by this repository, so Node reads these files as CommonJS inside a
package whose own `package.json` declares `"type": "module"`.

## Why the CJS build and not the ESM source

`n3/src/` is the ESM original and would be the obvious thing to copy. It does not
run here.

Every relative import in it is **extensionless** — `N3Parser.js` line 2 is
`import N3Lexer from './N3Lexer'`. Upstream gets away with that because its
`main` points at this CJS build, and CommonJS resolution extension-guesses. Node's
ESM resolver does not, and this package is `"type": "module"`, so a byte-identical
copy of `n3/src/` fails at load with `ERR_MODULE_NOT_FOUND`.

Rewriting the specifiers would fix it and would also end the property this whole
arrangement depends on: an unmodified copy is still covered by upstream's own test
suite, and a modified one is covered by nothing. The CJS build keeps every byte and
resolves, at the cost of `createRequire` at the call site.

## Why unmodified matters

Three things rest on it, and editing one line ends all three:

1. **Upstream's test suite validates this copy.** Nothing here re-tests a Turtle parser.
2. **The drift test can compare byte-for-byte** against `node_modules/n3/lib/`, so a
   divergence — ours or theirs — is reported rather than discovered.
3. **Re-vendoring a fix is a copy**, not a merge.

`tests/vendor-drift.test.ts` enforces this. If it fails, the answer is to re-copy or
to bump the pinned version — never to edit a file here.

## The `buffer` import

`N3Lexer.js` line 7 is `var _buffer = require("buffer");`, used only on the chunked
streaming path (around line 552). Nothing this repository calls reaches it — we hand
the parser a complete string.

It is a bare specifier, which `tests/no-runtime-deps.ts` reports as a finding by
design: an npm package named `buffer` exists, so the specifier alone cannot say
whether the runtime builtin or the package answers it. Here `buffer@6.0.3` really is
installed, as n3's own dependency. At a consumer of this package it is not, and the
Node builtin answers instead.

That is a real difference, so it is **declared rather than exempted** —
`VENDOR_BARE_SPECIFIERS` in `tests/no-runtime-deps.ts`, compared both ways. A new
bare specifier appearing in vendored code fails the test, and so does this one
disappearing.

## Re-vendoring

```
npm install n3@<version>          # update the pin
cp node_modules/n3/lib/{N3Parser,N3Lexer,N3Writer,N3DataFactory,N3Util,BaseIRI,IRIs,Util}.js src/vendor/n3/
cp node_modules/n3/LICENSE.md src/vendor/n3/
```

Then update the table above, and check that `NOTICE` at the repository root still
states the right version.
