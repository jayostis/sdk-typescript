/**
 * Every workflow that runs the suite hands it a spec checkout.
 *
 * The suites read `spec` where it is checked out and keep no copy, so a job
 * that runs `npm test` without supplying one does not skip the SHACL suites —
 * `specRoot()` throws at collection and every SHACL-importing file fails at
 * once. That is loud, but it is loud only once the job has already run: the
 * release workflow gates `npm publish` on `npm test`, so the first sighting of
 * a missing checkout there is a red `v*` tag and a version that cannot ship.
 *
 * Text, not YAML. Adding a parser to answer "does this file mention the two
 * ways of supplying spec" would be a dependency bought for one string search,
 * and the two spellings this looks for are the two a reader would grep for.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

const WORKFLOWS = resolve(dirname(fileURLToPath(import.meta.url)), '../.github/workflows');

/** A workflow supplies spec either by naming it, or by cloning it as the sibling. */
const suppliesSpec = (text: string): boolean =>
  text.includes('CASCADE_SPEC_DIR') || /^\s*path:\s*spec\s*$/m.test(text);

describe('workflows', () => {
  it('gives every workflow that runs the suite a spec checkout', () => {
    const files = readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f));

    // Guarded: a rename of the directory would leave nothing to walk, and an
    // empty list satisfies the assertion below while checking nothing.
    expect(files.length).toBeGreaterThan(0);

    const runsSuite = files.filter((f) => /^\s*run:\s*npm test\s*$/m.test(
      readFileSync(join(WORKFLOWS, f), 'utf-8'),
    ));

    expect(runsSuite.length).toBeGreaterThan(0);
    expect(
      runsSuite.filter((f) => !suppliesSpec(readFileSync(join(WORKFLOWS, f), 'utf-8'))),
    ).toEqual([]);
  });
});
