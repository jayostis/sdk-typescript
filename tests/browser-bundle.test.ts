/**
 * The public entry point bundles for a browser and runs there — D-BROWSER-1.
 *
 * `@the-cascade-protocol/sdk` is a library for applications, and the places a
 * patient meets a pod are browsers: a Vite-built page, a Tauri renderer, the
 * playground. Each of those bundles this package the same way — start at the
 * entry point, follow every static import, resolve for a browser — and each
 * fails the same way on a `node:` builtin, a `createRequire`, or a CommonJS
 * `require()` nothing can follow. `scripts/check-browser-bundle.mjs` does what
 * they do; this proves it speaks, then points it at `src/index.ts`, then RUNS
 * what came out somewhere no Node builtin can be reached.
 *
 * `tests/no-runtime-deps.test.ts` asks whether `src/` needs anything installed.
 * This asks the question that one's comment used to say nothing asks: whether
 * the package runs outside Node. Two halves, because a bundler answers only
 * half of it: what esbuild cannot RESOLVE it refuses, but a bare Node global
 * — `process`, `Buffer`, `__dirname` — is a free identifier it passes
 * through in silence, and the vm run below sees only the paths imm-001
 * walks. `nodeGlobalsIn` compiles with Node's types withheld
 * (`tsconfig.browser.json`) and names such a reference on every path — in the
 * vendored JavaScript as well as the TypeScript, since that is the largest
 * thing in the bundle and the one file here nobody wrote by hand.
 *
 * @see https://github.com/the-cascade-protocol/spec/blob/main/decisions/2026-09-03-browser-safety.md
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

import { describe, it, expect } from 'vitest';

import { bundleForBrowser } from '../scripts/check-browser-bundle.mjs';
import { browserGateFiles, nodeGlobalsIn, nodeGlobalsInJs, nodeGlobalsInSrc } from '../scripts/lib/node-globals.mjs';
import { loadFixture } from './support/fixtures.js';
import { graphDifference, quadsFromTurtle } from './support/graph.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = resolve(root, 'src/index.ts');

/**
 * An entry point saying exactly what a case needs it to say. In memory, not a
 * scratch file: esbuild resolves an entry against its directory, and a file
 * under the system temp directory costs a 25-second walk of that directory on
 * Windows.
 */
const entrySaying = (contents: string) => ({ contents });

describe('bundleForBrowser', () => {
  // A detector is proven by making it speak (tests/README.md). Pointed only at
  // a tree where it should stay silent, a check that never looked reports the
  // same as one that did.
  it('names a node: builtin the browser cannot resolve', async () => {
    const { findings } = await bundleForBrowser(entrySaying(
      "import { createRequire } from 'node:module';\n"
      + 'export const require = createRequire(import.meta.url);\n',
    ));

    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('node:module');
  });

  it('names node:crypto too, which is the import upstream carried', async () => {
    const { findings } = await bundleForBrowser(entrySaying(
      "import { createHash } from 'node:crypto';\n"
      + "export const h = createHash('sha1');\n",
    ));

    expect(findings.join('\n')).toContain('node:crypto');
  });

  it('is silent for a module that reaches for nothing', async () => {
    const { findings, code } = await bundleForBrowser(entrySaying(
      'export const x = new TextEncoder().encode("ok");\n',
    ));

    expect(findings).toEqual([]);
    expect(code).toContain('TextEncoder');
  });

  it('names a non-literal require(), which esbuild builds without a word', async () => {
    // Against the pinned esbuild this is neither an error nor a warning, and
    // the metafile lists nothing external: the bundle builds, and carries a
    // `__require` shim that throws the first time the path runs in a browser.
    // The only other thing that would catch it is the vm smoke test, and only
    // if the path executes. So the check reads the shim esbuild injects.
    const { findings } = await bundleForBrowser(entrySaying(
      'export const load = (name: string) => require(name);\n',
    ));

    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('dynamic require()');
  });

  it('is silent for an import spelled inside a string', async () => {
    // A usage hint or an error message quoting the statement is text, not a
    // module the browser must supply. The check asks esbuild what it left
    // external — its metafile — rather than reading the output's lines, so
    // the first message under `src/` written this way does not turn the gate
    // red with no defect behind it.
    const { findings } = await bundleForBrowser(entrySaying(
      'export const msg = `usage:\nimport { x } from "y";\n`;\n',
    ));

    expect(findings).toEqual([]);
  });
});

