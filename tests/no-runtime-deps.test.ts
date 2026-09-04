/**
 * The package has no runtime dependencies, and this is what says so.
 *
 * `README.md` advertises a zero-dependency Turtle deserializer and
 * `package.json` has no `dependencies` key at all — absent, not empty. Nothing
 * held that up: the property was a habit, and `@zazuko/env`, `clownface`, `n3`
 * and `rdf-validate-shacl` are devDependencies of this repository and precisely
 * the libraries someone reaches for while working on the serializer. The day a
 * file under `src/` imports one, the suite still passes because it is
 * installed, the build still succeeds, and the package acquires a dependency
 * tree while the README goes on claiming it has none.
 *
 * The detector is handed sources where it MUST speak before it is pointed at
 * ours — `tests/README.md`, "A detector is proven by making it speak."
 */

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import { thirdPartyImports, VENDOR_BARE_SPECIFIERS } from './no-runtime-deps.js';

const srcDir = resolve(dirname(fileURLToPath(import.meta.url)), '../src');

/** A scratch `src/` whose files say what the test needs them to say. */
function scratchSrc(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'no-runtime-deps-'));
  for (const [path, source] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), source, 'utf-8');
  }
  return root;
}

describe('thirdPartyImports', () => {
  it('names the file and the package', () => {
    // Both halves are the finding. A report that a dependency appeared
    // somewhere sends the reader through every file in `src/`.
    const root = scratchSrc({
      'serializer/writer.ts': "import { Parser } from 'n3';\n",
    });

    expect(thirdPartyImports(root)).toEqual(['serializer/writer.ts -> n3']);
  });

  it('is silent for a relative import', () => {
    const root = scratchSrc({
      'serializer/writer.ts': "import { escapeTurtleString } from './turtle-builder.js';\n",
      'serializer/turtle-builder.ts': 'export const escapeTurtleString = String;\n',
    });

    expect(thirdPartyImports(root)).toEqual([]);
  });

  it('is silent for a node: builtin', () => {
    // A builtin ships with the runtime: it costs a consumer no install and
    // appears in no dependency list, which is all this check asks. Whether the
    // package runs OUTSIDE Node — where `node:crypto` does not exist — is a
    // different question, and `tests/browser-bundle.test.ts` asks it; `src/`
    // imports no `node:` builtin today for that reason.
    const root = scratchSrc({
      'utils/deterministic-uri.ts': "import { createHash } from 'node:crypto';\n",
    });

    expect(thirdPartyImports(root)).toEqual([]);
  });

  it('is silent for the JSON data asset', () => {
    // Real, in `src/utils/terminology.ts`. It needs no clause of its own — the
    // specifier is relative, so the relative rule already admits it. What this
    // case pins is that the import attribute is PARSED rather than choked on;
    // a check that flagged this line would be switched off within a week.
    const root = scratchSrc({
      'utils/terminology.ts':
        "import terminologyAsset from '../data/cascade-terminology.json' with { type: 'json' };\n",
    });

    expect(thirdPartyImports(root)).toEqual([]);
  });

  it('reads an import, not a mention', () => {
    // A dozen JSDoc `@example` blocks under `src/` show a consumer importing
    // from '@the-cascade-protocol/sdk'. Every one of them is a bare specifier
    // in the file text and none of them is a dependency, so a check that read
    // lines instead of imports would cry wolf a dozen times on its first run —
    // which is the same as not having it.
    const root = scratchSrc({
      'index.ts':
        "/**\n * @example\n * import { serialize } from '@the-cascade-protocol/sdk';\n */\n" +
        "// import { Parser } from 'n3';\nexport const x = 1;\n",
    });

    expect(thirdPartyImports(root)).toEqual([]);
  });

  it('names a bare specifier however the statement is spelled', () => {
    // Four ways in, and a check that knew only the first would be a rule
    // about phrasing rather than about dependencies.
    const root = scratchSrc({
      'a.ts': "import 'n3';\n",
      'b.ts': "export { Parser } from 'clownface';\n",
      'c.ts': "const env = await import('@zazuko/env');\nexport const x = env;\n",
      'd.ts': "import type { Quad } from 'rdf-validate-shacl';\nexport type Q = Quad;\n",
      // Not a dead form under `module: NodeNext`: it compiles, and tsc emits a
      // `createRequire(import.meta.url)` into the JavaScript — a real runtime
      // require of a real package, reached by a spelling that looks archaic.
      'e.ts': "import cf = require('clownface');\nexport const c = cf;\n",
    });

    expect(thirdPartyImports(root)).toEqual([
      'a.ts -> n3',
      'b.ts -> clownface',
      'c.ts -> @zazuko/env',
      'd.ts -> rdf-validate-shacl',
      'e.ts -> clownface',
    ]);
  });

  it('names a specifier written inline in a type position', () => {
    // `import('n3').Quad` in a type is the same dependency as
    // `import type { Quad } from 'n3'` spelled so that it is not a statement,
    // and it is the form that survives into the emitted `.d.ts`: a consumer
    // installing this package would get types that do not resolve without n3
    // in their own node_modules, which is the thing being prevented.
    const root = scratchSrc({
      'jsonld/converter.ts': "export type Q = import('n3').Quad;\n",
    });

    expect(thirdPartyImports(root)).toEqual(['jsonld/converter.ts -> n3']);
  });

  it('reads every TypeScript extension, not only .ts', () => {
    // `'writer.mts'.endsWith('.ts')` is false, and a file the walk never opens
    // is a file the report calls clean. Nothing under `src/` uses these today,
    // which is exactly why the check must not be the reason anyone finds out —
    // it would say "no third-party import" rather than "I did not look".
    const root = scratchSrc({
      'a.mts': "import { Parser } from 'n3';\n",
      'b.cts': "import { Parser } from 'n3';\n",
      'c.tsx': "import { Parser } from 'n3';\nexport const El = () => <div />;\n",
    });

    expect(thirdPartyImports(root)).toEqual([
      'a.mts -> n3',
      'b.cts -> n3',
      'c.tsx -> n3',
    ]);
  });

  it('names a require() call', () => {
    // A `.cts` file is CommonJS and requires directly; an ESM `.ts` file gets
    // there through `createRequire`. Either way a package is loaded at runtime
    // without an import statement anywhere in the file.
    const root = scratchSrc({
      'a.cts': "const { Parser } = require('n3');\nmodule.exports = Parser;\n",
      'b.ts':
        "import { createRequire } from 'node:module';\n" +
        "const require = createRequire(import.meta.url);\n" +
        "export const cf = require('clownface');\n",
    });

    expect(thirdPartyImports(root)).toEqual(['a.cts -> n3', 'b.ts -> clownface']);
  });

  it('names a dynamic import written as a template literal', () => {
    const root = scratchSrc({
      'a.ts': 'export const n3 = await import(`n3`);\n',
    });

    expect(thirdPartyImports(root)).toEqual(['a.ts -> n3']);
  });

  it('is silent for an absolute path', () => {
    // A path is a path whether or not it starts at the root. Nothing under
    // `src/` writes one, and a resolver never consults `node_modules` for it.
    const root = scratchSrc({
      'a.ts': "import { x } from '/opt/generated/x.js';\nexport const y = x;\n",
    });

    expect(thirdPartyImports(root)).toEqual([]);
  });

  it('names a subpath import', () => {
    // `#internal/thing` resolves through package.json's `imports` field, and
    // that field is allowed to map a subpath onto a PACKAGE — which is the
    // whole reason the form exists. So the specifier alone cannot say whether
    // anything is installed, and the guard reports rather than assumes. This
    // package declares no `imports`, so nothing can write one today without
    // adding the field in the same change.
    const root = scratchSrc({
      'a.ts': "import { parse } from '#internal/parser';\nexport const p = parse;\n",
    });

    expect(thirdPartyImports(root)).toEqual(['a.ts -> #internal/parser']);
  });

  it('names an unprefixed builtin', () => {
    // `crypto` without the `node:` prefix is not obviously a builtin: an npm
    // package by that name exists, and the specifier alone cannot say which
    // one a resolver will hand back. `src/` writes the prefix everywhere, so
    // requiring it costs nothing and removes the ambiguity.
    const root = scratchSrc({
      'utils/deterministic-uri.ts': "import { createHash } from 'crypto';\n",
    });

    expect(thirdPartyImports(root)).toEqual(['utils/deterministic-uri.ts -> crypto']);
  });

  it('finds every import in a file, not just the first', () => {
    const root = scratchSrc({
      'serializer/writer.ts':
        "import { Parser } from 'n3';\nimport clownface from 'clownface';\nimport { local } from './local.js';\n",
      'serializer/local.ts': 'export const local = 1;\n',
    });

    expect(thirdPartyImports(root)).toEqual([
      'serializer/writer.ts -> clownface',
      'serializer/writer.ts -> n3',
    ]);
  });

  it('finds no third-party import in src/ but the ones vendored code declares', () => {
    // Compared BOTH WAYS. Not `[]` with the vendored findings filtered out: a
    // filter answers the same whether the list is empty or the walk skipped the
    // directory, and `src/vendor/` is the one place a dependency could arrive
    // without anybody writing a line. A new bare specifier there fails here, and
    // so does one of these disappearing — which is what re-vendoring should do.
    expect(
      thirdPartyImports(srcDir).sort(),
      'a bare specifier in src/ names a package the build resolves. If it is '
      + 'vendored and unavoidable, declare it in VENDOR_BARE_SPECIFIERS with the '
      + 'reason; if it is ours, write the node: prefix or the relative path.',
    ).toEqual([...VENDOR_BARE_SPECIFIERS].sort());
  });
});
