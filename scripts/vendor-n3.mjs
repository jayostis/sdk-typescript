/**
 * Build `src/vendor/n3/n3.js` — the Turtle parser and writer this SDK ships —
 * from n3's ESM source, as one file with static imports and nothing left for a
 * runtime to resolve.
 *
 * WHY A BUNDLE AND NOT A COPY. The copy this replaces was n3's CommonJS build,
 * eight files reached through `createRequire` because the ESM original does
 * not load under `"type": "module"`: every relative import in `n3/src/` is
 * extensionless (`import N3Lexer from './N3Lexer'`), and `N3Lexer.js` imports
 * `Buffer` from the `buffer` package. `createRequire` has no browser
 * equivalent and a CommonJS `require()` is invisible to a bundler, so the copy
 * could never satisfy D-BROWSER-1. esbuild resolves the extensionless
 * specifiers the way CommonJS resolution would have, inlines the modules it
 * reached, and the one external — `buffer` — is answered by the shim below.
 * What comes out is a single ES module with no `import` in it.
 *
 * "UNMODIFIED" NOW MEANS "REPRODUCIBLE". The old drift test could compare the
 * copy byte-for-byte against `node_modules/n3/lib`; a bundle cannot be, so the
 * comparison moves one step earlier: `tests/vendor-drift.test.ts` runs THIS
 * function against the installed n3 and requires the committed file to be
 * byte-identical to its output. An edit to `n3.js` fails it. A bumped pin
 * fails it. A different esbuild fails it, which is why esbuild is an exact
 * devDependency. Every transform applied is declared in this file, so
 * "the vendored parser is upstream's code" is still a statement with a check.
 *
 * ONLY PARSER AND WRITER. `n3/src/index.js` also exports the store, the
 * reasoner and the streaming parser and writer, which pull in `readable-stream`
 * and with it half of Node. Nothing here calls them; bundling them would mean
 * polyfilling Node to satisfy code nobody reaches.
 *
 * Run: `node scripts/vendor-n3.mjs` writes the bundle and copies the licence.
 * Re-vendoring is `npm install n3@<version>` and this, then the VENDOR.md and
 * NOTICE tables.
 *
 * @module scripts/vendor-n3
 */

import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

import { isMainModule } from './lib/main-module.mjs';
import { runtimeImports } from './lib/runtime-imports.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT_DIR = resolve(ROOT, 'src/vendor/n3');
const OUT = resolve(OUT_DIR, 'n3.js');

/**
 * What answers `import { Buffer } from 'buffer'` in the bundle.
 *
 * `N3Lexer` reaches `Buffer.concat` on one path only: `tokenize` handed a
 * STREAM, joining a chunk onto the bytes a previous chunk left mid-codepoint.
 * This SDK hands the parser a complete string, so the path is never entered —
 * but the import is still there, and a browser bundle that resolved it to the
 * `buffer` npm package would carry 50K of polyfill for a branch nothing takes.
 * The shim keeps the import satisfiable and makes the branch loud if a future
 * caller ever reaches it.
 */
const BUFFER_SHIM = `// Replaces \`import { Buffer } from 'buffer'\` in n3's N3Lexer. See scripts/vendor-n3.mjs.
export const Buffer = {
  concat() {
    throw new Error(
      'streaming input is not supported by the vendored n3 in @the-cascade-protocol/sdk; '
      + 'hand the parser a complete string',
    );
  },
};
`;

/** The esbuild plugin that answers `buffer` with {@link BUFFER_SHIM}. */
const bufferShim = {
  name: 'buffer-shim',
  setup(api) {
    api.onResolve({ filter: /^buffer$/ }, () => ({ path: 'buffer', namespace: 'buffer-shim' }));
    api.onLoad({ filter: /.*/, namespace: 'buffer-shim' }, () => ({ contents: BUFFER_SHIM, loader: 'js' }));
  },
};

/** The installed n3's version, read from the package the bundle is built from. */
export function installedN3Version() {
  return JSON.parse(readFileSync(resolve(ROOT, 'node_modules/n3/package.json'), 'utf-8')).version;
}

/**
 * The vendored bundle, as text, built from the installed n3.
 *
 * Deterministic for a given n3 and esbuild: same input, same bytes, from any
 * working directory. That property is what the drift test rests on, and the
 * last clause is `absWorkingDir` below: esbuild writes a
 * `// node_modules/n3/src/IRIs.js` comment above each module it inlines,
 * relative to that directory — which, unset, is `process.cwd()`, so a run from
 * a parent directory built `// sdk-typescript/node_modules/...` and a bundle
 * the drift test refused.
 *
 * @returns {Promise<string>}
 */
export async function buildVendoredN3() {
  const version = installedN3Version();

  const result = await build({
    stdin: {
      contents:
        "export { default as Parser } from './node_modules/n3/src/N3Parser.js';\n"
        + "export { default as Writer } from './node_modules/n3/src/N3Writer.js';\n",
      resolveDir: ROOT,
      sourcefile: 'vendor-n3-entry.js',
      loader: 'js',
    },
    absWorkingDir: ROOT,
    metafile: true,
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: false,
    treeShaking: true,
    logLevel: 'silent',
    plugins: [bufferShim],
    banner: {
      js: [
        `// n3@${version} — Parser and Writer, bundled from node_modules/n3/src/ by`,
        '// scripts/vendor-n3.mjs. Generated: do not edit. MIT, see LICENSE.md beside',
        '// this file; the transforms applied are declared in the script.',
      ].join('\n'),
    },
  });

  if (result.warnings.length > 0) {
    throw new Error(
      'vendor-n3: esbuild warned, which for a vendored bundle is a defect:\n'
      + result.warnings.map((w) => `  - ${w.text}`).join('\n'),
    );
  }

  const code = result.outputFiles[0].text;

  // Nothing may be left for the runtime to resolve: that is the entire reason
  // this bundle exists. A surviving import means a specifier esbuild treated
  // as external, which nothing here asks for. Asked of esbuild's metafile,
  // not of the text — see scripts/lib/runtime-imports.mjs.
  const survivors = runtimeImports(result.metafile);
  if (survivors.length > 0) {
    throw new Error(
      'vendor-n3: the bundle still reaches for something at runtime:\n'
      + survivors.map((s) => `  - ${s}`).join('\n'),
    );
  }

  return code;
}

if (isMainModule(import.meta.url)) {
  const code = await buildVendoredN3();
  writeFileSync(OUT, code, 'utf-8');
  copyFileSync(resolve(ROOT, 'node_modules/n3/LICENSE.md'), resolve(OUT_DIR, 'LICENSE.md'));
  console.log(
    `vendor-n3: n3@${installedN3Version()} -> src/vendor/n3/n3.js `
    + `(${(code.length / 1024).toFixed(0)}K) and LICENSE.md`,
  );
}
