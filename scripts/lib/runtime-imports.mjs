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
 * esbuild read syntax. `tests/scripts/runtime-imports.test.ts` makes it speak
 * before anything points it at ours.
 *
 * NO VARIANT FOR A FINISHED FILE. The committed `n3.js` is held byte-equal to
 * what `buildVendoredN3` returns, and that function throws on a survivor
 * from this same metafile read, so a second esbuild pass over the committed
 * text could only fail after the equality already had.
 *
 * @module scripts/lib/runtime-imports
 */

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