describe('nodeGlobalsIn', () => {
  it('names a bare Node global, with its line', () => {
    // The probe bundles clean through bundleForBrowser — esbuild has nothing
    // to resolve — which is the whole reason this second detector exists.
    const source = 'export const home = process.cwd();\n'
      + "export const bytes = Buffer.from('x');\n"
      + 'export const here = __dirname;\n';

    const findings = nodeGlobalsIn(source);

    expect(findings).toHaveLength(3);
    expect(findings[0]).toMatch(/^probe\.ts:1 .*'process'/);
    expect(findings[1]).toMatch(/^probe\.ts:2 .*'Buffer'/);
    expect(findings[2]).toMatch(/^probe\.ts:3 .*'__dirname'/);
  });

  it('bundles that same probe without a word, which is why it is needed', async () => {
    const { findings } = await bundleForBrowser(entrySaying('export const home = process.cwd();\n'));

    expect(findings).toEqual([]);
  });

  it('is silent for what both platforms have', () => {
    // The two Web APIs src/ actually leans on, under the same options the
    // gate compiles src/ with: withholding Node's types must not take these
    // away, or the first honest use of them turns the gate red.
    expect(nodeGlobalsIn(
      'export const id = globalThis.crypto.randomUUID();\n'
      + 'export const bytes = new TextEncoder().encode(id);\n'
      + 'export const view = new DataView(bytes.buffer).getUint32(0);\n',
    )).toEqual([]);
  });

  it('is silent for iterating a DOM collection, which every browser and tsconfig.json allow', () => {
    // `tsconfig.json` names no `lib`, so for target ES2022 it gets the
    // default set, which includes `DOM.Iterable` AND `DOM.AsyncIterable`.
    // `tsconfig.browser.json` names its `lib` explicitly and must name both,
    // or spreading a `URLSearchParams` or streaming a response body with
    // `for await` — each of which passes `npm run typecheck` and runs in
    // every browser — is reported by the gate as if it were a Node global.
    expect(nodeGlobalsIn(
      'export const pairs = [...new URLSearchParams("a=1")];\n'
      + 'export const names = [...new Headers({ a: "1" })].map(([k]) => k);\n'
      + 'export async function drain(r: Response) { for await (const chunk of r.body!) void chunk; }\n',
    )).toEqual([]);
  });

  it('follows a relative import, and names the Node global behind it', () => {
    // The probe is compiled as a program, not as one file: a global reached
    // through an import is reached. `skipLibCheck` keeps declaration files
    // silent, so every diagnostic the program produces is about a source the
    // caller handed in — there is nothing to filter, and a filter on the
    // entry file alone is how this case returned [] once.
    const findings = nodeGlobalsIn(
      "import { home } from './probe-dep.js';\nexport const where = home;\n",
      { 'probe-dep.ts': 'export const home = process.cwd();\n' },
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatch(/^probe-dep\.ts:1 .*'process'/);
  });
});

describe('nodeGlobalsInJs', () => {
  // The vendored parser is JavaScript, and it is the largest thing in the
  // browser bundle. A compile that only ever opened `.ts` would report the
  // gate clean without having read it — the file the gate most needs to see.
  it('names every bare Node global a JavaScript file reaches, with its line', () => {
    const findings = nodeGlobalsInJs(
      'export const home = process.cwd();\n'
      + "export const bytes = Buffer.from('x');\n"
      + 'export const here = __dirname;\n'
      + 'export const there = __filename;\n'
      + 'export const g = global;\n',
    );

    expect(findings).toHaveLength(5);
    expect(findings[0]).toMatch(/^probe\.js:1 .*'process'/);
    expect(findings[1]).toMatch(/^probe\.js:2 .*'Buffer'/);
    expect(findings[2]).toMatch(/^probe\.js:3 .*'__dirname'/);
    expect(findings[3]).toMatch(/^probe\.js:4 .*'__filename'/);
    expect(findings[4]).toMatch(/^probe\.js:5 .*'global'/);
  });

  it('is silent for untyped JavaScript that reaches none', () => {
    // What makes the JavaScript half narrower than the TypeScript one. Under
    // `checkJs` the vendored bundle produces hundreds of inference
    // diagnostics — implicit `any` parameters, properties absent from an
    // inferred shape — none of which is a Node global, and every one of which
    // would turn the gate red for code nobody here wrote. So a `.js` file is
    // judged on unresolved names alone. This probe is exactly that noise: if
    // the filter goes away, it fails.
    expect(nodeGlobalsInJs(
      'export function add(a, b) { return a.x + b.y; }\n'
      + 'const bag = {};\nbag.z = 1;\nexport const z = bag.z;\n',
    )).toEqual([]);
  });

  it('follows a relative import out of JavaScript, and names the global behind it', () => {
    const findings = nodeGlobalsInJs(
      "import { home } from './probe-dep.js';\nexport const where = home;\n",
      { 'probe-dep.js': 'export const home = process.cwd();\n' },
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatch(/^probe-dep\.js:1 .*'process'/);
  });
});

describe('src/index.ts for a browser', () => {
  // The gate's promise is "on any path", and `src/vendor/n3/n3.js` is 91 KB of
  // shipped code that `src/converter/to-rdf.ts` imports statically — inlined
  // into the browser bundle, and passed through by esbuild untouched. An
  // `include` of `src/**/*.ts`, or an `allowJs` left off, silently drops it.
  it('compiles the vendored JavaScript, not only the TypeScript', () => {
    expect(
      browserGateFiles(),
      'tsconfig.browser.json must reach every file that ships in the browser bundle',
    ).toContain('src/vendor/n3/n3.js');
  });

  it('reaches no Node global on any path', { timeout: 60_000 }, () => {
    expect(
      nodeGlobalsInSrc(),
      'a file under src/ names process, Buffer, __dirname or global. That compiles here '
      + 'only because @types/node is installed; in a browser it is a ReferenceError.',
    ).toEqual([]);
  });

  it('bundles with nothing left for the browser to resolve', async () => {
    const { findings } = await bundleForBrowser(ENTRY);

    expect(
      findings,
      'the public entry point reaches a Node builtin, a createRequire, or a CommonJS '
      + 'require(). D-BROWSER-1 forbids each on any path reachable from src/index.ts.',
    ).toEqual([]);
  });

  it('serializes and deserializes a routed fixture where no Node builtin exists', { timeout: 20_000 }, async () => {
    // Not jsdom: jsdom runs on Node, and `process`, `Buffer` and `require` are
    // all still reachable through the realm it borrows. A fresh vm context
    // holds only what is put in it, so a reference to any Node global is a
    // ReferenceError here — the strongest cheap statement of "no builtin was
    // reached". What IS put in is what every browser has.
    const { findings, code } = await bundleForBrowser(ENTRY, { format: 'iife', globalName: 'CascadeSdk' });
    expect(findings).toEqual([]);

    // `crypto` is on the page because every real browser has it. Node's is
    // the same Web Crypto object a browser exposes in a secure context, so
    // the identity module's random fallback takes the `randomUUID` branch
    // here; a page over plain `http://` has `crypto` without `randomUUID`
    // and takes the `getRandomValues` branch, which
    // `tests/deterministic-uri.test.ts` covers by stubbing exactly that.
    const page: Record<string, unknown> = {
      TextEncoder, TextDecoder, URL, console, queueMicrotask, setTimeout, clearTimeout,
      crypto: globalThis.crypto,
    };
    runInNewContext(code, page, { filename: 'sdk.browser.js' });

    const sdk = page.CascadeSdk as {
      serialize(record: object): string;
      deserialize(turtle: string, type: string): Array<Record<string, unknown>>;
      toJsonLd(record: object): object;
      fromJsonLd(doc: object): Record<string, unknown>;
      validate(record: object): { valid: boolean };
      contentHashedUri(resourceType: string, fields: Record<string, string>): string;
    };
    expect(sdk, 'the IIFE did not define CascadeSdk on the page').toBeDefined();

    // imm-001 is routed: `serialize` hands it to the generic converter, which is
    // the path that reaches the vendored parser and writer.
    const fixture = loadFixture('imm-001');
    const turtle = sdk.serialize(fixture.input);
    expect(
      await graphDifference(quadsFromTurtle(turtle), quadsFromTurtle(fixture.expectedOutput.turtle)),
    ).toBeNull();

    const [back] = sdk.deserialize(turtle, 'ImmunizationRecord');
    expect(back).toBeDefined();
    expect(back?.id).toBe(fixture.input.id);
    expect(back?.vaccineName).toBe((fixture.input as Record<string, unknown>).vaccineName);

    // The other three D-BROWSER-1 names. Called, not just present: a function
    // that exists on the page and throws on its first line is the failure mode.
    const doc = sdk.toJsonLd(fixture.input);
    expect(sdk.fromJsonLd(doc).id).toBe(fixture.input.id);
    expect(sdk.validate(fixture.input)).toHaveProperty('valid');

    // The random fallback, on the page's own Web Crypto: a record with nothing
    // to hash still gets a well-formed identifier where a browser would mint it.
    expect(sdk.contentHashedUri('Condition', {}))
      .toMatch(/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
