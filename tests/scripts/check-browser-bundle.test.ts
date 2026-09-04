/**
 * `scripts/check-browser-bundle.mjs` run as a script, not imported.
 *
 * `tests/browser-bundle.test.ts` proves the function. This proves the two
 * things around it that decide whether the function runs at all when someone
 * types `npm run check:browser`: the guard that says "I am the main module",
 * and the hook that puts the generated sources in place first. Either one
 * wrong and the gate exits 0 having judged nothing — the failure mode this
 * repository keeps finding, wearing a build script.
 *
 * @module tests/scripts
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, afterEach } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

let workdir: string | undefined;

afterEach(() => {
  if (workdir) rmSync(workdir, { recursive: true, force: true });
  workdir = undefined;
});

describe('check-browser-bundle.mjs reached through a symlink', () => {
  it('still knows it is the main module, and reports', { timeout: 60_000 }, () => {
    // Node resolves the main module through symlinks before running it
    // (`--preserve-symlinks-main` is what turns that off), so `import.meta.url`
    // is the real path while `process.argv[1]` is the one typed. Compared
    // without a realpath the two differ, the main guard is false, and the
    // D-BROWSER-1 gate exits 0 with nothing on stdout — through a symlinked
    // checkout, a `subst` drive or a directory junction. A junction here, which
    // needs no privilege on Windows; on POSIX the type is ignored and it is a
    // plain symlink.
    workdir = mkdtempSync(join(tmpdir(), 'check-browser-bundle-test-'));
    const link = join(workdir, 'scripts');
    symlinkSync(resolve(root, 'scripts'), link, 'junction');

    const stdout = execFileSync(process.execPath, [join(link, 'check-browser-bundle.mjs')], {
      cwd: root,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    expect(
      stdout,
      'run through a symlink, the script did not recognise itself as main and reported nothing',
    ).toContain('check-browser-bundle: OK');
  });
});

describe('npm run check:browser', () => {
  it('generates src/spec first, the way test and typecheck do', () => {
    // `src/index.ts` reaches `src/spec/derived/*.generated.ts` and `src/spec/`
    // is gitignored, so on a fresh clone the bundle fails on an unresolved
    // `./spec/derived/terms.generated.js` — printed under the D-BROWSER-1
    // explanation about `node:` builtins. `pretest` and `pretypecheck` run
    // `generate`; this is the same hook, on the same footing.
    const { scripts } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8')) as {
      scripts: Record<string, string>;
    };

    expect(scripts['precheck:browser'], 'check:browser has no generate pre-hook').toBe(scripts.pretest);
  });
});
