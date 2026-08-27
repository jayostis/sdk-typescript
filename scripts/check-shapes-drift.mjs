#!/usr/bin/env node
/**
 * Fail when `tests/shapes/` no longer matches `spec`.
 *
 * The vendored copies exist so SHACL-backed tests run without a `spec` sibling.
 * A copy that goes stale silently is worse than no copy: a suite asserting last
 * month's constraints looks like it is working.
 *
 * Exit 2 — not 0 — when the check cannot run. "0 files differ" from a walk that
 * found nothing reads exactly like success, and that is the failure this guards.
 *
 *   0  copies match spec
 *   1  drift found
 *   2  cannot check
 *
 * Usage: node scripts/check-shapes-drift.mjs [--spec <dir>]
 *        CASCADE_SPEC_DIR=<dir> node scripts/check-shapes-drift.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VENDORED_DIR = join(REPO, 'tests', 'shapes');

/** Vendored file -> the `ontologies/` subpath spec publishes it at. */
const UPSTREAM = {
  'core.shapes.ttl': 'core/v1',
  'health.shapes.ttl': 'health/v1',
};

const die = (msg) => {
  console.error(`CANNOT CHECK: ${msg}`);
  process.exit(2);
};

const argv = process.argv.slice(2);
const flag = argv.indexOf('--spec');
const specRoot = resolve(
  flag !== -1 ? argv[flag + 1] ?? die('--spec given with no directory')
    : process.env.CASCADE_SPEC_DIR ?? join(REPO, '..', 'spec'),
);

// statSync, not Dirent: a spec checkout reached through a symlink answers
// isDirectory() false on a Dirent, and a walk that skips it finds nothing.
try {
  if (!statSync(specRoot).isDirectory()) throw 0;
} catch {
  die(`no spec checkout at ${specRoot}. Clone it as a sibling, pass --spec, or set CASCADE_SPEC_DIR.`);
}

const vendored = readdirSync(VENDORED_DIR).filter((f) => f.endsWith('.ttl')).sort();
const problems = [];
let compared = 0;

for (const name of vendored) {
  const sub = UPSTREAM[name];
  if (!sub) {
    problems.push(`ORPHAN   tests/shapes/${name} — spec publishes no such file`);
    continue;
  }
  const upstream = join(specRoot, 'ontologies', sub, name);
  let same;
  try {
    same = readFileSync(upstream).equals(readFileSync(join(VENDORED_DIR, name)));
  } catch (e) {
    die(`cannot read ${upstream}: ${e.message}`);
  }
  compared++;
  if (!same) problems.push(`DRIFTED  tests/shapes/${name} — differs from ontologies/${sub}/${name}`);
}

// A run that compared nothing must not report success.
if (compared < Object.keys(UPSTREAM).length) {
  die(`compared ${compared} of ${Object.keys(UPSTREAM).length} expected files; every check above would pass vacuously.`);
}

if (problems.length) {
  console.error(problems.join('\n'));
  console.error('\nRe-sync:  sh scripts/sync-shapes-from-spec.sh');
  process.exit(1);
}

console.log(`OK: ${compared} vendored file(s) byte-identical to spec.`);
