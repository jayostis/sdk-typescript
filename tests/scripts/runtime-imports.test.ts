/**
 * `scripts/lib/runtime-imports.mjs` names what a bundle still reaches for.
 *
 * Three places used to answer that question with a regular expression over
 * the output text, and the three disagreed about what to match. Text is also
 * the wrong thing to read: a usage hint holding `import { x } from "y";` on a
 * line of its own inside a template literal matched, and it is not an import.
 * esbuild read the syntax, and its metafile says exactly which imports it left
 * for the runtime — so the detector is handed a bundle where it MUST speak,
 * then one where it must stay silent (`tests/README.md`, "A detector is
 * proven by making it speak").
 *
 * @module tests/scripts
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';
import { describe, it, expect } from 'vitest';

// @ts-expect-error -- a build script, deliberately plain JavaScript and untyped.
import { runtimeImports } from '../../scripts/lib/runtime-imports.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** A bundle of `contents`, with `external` left for the runtime, as the scripts build one. */
function bundle(contents: string, external: string[] = []) {
  return build({
    stdin: { contents, resolveDir: root, loader: 'ts', sourcefile: 'entry.ts' },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    logLevel: 'silent',
    metafile: true,
    absWorkingDir: root,
    external,
  });
}

/** A line quoting an import statement: text, not a module the runtime must supply. */
const QUOTED_IMPORT = 'export const msg = `usage:\nimport { x } from "y";\n`;\n';

describe('runtimeImports', () => {
  it('names an import esbuild left external, with how it was reached', async () => {
    const result = await bundle(
      "import { a } from 'left-external';\n"
      + "export const b = require('also-external') + a;\n",
      ['left-external', 'also-external'],
    );

    expect(runtimeImports(result.metafile)).toEqual([
      'left-external (import-statement)',
      'also-external (require-call)',
    ]);
  });

  it('is silent for an import spelled inside a string', async () => {
    const result = await bundle(QUOTED_IMPORT);

    expect(runtimeImports(result.metafile)).toEqual([]);
  });
});
