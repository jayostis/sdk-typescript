/**
 * Copy `src/spec/` into `dist/spec/`, verbatim.
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
 * REFUSES ON AN EMPTY DIRECTORY. `src/spec/` is gitignored and generated, so the
 * state this has to guard against is a build where `build-spec-data` did not
 * run: the package would ship with no ontologies, and everything reading them
 * would report "that class is not declared" rather than failing. An absence that
 * reads as an answer is the failure mode this repository keeps finding.
 */
import { cpSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'src/spec';
const OUT = 'dist/spec';

/** Every file under a directory, recursively. */
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]);
}

if (!existsSync(SRC) || walk(SRC).length === 0) {
  console.error(
    `copy-spec-data: FAILED — ${SRC} is missing or empty. It is generated rather than committed, `
    + 'so run `node scripts/build-spec-data.mjs` first (that is what `npm run build` does). A '
    + 'package shipped without it answers every question about spec with "absent", which is '
    + 'indistinguishable from a class that does not exist.',
  );
  process.exit(1);
}

cpSync(SRC, OUT, { recursive: true });

const copied = walk(OUT);
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
