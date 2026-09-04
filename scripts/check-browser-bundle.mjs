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
 * WARNINGS FAIL TOO, AND SO DOES THE ONE THING ESBUILD DOES NOT WARN ABOUT.
 * A string-literal `require('x')` that cannot resolve is an error. A
 * NON-LITERAL `require(name)` is neither an error nor a warning against the
 * pinned esbuild: it builds, the metafile lists nothing external, and the
 * output carries a `__require` shim whose body throws "Dynamic require of ...
 * is not supported" — a bundle that builds and then breaks the first time the
 * path runs. That is the exact failure this check exists to catch, and the
 * only other thing that would catch it is the vm smoke test, if the path
 * happens to execute. So the output is searched for the shim esbuild injects
 * for exactly that case: a marker derived from what esbuild parsed, not a
 * quoted string, and one it emits only when a non-literal `require` survived.
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
 * A BARE NODE GLOBAL IS NEITHER. `process.env.X`, `Buffer.from(...)`,
 * `__dirname`, `global`: free identifiers, not imports, so esbuild leaves them
 * in a browser bundle untouched and reports nothing, and the vm smoke test
 * sees only the paths one fixture walks. The second half of the verdict is a
 * compile of `src/` with Node's types withheld (`tsconfig.browser.json`,
 * through `scripts/lib/node-globals.mjs`), which names such a reference on
 * every path. One script, one exit code, both halves.
 *
 * Exported as a function so `tests/browser-bundle.test.ts` can hand it source
 * that MUST fail before pointing it at ours — as text, resolved from the
 * repository root, because a scratch file under the system temp directory
 * costs esbuild a 25-second walk of that directory on Windows; run as a script
 * it bundles `src/index.ts` and exits non-zero on any finding. Nothing is
 * written: the artefact is the verdict, not the bundle, and `bundleForBrowser`
 * returns the bytes to anyone who wants them.
 *
 * @module scripts/check-browser-bundle
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

import { isMainModule } from './lib/main-module.mjs';
import { nodeGlobalsInSrc } from './lib/node-globals.mjs';
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

  // The one case the metafile cannot show. See DYNAMIC_REQUIRE_SHIM.
  if (DYNAMIC_REQUIRE_SHIM.test(code)) {
    findings.push(
      'dynamic require() left in bundle: esbuild injected its __require shim, which throws '
      + '"Dynamic require of ... is not supported" the first time the path runs in a browser',
    );
  }

  return { findings, code };
}

/**
 * The helper esbuild emits when a non-literal `require(expr)` survives into
 * an ESM or IIFE bundle: `var __require = /* @__PURE__ *\/ ((x) => typeof
 * require !== "undefined" ? require : ...`. Its body throws in a browser. A
 * string-literal `require('x')` never produces it — esbuild inlines that or
 * errors — so its presence is exactly one fact: something in the bundle
 * still calls `require` with a value esbuild could not read. Anchored to the
 * line start and the declaration, so a mention inside a string does not match.
 */
const DYNAMIC_REQUIRE_SHIM = /^\s*var __require = /m;

function describe(message) {
  const where = message.location
    ? ` (${message.location.file}:${message.location.line})`
    : '';
  return `${message.text}${where}`;
}

if (isMainModule(import.meta.url)) {
  const entry = resolve(ROOT, 'src/index.ts');

  const { findings, code } = await bundleForBrowser(entry);
  const globals = nodeGlobalsInSrc().map((g) => `Node global reached: ${g}`);

  if (findings.length > 0 || globals.length > 0) {
    console.error('check-browser-bundle: FAILED — src/index.ts does not bundle and run for a browser:');
    for (const f of [...findings, ...globals]) console.error(`  - ${f}`);
    console.error(
      '\nD-BROWSER-1: the public entry point must bundle and run for a browser target. '
      + 'A node: builtin, createRequire, or a CommonJS require() on any path reachable '
      + 'from src/index.ts is what the bundle half reports; a bare process, Buffer, '
      + '__dirname or global anywhere in src/ is what the compile half reports.',
    );
    process.exit(1);
  }

  console.log(
    `check-browser-bundle: OK — src/index.ts bundles for a browser `
    + `(${(code.length / 1024).toFixed(0)}K esm) and src/ reaches no Node global`,
  );
}
