#!/usr/bin/env node
/**
 * Fail when `tests/shapes/` no longer matches `spec`.
 *
 * Content is compared with line endings normalized — see `normalize` below.
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
 * Usage: node scripts/check-shapes-drift.mjs [--spec <dir> | --spec=<dir>]
 *        CASCADE_SPEC_DIR=<dir> node scripts/check-shapes-drift.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VENDORED_DIR = join(REPO, 'tests', 'shapes');

const die = (msg) => {
  console.error(`CANNOT CHECK: ${msg}`);
  process.exit(2);
};

/**
 * Vendored file -> the `ontologies/` subpath spec publishes it at.
 *
 * Read from tests/shapes/vendored.json rather than written out here.
 * `scripts/sync-shapes-from-spec.sh` and `tests/support/shacl.ts` read the same
 * file, so the copy, this check and the SHACL coverage guard cannot disagree
 * about which vocabularies are vendored. When those were separate
 * hand-maintained lists, a vocabulary added to the sync script alone was
 * reported here as `ORPHAN ... spec publishes no such file` — false, and it
 * pointed the reader at the wrong repository.
 *
 * readFileSync rather than an import: JSON import attributes are spelled
 * `assert` on the Node 18 floor this package declares and `with` on current
 * Node, and neither spelling parses on both.
 */
const MANIFEST = join(VENDORED_DIR, 'vendored.json');
let UPSTREAM;
try {
  UPSTREAM = Object.fromEntries(
    Object.entries(JSON.parse(readFileSync(MANIFEST, 'utf8')))
      .map(([name, entry]) => [name, entry.specPath]),
  );
} catch (e) {
  die(`cannot read ${MANIFEST}: ${e.message}`);
}

// An empty manifest leaves every vendored file an ORPHAN and `compared` at 0 of
// 0, which satisfies the shortfall check below and prints "OK: 0 vendored
// file(s) match spec" — the exact reading this file exits 2 to prevent.
if (Object.keys(UPSTREAM).length === 0) die(`${MANIFEST} lists no shapes, so there is nothing to check.`);
for (const [name, sub] of Object.entries(UPSTREAM)) {
  if (!sub) die(`${MANIFEST}: ${name} has no specPath, so its upstream location is unknown.`);
}

const argv = process.argv.slice(2);

// Both spellings of the flag, and nothing else accepted. An indexOf('--spec')
// alone does not match `--spec=<dir>`, and an unmatched argument is silently
// dropped: the run then falls back to CASCADE_SPEC_DIR or the sibling and
// answers OK/DRIFTED about a tree the caller never named. A typo is the same
// hazard, so an unrecognized argument dies rather than being ignored.
let specArg;
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === '--spec') specArg = argv[++i] || die('--spec given with no directory');
  else if (arg.startsWith('--spec=')) specArg = arg.slice('--spec='.length) || die('--spec= given with no directory');
  else die(`unrecognized argument: ${arg}. Usage: node scripts/check-shapes-drift.mjs [--spec <dir> | --spec=<dir>]`);
}

// `||`, not `??`: `??` only falls back on null/undefined, so an unset CI input
// arrives as "" and survives to resolve(''), which returns the cwd. That is a
// directory, so the sibling fallback is skipped and the run dies naming the
// wrong tree instead of saying there is no spec checkout. Same for `--spec ''`.
const specRoot = resolve(specArg || process.env.CASCADE_SPEC_DIR || join(REPO, '..', 'spec'));

// statSync, not Dirent: a spec checkout reached through a symlink answers
// isDirectory() false on a Dirent, and a walk that skips it finds nothing.
try {
  if (!statSync(specRoot).isDirectory()) throw 0;
} catch {
  die(`no spec checkout at ${specRoot}. Clone it as a sibling, pass --spec, or set CASCADE_SPEC_DIR.`);
}

// Guarded: an unreadable tests/shapes/ — sparse checkout, a packaging step that
// omits tests/ — would otherwise throw, and an uncaught throw exits 1, the code
// this file's header reserves for "drift found". A gate reading that sends
// someone to re-sync files that are not there.
let vendored;
try {
  vendored = readdirSync(VENDORED_DIR).filter((f) => f.endsWith('.ttl')).sort();
} catch (e) {
  die(`cannot read ${VENDORED_DIR}: ${e.message}`);
}

/**
 * Compare content, not line endings.
 *
 * `spec` is not line-ending normalized: at 678ae0d it stores health.shapes.ttl
 * with CRLF and core.shapes.ttl with LF, and has no .gitattributes. Copying on
 * Windows and committing under core.autocrlf=true then stores LF here, so a
 * byte comparison answers differently depending on the platform it runs on —
 * OK on Windows, where both working trees are CRLF, and DRIFTED on Linux, where
 * ours is LF and spec's is not. Observed: 1756 CR bytes, the whole of the
 * difference, on a file whose constraints were identical.
 *
 * A line ending is not a constraint. This check exists to catch a vendored copy
 * asserting last month's rules, and normalizing costs it nothing it was ever
 * meant to detect.
 */
