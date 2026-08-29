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

import { allTerms } from '../../src/terms/index.js';
import { unbarrelled, duplicateKeys, unregisteredKeys } from './registry.js';

const TERMS_DIR = fileURLToPath(new URL('../../src/terms/', import.meta.url));
const BARREL = join(TERMS_DIR, 'index.ts');

describe('duplicateKeys', () => {
  // Two modules claiming one field makes which of them writes it depend on
  // barrel order, and the loser's rule is silently unreachable.

  it('names the key two term modules both claim', () => {
    const terms = [{ key: 'snomedCode' }, { key: 'interpretation' }, { key: 'snomedCode' }];

    expect(duplicateKeys(terms)).toEqual(['snomedCode']);
  });

  it('stays silent when every term claims a different key', () => {
    expect(duplicateKeys([{ key: 'snomedCode' }, { key: 'interpretation' }])).toEqual([]);
  });

  it('finds no key claimed twice in the registry we actually ship', () => {
    // Asserts nothing today — TERMS is empty — and is the guard rather than the
    // proof, exactly as the `unbarrelled` case below is. The two proofs above
    // are what make it trustworthy the day a term lands: a detector aimed only
    // at silence has demonstrated nothing.
    expect(duplicateKeys(allTerms())).toEqual([]);
  });
});

describe('unregisteredKeys', () => {
  // A term keyed on a field spec does not define writes triples no shape
  // constrains. requirePredicate catches this at declaration; this catches a
  // term that got its predicate some other way.

  it('names a key that PROPERTY_PREDICATES does not define', () => {
    const terms = [{ key: 'snomedCode' }, { key: 'notAThing' }];

    expect(unregisteredKeys(terms)).toEqual(['notAThing']);
  });

  it('stays silent when every key is registered', () => {
    expect(unregisteredKeys([{ key: 'snomedCode' }, { key: 'sleepQuality' }])).toEqual([]);
  });

  it('finds no unregistered key in the registry we actually ship', () => {
    expect(unregisteredKeys(allTerms())).toEqual([]);
  });
});

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
    // Asserts nothing today — src/terms/ holds no term modules yet. It is the
    // guard rather than the proof, and it starts working the day one is added.
    expect(unbarrelled(TERMS_DIR, readFileSync(BARREL, 'utf8'))).toEqual([]);
  });
});
