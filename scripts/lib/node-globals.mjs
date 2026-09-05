/**
 * Which bare Node globals a source reaches — `process`, `Buffer`, `__dirname`,
 * `global` — found by compiling it with Node's types withheld.
 *
 * THE GAP THIS CLOSES. esbuild's browser build fails on what it cannot
 * resolve: a `node:` builtin, a bare specifier, a dynamic `require()`. A free
 * identifier is not an import, so `process.env.X` or `Buffer.from(...)` passes
 * through `platform: 'browser'` untouched and unreported, and reaches a page
 * as a ReferenceError the first time its path runs. The vm smoke test would
 * see one, but only on the paths one fixture exercises. A compile under
 * `tsconfig.browser.json` — `types: []`, so `@types/node` is not visible — sees
 * every path in `src/` at once, and names the identifier.
 *
 * ONE SET OF OPTIONS, TWO CALLERS. The options come from the config file, not
 * from a literal here, so what the gate judges `src/` by and what the test
 * hands a scratch source to are the same thing. `nodeGlobalsIn(source)` and
 * `nodeGlobalsInJs(source)` compile one in-memory file under those options;
 * `nodeGlobalsInSrc()` compiles the config's own `include`, which
 * `browserGateFiles()` will name. `tests/browser-bundle.test.ts` makes the
 * probes speak before the gate runs `src/`.
 *
 * JAVASCRIPT COUNTS TOO, AND IS JUDGED NARROWLY. `src/vendor/n3/n3.js` is the
 * largest thing in the browser bundle and the one file here nobody wrote by
 * hand, so it is the likeliest place a Node global arrives — and an `include`
 * of `src/**\/*.ts` with `allowJs` off opened it never, and reported the gate
 * clean for not having looked. `tsconfig.browser.json` now sets `allowJs` and
 * `checkJs` and includes `src/**\/*.js`.
 *
 * WHAT COUNTS. From a `.ts` file, every diagnostic the compile produces:
 * `src/` is clean under `tsconfig.json`, so anything that appears only when
 * Node's types are withheld is a reference those types were answering — which
 * is the finding. From a `.js` file, only {@link UNRESOLVED_NAME}. Untyped
 * JavaScript under `checkJs` produces hundreds of INFERENCE diagnostics — an
 * implicit `any` parameter, a property absent from an inferred shape — and
 * none of them is a Node global, so counting them would fail the gate
 * permanently on code this repository did not write. A bare `process`,
 * `Buffer`, `__dirname`, `__filename` or `global` is an identifier the
 * compiler cannot resolve, and that is a different diagnostic in a different
 * family; `tests/browser-bundle.test.ts` pins each of the five to it, so a
 * TypeScript release that renumbered one would turn that test red rather than
 * quietly narrowing the gate.
 *
 * The narrowing does not reach TypeScript: a scratch `.ts` probe and `src/`
 * itself are still held to every diagnostic, so a probe must be otherwise
 * well-typed.
 *
 * @module scripts/lib/node-globals
 */

import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const CONFIG = resolve(ROOT, 'tsconfig.browser.json');

/** The parsed config: compiler options and the files its `include` names. */
function browserConfig() {
  const { config, error } = ts.readConfigFile(CONFIG, ts.sys.readFile);
  if (error) throw new Error(`node-globals: cannot read ${CONFIG}: ${ts.flattenDiagnosticMessageText(error.messageText, '\n')}`);
  const parsed = ts.parseJsonConfigFileContent(config, ts.sys, ROOT);
  if (parsed.errors.length > 0) {
    throw new Error(`node-globals: ${CONFIG} does not parse:\n${parsed.errors
      .map((d) => `  - ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`).join('\n')}`);
  }
  return parsed;
}

/**
 * The diagnostics TypeScript emits for an identifier it cannot resolve —
 * every spelling of "Cannot find name 'x'", bare (2304) or carrying a hint
 * about `@types/node` (2580, 2591), jQuery (2581, 2592), a test runner (2582,
 * 2593), the `lib` setting (2583, 2584) or a near miss (2552).
 *
 * This is the whole of what a `.js` file is judged on. A bare Node global
 * lands here and nowhere else; the inference diagnostics that untyped
 * JavaScript produces in bulk do not. Not applied to TypeScript, which
 * answers for everything it produces.
 */
const UNRESOLVED_NAME = new Set([2304, 2552, 2580, 2581, 2582, 2583, 2584, 2591, 2592, 2593]);

/** Whether one diagnostic is reported, given the file kind it came from. */
function counts(diagnostic) {
  const file = diagnostic.file?.fileName ?? '';
  return /\.[cm]?js$/.test(file) ? UNRESOLVED_NAME.has(diagnostic.code) : true;
}