const normalize = (buf) => buf.toString('utf8').replace(/\r\n/g, '\n');

// `bash`, not `sh`: the sync script is #!/usr/bin/env bash and uses BASH_SOURCE
// and [[ ]], both of which are a Bad substitution / syntax error under dash,
// which is what /bin/sh is on Debian, Ubuntu and ubuntu-latest runners.
const RESYNC = 'Re-sync:  bash scripts/sync-shapes-from-spec.sh';

// An orphan needs its OWN remedy. The sync script only ever COPIES the files the
// manifest lists — it has no delete step — so re-syncing leaves an orphan exactly
// where it was and reports success, and the next run is identically red. The two
// ways to get one have opposite answers, and only the reader knows which applies:
// a file left behind after a vocabulary was dropped from vendored.json wants
// `git rm`, and one copied in without being registered wants the manifest entry.
const DE_ORPHAN = 'Orphans:  git rm the file, or add it to tests/shapes/vendored.json — '
  + 'the sync script only copies, so it will never remove one.';

/**
 * Every problem line, then each remedy that applies, once.
 *
 * `problems` holds entries rather than strings because a DRIFTED and an ORPHAN
 * no longer share one answer: printing RESYNC under an orphan sends the reader
 * to a command that cannot fix it.
 */
const report = (entries) => {
  console.error(entries.map((e) => e.line).join('\n'));
  console.error('');
  for (const remedy of [...new Set(entries.map((e) => e.remedy))]) console.error(remedy);
};

const problems = [];
let compared = 0;

for (const name of vendored) {
  const sub = UPSTREAM[name];
  if (!sub) {
    problems.push({
      line: `ORPHAN   tests/shapes/${name} — vendored.json lists no such shape`,
      remedy: DE_ORPHAN,
    });
    continue;
  }
  const upstream = join(specRoot, 'ontologies', sub, name);
  const local = join(VENDORED_DIR, name);

  // A missing upstream file is DRIFT, not an infrastructure fault. Spec deleting
  // or renaming a shapes file is the loudest drift there is — the vendored copy
  // now mirrors nothing — and exit 1 is what carries the re-sync hint. Dying
  // with 2 here would route the one case the operator can fix to "page a human".
  // Any other errno (EACCES, EISDIR) genuinely is "cannot check".
  let upstreamBytes;
  try {
    upstreamBytes = readFileSync(upstream);
  } catch (e) {
    if (e.code !== 'ENOENT') die(`cannot read ${upstream}: ${e.message}`);
    // Counted as compared: a verdict was reached. Skipping the increment would
    // trip the shortfall check below and turn this back into exit 2.
    compared++;
    problems.push({
      line: `DRIFTED  tests/shapes/${name} — spec no longer publishes ontologies/${sub}/${name}`,
      remedy: RESYNC,
    });
    continue;
  }

  // The vendored side keeps exit 2: readdirSync just listed this file, so a
  // failure here is the filesystem misbehaving, not anything spec did.
  let localBytes;
  try {
    localBytes = readFileSync(local);
  } catch (e) {
    die(`cannot read ${local}: ${e.message}`);
  }

  compared++;
  if (normalize(upstreamBytes) !== normalize(localBytes)) {
    problems.push({
      line: `DRIFTED  tests/shapes/${name} — differs from ontologies/${sub}/${name}`,
      remedy: RESYNC,
    });
  }
}

// A run that compared nothing must not report success.
//
// `compared` counts every name in vendored.json that reached a verdict —
// matched, differed, or gone from spec — so the ONLY input that falls short is
// a listed file MISSING from tests/shapes/. An ORPHAN is an EXTRA file and can
// never cause a shortfall, so the orphan lines this used to print said nothing
// about why the count was low, and on the one input that does produce a
// shortfall `problems` is empty and nothing was printed at all: an operator
// staring at a red shapes-drift job got a count and no filename. Diff the two
// lists instead. Print BEFORE dying, because die() never returns.
if (compared < Object.keys(UPSTREAM).length) {
  // The re-sync hint is the actionable answer for a MISSING file: a vendored copy
  // that is absent is restored by the same command as one that is stale. An
  // ORPHAN caught in the same run still carries its own, which is why these go
  // through `report` rather than printing one shared string. The exit code stays
  // 2 rather than joining the drift path at 1 — nothing was compared, so this run
  // has no opinion on whether the copies that ARE present match spec.
  report([
    ...Object.keys(UPSTREAM)
      .filter((n) => !vendored.includes(n))
      .map((name) => ({
        line: `MISSING  tests/shapes/${name} — vendored.json lists it, but it is not present`,
        remedy: RESYNC,
      })),
    ...problems,
  ]);
  die(`compared ${compared} of ${Object.keys(UPSTREAM).length} expected files; every check above would pass vacuously.`);
}

if (problems.length) {
  report(problems);
  process.exit(1);
}

console.log(`OK: ${compared} vendored file(s) match spec (line endings normalized).`);
