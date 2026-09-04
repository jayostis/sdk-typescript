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
 * hands a scratch source to are the same thing. `nodeGlobalsIn(source)`
 * compiles one in-memory file under those options; `nodeGlobalsInSrc()`
 * compiles the config's own `include`. `tests/browser-bundle.test.ts` makes
 * the first speak before the gate runs the second.
 *
 * WHAT COUNTS. Every diagnostic the compile produces. `src/` is clean under
 * `tsconfig.json`, so anything that appears only when Node's types are
 * withheld is a reference those types were answering — which is the finding.
 * A scratch source is held to the same standard, so a test probe must be
 * otherwise well-typed.
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

/** `path:line message`, path relative to the repository, for one diagnostic. */
function describe(diagnostic) {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ');
  if (!diagnostic.file || diagnostic.start === undefined) return message;
  const { line } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  const path = relative(ROOT, diagnostic.file.fileName).replace(/\\/g, '/');
  return `${path}:${line + 1} ${message}`;
}

/**
 * Every diagnostic `files` produce under the browser options, as
 * `path:line message`. Empty means no Node global is reached.
 *
 * @param {string[]} files - Absolute paths to compile.
 * @param {ts.CompilerHost} host
 * @param {ts.CompilerOptions} options
 * @returns {string[]}
 */
function findingsOf(files, host, options) {
  const program = ts.createProgram(files, options, host);
  return ts.getPreEmitDiagnostics(program)
    // Only what the asked-for files say. A lib or a declaration file cannot
    // reach a Node global, and its diagnostics would be about something else.
    .filter((d) => !d.file || files.some((f) => samePath(f, d.file.fileName)))
    .map(describe);
}

function samePath(a, b) {
  return resolve(a).replace(/\\/g, '/').toLowerCase() === resolve(b).replace(/\\/g, '/').toLowerCase();
}

/**
 * The Node globals `src/` reaches — the config's own `include`, compiled with
 * Node's types withheld.
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
 * import in it would find `src/`. Nothing is written.
 *
 * @param {string} source - TypeScript source text.
 * @returns {string[]} As {@link nodeGlobalsInSrc}; the path is `probe.ts`.
 */
export function nodeGlobalsIn(source) {
  const { options } = browserConfig();
  const probe = resolve(ROOT, 'probe.ts');
  const host = ts.createCompilerHost(options);
  const real = { fileExists: host.fileExists, readFile: host.readFile, getSourceFile: host.getSourceFile };
  host.fileExists = (f) => samePath(f, probe) || real.fileExists(f);
  host.readFile = (f) => (samePath(f, probe) ? source : real.readFile(f));
  host.getSourceFile = (f, languageVersion, onError, shouldCreate) =>
    (samePath(f, probe)
      ? ts.createSourceFile(f, source, languageVersion)
      : real.getSourceFile(f, languageVersion, onError, shouldCreate));
  return findingsOf([probe], host, options);
}