/** `path:line message`, path relative to the repository, for one diagnostic. */
function describe(diagnostic) {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ');
  if (!diagnostic.file || diagnostic.start === undefined) return message;
  const { line } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  const path = relative(ROOT, diagnostic.file.fileName).replace(/\\/g, '/');
  return `${path}:${line + 1} ${message}`;
}

/**
 * The diagnostics the program rooted at `files` produces under the browser
 * options, as `path:line message`. Empty means no Node global is reached.
 *
 * From every file the program reached, not only the roots. `tsconfig.json`
 * sets `skipLibCheck`, so a lib or a declaration file produces none, and
 * every other file in the program is one the caller asked about — `src/`
 * itself, or a file a probe imports. A filter down to the root files once
 * dropped a Node global reached through a relative import and reported the
 * probe clean. What each file kind answers for is {@link counts}.
 *
 * @param {string[]} files - Absolute paths to compile.
 * @param {ts.CompilerHost} host
 * @param {ts.CompilerOptions} options
 * @returns {string[]}
 */
function findingsOf(files, host, options) {
  const program = ts.createProgram(files, options, host);
  return ts.getPreEmitDiagnostics(program).filter(counts).map(describe);
}

/**
 * The files the gate compiles — the config's own `include`, resolved — as
 * repository-relative paths with forward slashes.
 *
 * Exported so a test can assert the gate opens what ships. A compile that
 * skipped `src/vendor/n3/n3.js` would report `src/` clean for never having
 * read the largest thing in the browser bundle, and no assertion about the
 * FINDINGS can tell that apart from a tree that is genuinely clean.
 *
 * @returns {string[]}
 */
export function browserGateFiles() {
  const { fileNames } = browserConfig();
  return fileNames.map((f) => relative(ROOT, f).replace(/\\/g, '/'));
}

/**
 * The Node globals `src/` reaches — the config's own `include`, compiled with
 * Node's types withheld. TypeScript and JavaScript both.
 *
 * @returns {string[]} `path:line message` for each, empty when there are none.
 */
export function nodeGlobalsInSrc() {
  const { options, fileNames } = browserConfig();
  return findingsOf(fileNames, ts.createCompilerHost(options), options);
}

/**
 * The Node globals one TypeScript `source` reaches, under the same options.
 *
 * In memory, resolved as if it sat at the repository root, so a relative
 * import in it would find `src/` — or one of `siblings`, in-memory files
 * beside it keyed by root-relative path, for a probe that needs a dependency
 * of its own. Nothing is written.
 *
 * @param {string} source - TypeScript source text.
 * @param {Record<string, string>} [siblings] - Further in-memory files, as
 *   `{ 'probe-dep.ts': source }`, resolved from the repository root.
 * @returns {string[]} As {@link nodeGlobalsInSrc}; the path is `probe.ts`.
 */
export function nodeGlobalsIn(source, siblings = {}) {
  return probe('probe.ts', source, siblings);
}

/**
 * The same, for one JavaScript `source` — the kind of file `src/vendor/`
 * holds, and the kind judged on {@link UNRESOLVED_NAME} alone.
 *
 * @param {string} source - JavaScript source text.
 * @param {Record<string, string>} [siblings] - Further in-memory files, as
 *   `{ 'probe-dep.js': source }`, resolved from the repository root.
 * @returns {string[]} As {@link nodeGlobalsInSrc}; the path is `probe.js`.
 */
export function nodeGlobalsInJs(source, siblings = {}) {
  return probe('probe.js', source, siblings);
}

/**
 * One in-memory `entry` compiled under the browser options.
 *
 * @param {string} entry - Root-relative name for the source, `.ts` or `.js`.
 * @param {string} source
 * @param {Record<string, string>} siblings
 * @returns {string[]}
 */
function probe(entry, source, siblings) {
  const { options } = browserConfig();
  const host = ts.createCompilerHost(options);
  // The host's own notion of "the same file": case-folded exactly where the
  // platform folds case, with the slashes TypeScript hands back.
  const key = (f) => host.getCanonicalFileName(resolve(ROOT, f).replace(/\\/g, '/'));
  const virtual = new Map([[entry, source], ...Object.entries(siblings)].map(([p, s]) => [key(p), s]));
  const real = { fileExists: host.fileExists, readFile: host.readFile, getSourceFile: host.getSourceFile };
  host.fileExists = (f) => virtual.has(key(f)) || real.fileExists(f);
  host.readFile = (f) => virtual.get(key(f)) ?? real.readFile(f);
  host.getSourceFile = (f, languageVersion, onError, shouldCreate) =>
    (virtual.has(key(f))
      ? ts.createSourceFile(f, virtual.get(key(f)), languageVersion)
      : real.getSourceFile(f, languageVersion, onError, shouldCreate));
  return findingsOf([resolve(ROOT, entry)], host, options);
}
