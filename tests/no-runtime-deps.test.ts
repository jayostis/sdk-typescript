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

import { thirdPartyImports } from './no-runtime-deps.js';

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
    // `src/utils/deterministic-uri.ts` imports `node:crypto`, and a builtin
    // ships with the runtime: it costs a consumer no install and appears in no
    // dependency list. It is a different question from whether this package
    // should run outside Node, which nothing here asks.
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
    });

    expect(thirdPartyImports(root)).toEqual([
      'a.ts -> n3',
      'b.ts -> clownface',
      'c.ts -> @zazuko/env',
      'd.ts -> rdf-validate-shacl',
    ]);
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

  it('finds no third-party import in src/', () => {
    expect(thirdPartyImports(srcDir)).toEqual([]);
  });
});
