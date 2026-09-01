/**
 * `src/terms/index.ts` is the only way into the folder.
 *
 * Not a style rule. `src/terms/` is being split into files by concern —
 * predicates, children, rules, the two output formats — and every one of those
 * is an internal detail only for as long as nothing outside imports it
 * directly. The moment a second module reaches past the barrel, moving a
 * function between two files inside the folder becomes a breaking change to
 * something that never meant to depend on where it lived.
 *
 * The detector is handed sources where it MUST speak before it is pointed at
 * ours — `tests/README.md`, "A detector is proven by making it speak."
 */

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import { reachesPastTheBarrel } from './front-door.js';

const srcDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../src');

/** A scratch `src/` whose files say what the test needs them to say. */
function scratchSrc(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'front-door-'));
  for (const [path, source] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), source, 'utf-8');
  }
  return root;
}

describe('reachesPastTheBarrel', () => {
  it('names a file that imports a term module directly', () => {
    const root = scratchSrc({
      'serializer/writer.ts': "import { ruleFor } from '../terms/term.js';\n",
      'terms/term.ts': 'export const x = 1;\n',
    });

    expect(reachesPastTheBarrel(root)).toEqual(['serializer/writer.ts -> ../terms/term.js']);
  });

  it('is silent for an import of the barrel', () => {
    const root = scratchSrc({
      'serializer/writer.ts': "import { ruleFor } from '../terms/index.js';\n",
      'terms/index.ts': 'export const x = 1;\n',
    });

    expect(reachesPastTheBarrel(root)).toEqual([]);
  });

  it('lets the folder import itself', () => {
    // The whole point of splitting `src/terms/` up. A rule about who may import
    // what has to stop at the folder boundary, or the split it exists to
    // protect could never happen.
    const root = scratchSrc({
      'terms/term.ts': "import { childPredicateFor } from './children.js';\n",
      'terms/children.ts': 'export const x = 1;\n',
    });

    expect(reachesPastTheBarrel(root)).toEqual([]);
  });

  it('reads an import, not a mention', () => {
    // `src/validator/index.ts` carries a comment about deep imports into
    // `src/terms/`. Prose is not a dependency, and a check that counted it
    // would push people to stop explaining themselves.
    const root = scratchSrc({
      'validator/index.ts': '// no deep import may reach terms/term.js\nexport const x = 1;\n',
      'terms/index.ts': 'export const x = 1;\n',
    });

    expect(reachesPastTheBarrel(root)).toEqual([]);
  });

  it('finds every reach, not just the first', () => {
    const root = scratchSrc({
      'a.ts': "import { x } from './terms/term.js';\n",
      'b.ts': "export type { Output } from './terms/types.js';\n",
      'terms/index.ts': 'export const x = 1;\n',
    });

    expect(reachesPastTheBarrel(root)).toEqual([
      'a.ts -> ./terms/term.js',
      'b.ts -> ./terms/types.js',
    ]);
  });

  it('finds nothing reaching past the barrel in src/', () => {
    expect(reachesPastTheBarrel(srcDir)).toEqual([]);
  });
});
