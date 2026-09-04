/**
 * Merge every generator's findings into one `diagnostics.json`.
 *
 *   node scripts/collect-diagnostics.mjs [findingsDir] [outFile] [provenanceFile]
 *
 * With no arguments — how `npm run generate` runs it — the findings are read
 * from `<data>/diagnostics/`, written to `<data>/diagnostics.json`, and the
 * spec commit is taken from `<data>/ontologies/PROVENANCE.json`, where `<data>`
 * is `src/spec/` or `CASCADE_SPEC_DATA_DIR`. With arguments, the provenance
 * defaults to `<findingsDir>/PROVENANCE.json`, so a fixture directory is
 * self-contained.
 *
 * REFUSES, NEVER SKIPS — and every refusal is about the pipeline's own
 * integrity, not about what spec says. The generators are separate processes,
 * so this cannot be an in-memory channel, and "concatenate three files" is
 * not enough: a generator that crashes leaves its PREVIOUS findings file on
 * disk (`build-record-types.mjs` did exactly that at spec `9b13ae4`), and
 * silently merging stale rows with fresh ones is the vacuous-pass shape
 * `CLAUDE.md` warns about. Each generator deletes its own file at start and
 * writes it at the end, so a missing file means "did not finish"; this
 * refuses it, along with a repeated id, an id that is not `${code}:${subject}`,
 * an enum value outside its enum, an empty required field, and a row whose
 * `source` is not the generator whose file it sits in. An empty array is a
 * valid file: `build-record-types` is down to one row at this pin and a
 * future pin may zero any generator.
 *
 * NOT A GATE. A finding is what this file exists to carry, and a build that
 * failed on one would break every build until upstream caught up. The exit
 * code says whether the merge could be vouched for, nothing else.
 *
 * CARRIES `commit`, NOT `builtAt`. The header of the rendered file says which
 * spec the findings were measured against, and that has to be measured, not
 * typed. A timestamp would make the file differ between two builds of one
 * spec commit, and the output is meant to be byte-identical across them.
 * `commit` is `null` outside a git checkout; the null is carried, not refused.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SOURCES, readFindings } from './lib/diagnostics.mjs';
import { specDataLayout } from './lib/spec-source.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const layout = specDataLayout(root);

const [findingsArg, outArg, provenanceArg] = process.argv.slice(2);
const findingsDir = findingsArg ? resolve(findingsArg) : layout.diagnostics;
const out = outArg ? resolve(outArg) : join(layout.data, 'diagnostics.json');
const provenance = provenanceArg
  ? resolve(provenanceArg)
  : findingsArg ? join(findingsDir, 'PROVENANCE.json') : join(layout.ontologies, 'PROVENANCE.json');

try {
  const merged = [];
  const seen = new Map();

  for (const source of SOURCES) {
    for (const row of readFindings(findingsDir, source)) {
      const previous = seen.get(row.id);
      if (previous) {
        throw new Error(
          `id "${row.id}" appears twice (in ${previous} and ${source}). A subject is unique within `
          + 'its code by construction; two rows with one id are one detector emitting twice.',
        );
      }
      seen.set(row.id, source);
      merged.push(row);
    }
  }

  merged.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const commit = existsSync(provenance)
    ? (JSON.parse(readFileSync(provenance, 'utf-8')).commit ?? null)
    : null;

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify({ commit, findings: merged }, null, 2)}\n`, 'utf-8');

  console.log(
    `collect-diagnostics: ${merged.length} finding(s) from ${SOURCES.length} generators`
    + `${commit ? ` at spec ${commit.slice(0, 7)}` : ''} -> ${out}`,
  );
} catch (error) {
  console.error(`collect-diagnostics: FAILED — ${error.message}`);
  process.exit(1);
}
