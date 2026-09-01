/**
 * The three checks in `./registry.ts`, each proven against input this file
 * builds before it is pointed at the real `src/terms/`.
 *
 * That order is the point. A detector aimed only at a place where it should
 * stay silent has demonstrated nothing — it would pass identically if it were
 * broken.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { unbarrelled } from './registry.js';

const TERMS_DIR = fileURLToPath(new URL('../../src/terms/definitions/', import.meta.url));
const BARREL = join(TERMS_DIR, 'index.ts');

describe('unbarrelled', () => {
  // A term file the barrel does not list is dead code that still compiles and
  // still typechecks: `termFor` never returns it, so the field it describes
  // goes on taking the serializer's default branch as though the term were
  // never written.

  const scratch: string[] = [];

  afterAll(() => {
    for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
  });

  function scratchTermsDir(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), 'cascade-terms-'));
    scratch.push(dir);
    mkdirSync(dir, { recursive: true });
    for (const [name, body] of Object.entries(files)) {
      writeFileSync(join(dir, name), body, 'utf8');
    }
    return dir;
  }

  it('names the term file a barrel left out', () => {
    const dir = scratchTermsDir({
      'snomed-code.ts': 'export const snomedCode = {};\n',
      'interpretation.ts': 'export const interpretation = {};\n',
    });

    expect(unbarrelled(dir, "export * from './snomed-code.js';\n")).toEqual([
      'interpretation.ts',
    ]);
  });

  it('stays silent when the barrel lists every term file', () => {
    const dir = scratchTermsDir({
      'snomed-code.ts': 'export const snomedCode = {};\n',
      'interpretation.ts': 'export const interpretation = {};\n',
    });
    const barrel = "export * from './snomed-code.js';\nexport * from './interpretation.js';\n";

    expect(unbarrelled(dir, barrel)).toEqual([]);
  });

  it('finds nothing missing from the barrel we actually ship', () => {
    expect(unbarrelled(TERMS_DIR, readFileSync(BARREL, 'utf8'))).toEqual([]);
  });
});
