/**
 * Copy the DATA under `src/spec/` into `dist/spec/`.
 *
 * The sibling of `copy-vendor.mjs`, for the same reason and with the same
 * refusal. `tsconfig.json` has `include: ["src/**\/*.ts"]`, so tsc never opens a
 * `.jsonld` file and the spec data would be absent from the published package
 * with `npm run build` exiting 0 — the failure #66 describes wearing data
 * instead of declarations.
 *
 * AND NOT AN IMPORT'S JOB. `resolveJsonModule` does carry an imported data file
 * into `dist/`, and that is how `src/data/cascade-terminology.json` gets there —
 * but tsc REPRINTS it (3,580 bytes in, 3,730 out, differing at byte 2) and
 * infers a structural type for every node of it. #76 measured the real payload
 * through that path at +10.9% and 32,502 types. A copy costs neither.
 *
 * DATA ONLY, NOT THE WHOLE DIRECTORY. `src/spec/` holds two kinds of generated
 * artifact and they reach `dist/` by different routes. The `.jsonld` and
 * `.json` under `ontologies/` and `contexts/` are data tsc will not touch, so
 * they are copied. `src/spec/derived/*.ts` is TypeScript that tsc has ALREADY
 * compiled into `dist/spec/derived/*.js`, so copying it too would put an
 * uncompiled `.ts` next to its own output in the published package — a second,
 * stale copy of a module consumers can import.
 *
 * NOT THE DIAGNOSTICS. `src/spec/diagnostics/*.json`, `src/spec/diagnostics.json`
 * and `src/spec/diagnostics.md` are the build's report on spec — a worklist
 * for the people fixing spec and this SDK, not data a consumer reads — and
 * `package.json` ships `dist` whole, so without this exclusion they would go
 * out in the tarball. `tests/scripts/copy-spec-data.test.ts` says so.
 *
 * REFUSES ON NO DATA. `src/spec/` is gitignored and generated, so the state
 * this has to guard against is a build where `build-spec-data` did not run: the
 * package would ship with no ontologies, and everything reading them would
 * report "that class is not declared" rather than failing. An absence that
 * reads as an answer is the failure mode this repository keeps finding.
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, sep } from 'node:path';

import { walk } from './lib/walk.mjs';

const SRC = 'src/spec';
const OUT = 'dist/spec';

/** A file tsc will not carry, and therefore one this has to. */
const isData = (file) => ['.jsonld', '.json'].includes(extname(file));

/** The build's findings about spec: `src/spec/diagnostics*`, never shipped. */
const isDiagnostics = (file) => relative(SRC, file).split(sep)[0]?.startsWith('diagnostics');

const data = existsSync(SRC) ? walk(SRC).filter((file) => isData(file) && !isDiagnostics(file)) : [];

if (data.length === 0) {
  console.error(
    `copy-spec-data: FAILED — ${SRC} is missing or holds no data files. It is generated rather `
    + 'than committed, so run `node scripts/build-spec-data.mjs` first (that is what `npm run '
    + 'build` does). A package shipped without it answers every question about spec with '
    + '"absent", which is indistinguishable from a class that does not exist.',
  );
  process.exit(1);
}

const copied = data.map((file) => {
  const target = join(OUT, relative(SRC, file));
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(file, target);
  return target;
});

const bytes = copied.reduce((total, file) => total + statSync(file).size, 0);

// The provenance is what lets a shipped artifact be checked against
// `conformance/scripts/SPEC_PIN` after the fact. Missing, the tarball carries
// spec's data with no record of which spec.
if (!copied.some((file) => file.endsWith('PROVENANCE.json'))) {
  console.error(
    `copy-spec-data: FAILED — no PROVENANCE.json reached ${OUT}, so the shipped spec data does `
    + 'not say which spec commit it came from.',
  );
  process.exit(1);
}

console.log(`copy-spec-data: ${copied.length} files, ${Math.round(bytes / 1024)}K -> ${OUT}`);
