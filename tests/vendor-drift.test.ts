/**
 * `src/vendor/n3/` is a verbatim copy, and this is what says so.
 *
 * Vendoring buys three things, and all three rest on the copy being unmodified:
 * upstream's own test suite still validates it, so nothing here re-tests a Turtle
 * parser; a divergence is reported rather than discovered; and re-vendoring a
 * security fix is a copy rather than a merge. Edit one line and all three end
 * quietly — the files still work, and nothing says they are no longer the thing
 * upstream tests.
 *
 * That is also why `n3` stays a devDependency after being vendored. It is the
 * comparison target here, the oracle for the parser's behaviour, and the only
 * way `npm audit` and Dependabot can see the code at all: they read
 * `package.json`, not `src/vendor/`, so a CVE in `N3Lexer` is invisible to them
 * the moment the dependency is dropped.
 *
 * @see src/vendor/n3/VENDOR.md
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VENDORED = join(root, 'src/vendor/n3');
const UPSTREAM = join(root, 'node_modules/n3/lib');

/** The eight files copied from upstream. `package.json` here is ours, not theirs. */
const COPIED = [
  'N3Parser.js', 'N3Lexer.js', 'N3Writer.js', 'N3DataFactory.js',
  'N3Util.js', 'BaseIRI.js', 'IRIs.js', 'Util.js',
];

describe('vendored n3 has not drifted', () => {
  it('is byte-identical to node_modules/n3/lib', () => {
    const drifted: string[] = [];
    for (const f of COPIED) {
      const mine = readFileSync(join(VENDORED, f));
      const theirs = readFileSync(join(UPSTREAM, f));
      if (!mine.equals(theirs)) drifted.push(`${f} (${mine.length}B vs ${theirs.length}B)`);
    }

    expect(
      drifted,
      'src/vendor/n3 has diverged from the installed n3. Either someone edited the '
      + 'copy — do not; see VENDOR.md — or the pinned version moved and the copy '
      + 'needs re-taking. Re-copy, do not merge.',
    ).toEqual([]);
  });

  it('copied every file it claims to, and nothing else', () => {
    // A file appearing here that upstream does not have is the same defect as an
    // edit: it is code nobody reviewed, under a licence header that does not
    // cover it. `package.json` is the one deliberate exception — a `"type":
    // "commonjs"` marker this repository wrote, because this package is
    // `"type": "module"` and the copy is Babel's CommonJS build.
    const OURS = new Set(['package.json', 'VENDOR.md', 'LICENSE.md']);
    const present = readdirSync(VENDORED).filter((f) => !OURS.has(f)).sort();

    expect(present).toEqual([...COPIED].sort());
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
    const installed = JSON.parse(
      readFileSync(join(root, 'node_modules/n3/package.json'), 'utf-8'),
    ).version as string;
    const manifest = readFileSync(join(VENDORED, 'VENDOR.md'), 'utf-8');

    expect(
      manifest,
      `VENDOR.md must name the installed version (${installed}).`,
    ).toContain(`\`${installed}\``);
  });

  it('is named in the NOTICE that ships', () => {
    // `package.json` `files` ships `dist`, `README.md`, `LICENSE` and `NOTICE`.
    // The notice is the only one of those that mentions n3, so if it stops
    // naming the vendored version the published package is the thing MIT
    // actually forbids.
    const notice = readFileSync(join(root, 'NOTICE'), 'utf-8');
    const installed = JSON.parse(
      readFileSync(join(root, 'node_modules/n3/package.json'), 'utf-8'),
    ).version as string;

    expect(notice).toContain('N3.js');
    expect(notice).toContain(installed);
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

    for (const f of [...COPIED, 'LICENSE.md']) {
      expect(existsSync(join(dist, f)), `${f} did not reach dist/vendor/n3`).toBe(true);
    }
    expect(readFileSync(join(dist, 'N3Parser.js')))
      .toEqual(readFileSync(join(VENDORED, 'N3Parser.js')));
  });
});
