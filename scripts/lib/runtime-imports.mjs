/**
 * What a bundle still reaches for at runtime, read off esbuild's metafile.
 *
 * ONE DETECTOR, NOT THREE. `vendor-n3.mjs`, `check-browser-bundle.mjs` and
 * `tests/vendor-drift.test.ts` each carried a regular expression over the
 * output text for a surviving `import ... from` or `require(`, and the three
 * disagreed: one matched any `require(` and never looked for `createRequire`,
 * one matched only a string-literal `require('x')`, one had a third shape for
 * `export ... from`. A fix to one would not reach the others. Text is also the
 * wrong thing to read — a usage hint holding `import { x } from "y";` on a
 * line of its own inside a template literal matched, and it is not an import.
 *
 * esbuild knows the exact answer. With `metafile: true`, every output lists
 * its `imports`, and the ones left for the runtime carry `external: true` —
 * an `import-statement`, a `require-call`, a `dynamic-import`, each with the
 * specifier as written. Nothing inside a string is among them, because
 * esbuild read syntax. `tests/scripts/runtime-imports.test.ts` makes both
 * functions speak before anything points them at ours.
 *
 * @module scripts/lib/runtime-imports
 */

import { build } from 'esbuild';

/**
 * Every import esbuild left for the runtime in `metafile`'s outputs, as
 * `specifier (kind)`, in the order esbuild lists them.
 *
 * @param {import('esbuild').Metafile} metafile - From a build with `metafile: true`.
 * @returns {string[]} Empty when the bundle resolves everything itself.
 */
export function runtimeImports(metafile) {
  return Object.values(metafile.outputs).flatMap((output) =>
    output.imports
      .filter((entry) => entry.external)
      .map((entry) => `${entry.path} (${entry.kind})`));
}

/**
 * Every specifier a FINISHED bundle reaches for — for a file in hand rather
 * than a build in progress.
 *
 * Run through esbuild with a plugin that marks every specifier external, so
 * nothing is resolved, inlined or refused: whatever the file names is listed,
 * relative paths included. A shipped bundle that imports `./x.js` is reaching
 * for a file exactly as one importing `buffer` is reaching for a package.
 *
 * @param {string} code - The bundle's text.
 * @param {{ resolveDir: string }} options - Where esbuild would resolve from;
 *   only used to anchor the build, since nothing is resolved.
 * @returns {Promise<string[]>} As {@link runtimeImports}.
 */
export async function runtimeImportsOf(code, { resolveDir }) {
  const leaveEverything = {
    name: 'leave-everything',
    setup(api) {
      api.onResolve({ filter: /.*/ }, (args) =>
        (args.kind === 'entry-point' ? undefined : { path: args.path, external: true }));
    },
  };

  const result = await build({
    stdin: { contents: code, resolveDir, loader: 'js', sourcefile: 'bundle.js' },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    logLevel: 'silent',
    metafile: true,
    absWorkingDir: resolveDir,
    plugins: [leaveEverything],
  });

  return runtimeImports(result.metafile);
}
