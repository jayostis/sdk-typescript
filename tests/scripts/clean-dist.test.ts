/**
 * `scripts/clean-dist.mjs` removes `dist/` whole, and `npm run build` runs it
 * before anything writes there.
 *
 * `dist/` is a product of `src/`; nothing in it is worth keeping. Three
 * writers produce it — tsc, `copy-vendor.mjs`, `copy-spec-data.mjs` — and none
 * of them removes: tsc emits beside whatever is there, `cpSync` merges,
 * `copyFileSync` writes one file. So a renamed `src/` module left its stale
 * `.js` and `.d.ts` in `dist/` as an importable module, a dropped ontology
 * survived in `dist/spec/` and shipped, and the `{"type": "commonjs"}` marker
 * of the eight-file n3 outlived the one-file bundle that replaced it (#95) —
 * each on a build that exited 0. One removal at the front of the build covers
 * all three, rather than one inside the copier that happened to bite.
 *
 * Run as a child process, handed a scratch tree as its one argument: the
 * script removes a directory and this must never point it at the real one.
 * The argument exists for this test; without one the script resolves `dist/`
 * against the tree it lives in, never against the shell's directory.
 *
 * @module tests/scripts
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, afterEach } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = resolve(root, 'scripts/clean-dist.mjs');

let workdir: string | undefined;

afterEach(() => {
  if (workdir) rmSync(workdir, { recursive: true, force: true });
  workdir = undefined;
});

describe('clean-dist.mjs', () => {
  it('removes every stale product, whichever writer left it', () => {
    workdir = mkdtempSync(join(tmpdir(), 'clean-dist-test-'));
    const dist = join(workdir, 'dist');
    mkdirSync(join(dist, 'vendor/n3'), { recursive: true });
    mkdirSync(join(dist, 'spec'), { recursive: true });
    writeFileSync(join(dist, 'renamed-module.js'), 'export const stale = 1;\n');
    writeFileSync(join(dist, 'renamed-module.d.ts'), 'export declare const stale: number;\n');
    writeFileSync(join(dist, 'vendor/n3/package.json'), '{"type":"commonjs"}\n');
    writeFileSync(join(dist, 'spec/dropped.jsonld'), '{}\n');

    execFileSync(process.execPath, [SCRIPT, workdir], { cwd: workdir, stdio: 'pipe' });

    expect(existsSync(dist), 'dist/ survived the clean').toBe(false);
  });

  it('removes the tree it is given, not the one the shell is in', () => {
    // A forced recursive rmSync resolved against process.cwd() ran from a
    // parent directory or a workspace root and removed THAT directory's
    // dist/, reporting success. Two scratch trees: the shell stands in one,
    // the script is told the other, and only the other's dist/ may go.
    workdir = mkdtempSync(join(tmpdir(), 'clean-dist-test-'));
    const shell = join(workdir, 'elsewhere');
    const target = join(workdir, 'repo');
    mkdirSync(join(shell, 'dist'), { recursive: true });
    mkdirSync(join(target, 'dist'), { recursive: true });
    writeFileSync(join(shell, 'dist/theirs.js'), 'export const theirs = 1;\n');
    writeFileSync(join(target, 'dist/stale.js'), 'export const stale = 1;\n');

    execFileSync(process.execPath, [SCRIPT, target], { cwd: shell, stdio: 'pipe' });

    expect(existsSync(join(target, 'dist')), 'the named tree kept its dist/').toBe(false);
    expect(existsSync(join(shell, 'dist/theirs.js')), "the shell's own dist/ was removed").toBe(true);
  });

  it('exits 0 on a tree that has never been built', () => {
    // A fresh clone has no `dist/`. The first build must not fail on the
    // absence of the thing it is about to create.
    workdir = mkdtempSync(join(tmpdir(), 'clean-dist-test-'));

    expect(() => execFileSync(process.execPath, [SCRIPT, workdir], { cwd: workdir, stdio: 'pipe' })).not.toThrow();
  });
});

describe('npm run build', () => {
  it('cleans dist/ before any step writes to it', () => {
    const { scripts } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8')) as {
      scripts: Record<string, string>;
    };
    const steps = (scripts.build ?? '').split('&&').map((step) => step.trim());
    const clean = steps.indexOf('node scripts/clean-dist.mjs');

    expect(clean, 'build does not run scripts/clean-dist.mjs').toBeGreaterThanOrEqual(0);
    for (const writer of ['tsc', 'node scripts/copy-vendor.mjs', 'node scripts/copy-spec-data.mjs']) {
      expect(steps.indexOf(writer), `${writer} writes to dist/ before it is cleaned`).toBeGreaterThan(clean);
    }
  });
});
