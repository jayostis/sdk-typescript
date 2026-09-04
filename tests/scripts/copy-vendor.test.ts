/**
 * `scripts/copy-vendor.mjs` refuses to build when `src/vendor` is missing.
 *
 * The sibling script, `copy-spec-data.mjs`, treats an absent `src/spec` as a
 * hard failure (`process.exit(1)`) because a build that skips it ships a
 * package that answers every spec question with "absent" — indistinguishable
 * from a class that does not exist. `copy-vendor.mjs` used to treat the
 * analogous case (`src/vendor` missing) as "nothing to do" and exit 0, which
 * let `npm run build` succeed with no vendored Turtle parser and no
 * `LICENSE.md` copied to `dist/vendor` — a build CI's exit code calls green
 * that ships a package throwing `ERR_MODULE_NOT_FOUND` the first time a
 * consumer imports it, since `src/converter/to-rdf.ts` and
 * `src/deserializer/n3-adapter.ts` import the vendored bundle and tsc
 * resolved that against `n3.d.ts`, never checking the JavaScript beside it.
 *
 * Run as a real child process, not imported: the script's refusal is a
 * `process.exit(1)`, and `import`ing a module that calls that would kill the
 * test runner along with it.
 *
 * @module tests/scripts
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, afterEach } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = resolve(root, 'scripts/copy-vendor.mjs');

let workdir: string | undefined;

afterEach(() => {
  if (workdir) rmSync(workdir, { recursive: true, force: true });
  workdir = undefined;
});

describe('copy-vendor.mjs on a dist/vendor left by an earlier build', () => {
  it('removes what src/vendor no longer holds, rather than writing over it', () => {
    // `cpSync` merges. When the vendored n3 went from eight CommonJS files to
    // one ES module (#95), the old `{"type": "commonjs"}` marker survived in
    // `dist/vendor/n3/` and Node read the new bundle beside it as CommonJS:
    // the built package failed to import on a tree where the build had just
    // exited 0. The target is replaced, so a stale file cannot outlive its source.
    workdir = mkdtempSync(join(tmpdir(), 'copy-vendor-test-'));
    mkdirSync(join(workdir, 'src/vendor/n3'), { recursive: true });
    writeFileSync(join(workdir, 'src/vendor/n3/n3.js'), 'export const Parser = 1;\n');
    writeFileSync(join(workdir, 'src/vendor/n3/LICENSE.md'), 'MIT\n');
    mkdirSync(join(workdir, 'dist/vendor/n3'), { recursive: true });
    writeFileSync(join(workdir, 'dist/vendor/n3/package.json'), '{"type":"commonjs"}\n');

    execFileSync('node', [SCRIPT], { cwd: workdir, stdio: 'pipe' });

    expect(existsSync(join(workdir, 'dist/vendor/n3/n3.js'))).toBe(true);
    expect(existsSync(join(workdir, 'dist/vendor/n3/LICENSE.md'))).toBe(true);
    expect(
      existsSync(join(workdir, 'dist/vendor/n3/package.json')),
      'a file from the previous build survived in dist/vendor',
    ).toBe(false);
  });
});

describe('copy-vendor.mjs on a missing src/vendor', () => {
  it('exits non-zero rather than reporting "nothing to do"', () => {
    workdir = mkdtempSync(join(tmpdir(), 'copy-vendor-test-'));

    let threw = false;
    try {
      execFileSync('node', [SCRIPT], { cwd: workdir, stdio: 'pipe' });
    } catch (err) {
      threw = true;
      const stderr = (err as { stderr: Buffer }).stderr.toString();
      expect(stderr, 'must name the failure, the way copy-spec-data.mjs does').toContain('FAILED');
      expect((err as { status: number }).status).toBe(1);
    }

    expect(threw, 'a missing src/vendor must fail the build, not exit 0').toBe(true);
  });
});
