/**
 * Bundle the public entry point for a browser, and fail if a browser could not
 * run the result.
 *
 * The gate D-BROWSER-1 asks for: `@the-cascade-protocol/sdk` MUST load and run
 * in a page bundled by an ordinary bundler for a browser target. A statement
 * without a check is a document, so this is the check. It does what a
 * consumer's Vite or webpack build would do — start at `src/index.ts`, follow
 * every static import, resolve for a browser — and fails the way theirs would:
 * on a `node:` builtin with no browser resolution, on a `createRequire`, on a
 * CommonJS `require()` a bundler cannot follow.
 *
 * WARNINGS FAIL TOO. esbuild reports a dynamic `require()` in ESM as a warning
 * and leaves a shim that throws "Dynamic require of ... is not supported" at
 * runtime — a bundle that builds and then breaks the first time `serialize` is
 * called. That is the exact failure this check exists to catch, so a warning
 * is a failure here, whatever esbuild calls it.
 *
 * WHAT COMES OUT IS INSPECTED, NOT JUST WHETHER SOMETHING CAME OUT. A bundle
 * that still carries an import for the runtime to resolve is a bundle that
 * reaches for something the browser will not have. esbuild leaves those only
 * for things it was told were external, which nothing here tells it — but the
 * assertion costs nothing and the failure mode it guards against is silent.
 * It is asked of esbuild's metafile, which lists exactly what was left
 * external, rather than of the output text, where a statement quoted inside
 * a string would match too (`scripts/lib/runtime-imports.mjs`).
 *
 * Exported as a function so `tests/browser-bundle.test.ts` can hand it source
 * that MUST fail before pointing it at ours — as text, resolved from the
 * repository root, because a scratch file under the system temp directory
 * costs esbuild a 25-second walk of that directory on Windows; run as a script
 * it bundles `src/index.ts` and exits non-zero on any finding. Nothing is written unless
 * `--out` names a file; the artefact is the verdict, not the bundle.
 *
 * @module scripts/check-browser-bundle
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

import { isMainModule } from './lib/main-module.mjs';
import { runtimeImports } from './lib/runtime-imports.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

/**
 * Bundle `entry` for a browser and return every reason it could not run there.
 *
 * @param {string | { contents: string }} entry - Absolute path of the entry
 *   point to bundle, or its TypeScript source, resolved from the repository root.
 * @param {{ format?: 'esm' | 'iife', globalName?: string }} [options]
 * @returns {Promise<{ findings: string[], code: string }>} An empty `findings`
 *   means a browser could load `code`.
 */
export async function bundleForBrowser(entry, options = {}) {
  const findings = [];
  let code = '';
  let metafile;

  try {
    const result = await build({
      ...(typeof entry === 'string'
        ? { entryPoints: [entry] }
        : { stdin: { contents: entry.contents, resolveDir: ROOT, loader: 'ts', sourcefile: 'entry.ts' } }),
      // Paths in findings and in the bundle's own comments are relative to
      // here, whatever the current directory is.
      absWorkingDir: ROOT,
      metafile: true,
      bundle: true,
      write: false,
      platform: 'browser',
      format: options.format ?? 'esm',
      globalName: options.globalName,
      target: 'es2022',
      logLevel: 'silent',
      // A bare `console`/`document` reference is fine; a Node global is a
      // finding at runtime, which the smoke test — not this — reports.
    });
    for (const w of result.warnings) findings.push(`warning: ${describe(w)}`);
    code = result.outputFiles?.[0]?.text ?? '';
    metafile = result.metafile;
  } catch (err) {
    for (const e of err.errors ?? []) findings.push(`error: ${describe(e)}`);
    if (!err.errors) findings.push(`error: ${err.message}`);
    return { findings, code };
  }

  // What esbuild left in the output for the runtime to resolve: each one
  // names a module the browser is expected to supply. Read off the metafile,
  // not the text — see scripts/lib/runtime-imports.mjs.
  for (const survivor of runtimeImports(metafile)) {
    findings.push(`runtime resolution left in bundle: ${survivor}`);
  }

  return { findings, code };
}

function describe(message) {
  const where = message.location
    ? ` (${message.location.file}:${message.location.line})`
    : '';
  return `${message.text}${where}`;
}

if (isMainModule(import.meta.url)) {
  const entry = resolve(ROOT, 'src/index.ts');
  const outIndex = process.argv.indexOf('--out');
  const out = outIndex === -1 ? undefined : process.argv[outIndex + 1];

  const { findings, code } = await bundleForBrowser(entry);

  if (findings.length > 0) {
    console.error('check-browser-bundle: FAILED — src/index.ts does not bundle for a browser:');
    for (const f of findings) console.error(`  - ${f}`);
    console.error(
      '\nD-BROWSER-1: the public entry point must bundle and run for a browser target. '
      + 'A node: builtin, createRequire, or a CommonJS require() on any path reachable '
      + 'from src/index.ts is what this reports.',
    );
    process.exit(1);
  }

  if (out) {
    writeFileSync(resolve(ROOT, out), code, 'utf-8');
  }
  console.log(
    `check-browser-bundle: OK — src/index.ts bundles for a browser `
    + `(${(code.length / 1024).toFixed(0)}K esm${out ? `, written to ${out}` : ''})`,
  );
}
