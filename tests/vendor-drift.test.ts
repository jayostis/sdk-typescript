/**
 * `src/vendor/n3/n3.js` is what `scripts/vendor-n3.mjs` builds from the
 * installed n3, byte for byte, and this is what says so.
 *
 * Vendoring buys three things, and all three rest on the vendored code being
 * upstream's: upstream's own test suite still validates it, so nothing here
 * re-tests a Turtle parser; a divergence is reported rather than discovered;
 * and re-vendoring a security fix is a re-run rather than a merge. The copy
 * this replaced could be compared byte-for-byte against `node_modules/n3/lib`
 * (#89). A bundle cannot be — esbuild resolved the extensionless imports,
 * inlined the modules and answered `buffer` with a shim — so the comparison
 * moves one step earlier: the transform is declared in ONE script, this test
 * runs that script against the installed n3, and the committed file must equal
 * its output exactly. Edit `n3.js` and this fails. Bump the pin and this fails.
 * Change esbuild and this fails, which is why esbuild is an exact devDependency.
 *
 * That is also why `n3` stays a devDependency after being vendored. It is the
 * input here, the oracle for the parser's behaviour, and the only way
 * `npm audit` and Dependabot can see the code at all: they read
 * `package.json`, not `src/vendor/`, so a CVE in `N3Lexer` is invisible to them
 * the moment the dependency is dropped.
 *
 * @see src/vendor/n3/VENDOR.md
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import { buildVendoredN3, installedN3Version } from '../scripts/vendor-n3.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VENDORED = join(root, 'src/vendor/n3');

/** The one generated file. Everything else in the directory is ours. */
const BUNDLE = 'n3.js';

describe('vendored n3 has not drifted', () => {
  it('is byte-identical to what scripts/vendor-n3.mjs builds from the installed n3', async () => {
    // `.gitattributes` marks `src/vendor/**` `-text`, so the bytes on disk are
    // the bytes committed on every platform; a Windows checkout with CRLF here
    // would be a real finding, not noise.
    const mine = readFileSync(join(VENDORED, BUNDLE), 'utf-8');
    const theirs = await buildVendoredN3();

    expect(
      mine === theirs,
      'src/vendor/n3/n3.js is not what scripts/vendor-n3.mjs builds from node_modules/n3. '
      + 'Either someone edited the bundle — do not; see VENDOR.md — or the pinned n3 or '
      + 'esbuild moved and the bundle needs rebuilding: node scripts/vendor-n3.mjs. '
      + `Committed ${mine.length} chars, built ${theirs.length}.`,
    ).toBe(true);
  }, 20_000);

  it('names the version it was built from', () => {
    // The banner is the bundle's own provenance line. If the script wrote a
    // different version than the one installed, the previous test already
    // failed; this pins that the version is STATED, so a reader of the shipped
    // file learns it without a checkout.
    const head = readFileSync(join(VENDORED, BUNDLE), 'utf-8').slice(0, 200);
    expect(head).toContain(`n3@${installedN3Version()}`);
  });

  it('holds the bundle, its types, its licence and its manifest, and nothing else', () => {
    // A file appearing here that nothing declares is the same defect as an
    // edit: code nobody reviewed, under a licence header that does not cover
    // it. `n3.d.ts` is ours — n3@2 ships no types — and says so at its top.
    expect(readdirSync(VENDORED).sort()).toEqual(['LICENSE.md', 'VENDOR.md', 'n3.d.ts', 'n3.js']);
  });

  it('carries no import or require for a runtime to resolve', () => {
    // The reason the bundle exists. A surviving specifier is a module the
    // browser is expected to supply, and `buffer` is the one n3 would leave.
    const code = readFileSync(join(VENDORED, BUNDLE), 'utf-8');
    expect(code).not.toMatch(/^\s*import\b/m);
    expect(code).not.toMatch(/^\s*export\b[^;]*\bfrom\b/m);
    expect(code).not.toMatch(/\brequire\(/);
  });

  it('carries upstream\'s licence, unaltered', () => {
    // MIT's single obligation. If this file is wrong, edited, or missing, the
    // published package redistributes someone else's code without the notice
    // their licence requires — and nothing downstream would report it.
    const mine = readFileSync(join(VENDORED, 'LICENSE.md'), 'utf-8');
    const theirs = readFileSync(join(root, 'node_modules/n3/LICENSE.md'), 'utf-8');

    expect(mine).toBe(theirs);
    expect(mine).toContain('The MIT License (MIT)');
  });

  it('records the version that is actually installed', () => {
    // VENDOR.md is a claim about provenance. A claim nothing checks is how a
    // manifest ends up describing a copy two versions old.
    const manifest = readFileSync(join(VENDORED, 'VENDOR.md'), 'utf-8');

    expect(
      manifest,
      `VENDOR.md must name the installed version (${installedN3Version()}).`,
    ).toContain(`\`${installedN3Version()}\``);
  });

  it('is named in the NOTICE that ships', () => {
    // `package.json` `files` ships `dist`, `README.md`, `LICENSE` and `NOTICE`.
    // The notice is the only one of those that mentions n3, so if it stops
    // naming the vendored version the published package is the thing MIT
    // actually forbids.
    const notice = readFileSync(join(root, 'NOTICE'), 'utf-8');

    expect(notice).toContain('N3.js');
    expect(notice).toContain(installedN3Version());
    expect(notice).toContain('MIT');

    const files = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')).files as string[];
    expect(files, 'NOTICE must be in package.json files, or it does not ship.').toContain('NOTICE');
  });

  it('reaches dist/ when the package is built', () => {
    // tsc does not copy `.js` — `include` is `src/**\/*.ts` — so the vendored
    // parser reaches the published package only through `scripts/copy-vendor.mjs`.
    // Skipped rather than failed when `dist/` is absent: a clean checkout has not
    // built yet, and a test that fails there teaches people to ignore it.
    const dist = join(root, 'dist/vendor/n3');
    if (!existsSync(dist)) {
      console.warn('vendor-drift: dist/ not built, skipping the packaging check');
      return;
    }

    for (const f of [BUNDLE, 'n3.d.ts', 'LICENSE.md']) {
      expect(existsSync(join(dist, f)), `${f} did not reach dist/vendor/n3`).toBe(true);
    }
    expect(readFileSync(join(dist, BUNDLE))).toEqual(readFileSync(join(VENDORED, BUNDLE)));
  });
});
