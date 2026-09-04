/**
 * Render `diagnostics.json` as the markdown a person picks up and works.
 *
 *   node scripts/render-diagnostics.mjs [inFile] [outFile] [templatePath]
 *
 * Defaults: `<data>/diagnostics.json` in, `<data>/diagnostics.md` out, through
 * `scripts/templates/diagnostics.md` — a file, not a string in the renderer,
 * because a build input lives with the build scripts and never under
 * `src/spec/`, which is generated output only.
 *
 * The rendering rules are `renderMarkdown`'s (`scripts/lib/diagnostics.mjs`):
 * owner first, severity second, then source and code; every row and every
 * code heading carries the code, and the heading links the answer key.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderMarkdown } from './lib/diagnostics.mjs';
import { specDataLayout } from './lib/spec-source.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { data: DATA } = specDataLayout(root);

const [inArg, outArg, templateArg] = process.argv.slice(2);
const input = inArg ? resolve(inArg) : join(DATA, 'diagnostics.json');
const out = outArg ? resolve(outArg) : join(DATA, 'diagnostics.md');
const template = templateArg ? resolve(templateArg) : join(root, 'scripts/templates/diagnostics.md');

try {
  const diagnostics = JSON.parse(readFileSync(input, 'utf-8'));

  if (!Array.isArray(diagnostics.findings)) {
    throw new Error(`${input} carries no findings array; run scripts/collect-diagnostics.mjs first`);
  }

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, renderMarkdown(diagnostics, template), 'utf-8');

  console.log(`render-diagnostics: ${diagnostics.findings.length} finding(s) -> ${out}`);
} catch (error) {
  console.error(`render-diagnostics: FAILED — ${error.message}`);
  process.exit(1);
}
