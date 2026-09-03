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
 * that ships a package throwing `MODULE_NOT_FOUND` the first time a consumer
 * calls `serialize()`/`deserialize()` on a routed type, since
 * `src/converter/to-rdf.ts` and `src/deserializer/n3-adapter.ts` `require`
 * the vendored parser at runtime, not at compile time.
 *
 * Run as a real child process, not imported: the script's refusal is a
 * `process.exit(1)`, and `import`ing a module that calls that would kill the
 * test runner along with it.
 *
 * @module tests/scripts
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
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
