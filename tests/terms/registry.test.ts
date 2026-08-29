/**
 * The registry invariants: a term cannot invent vocabulary, no two terms claim
 * the same key, and no term file is left out of the barrel.
 *
 * The three checks live in `./registry.ts` as functions over inputs this file
 * supplies. That is deliberate. Pointing a detector only at a directory where
 * it should stay silent proves nothing about the detector, so each one is first
 * handed input where it MUST speak, and only then pointed at us.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineTerm, predicateOf } from '../../src/terms/term.js';
import { termFor, TERMS } from '../../src/terms/index.js';
import { PROPERTY_PREDICATES } from '../../src/vocabularies/namespaces.js';
import { unbarrelled, duplicateKeys, unregisteredKeys } from './registry.js';

const TERMS_DIR = fileURLToPath(new URL('../../src/terms/', import.meta.url));
const BARREL = join(TERMS_DIR, 'index.ts');

describe('a term naming an unregistered field throws when the module loads', () => {
  it('rejects a key that PROPERTY_PREDICATES does not know', () => {
    expect(() => predicateOf('notAThing')).toThrow(/PROPERTY_PREDICATES/);
  });

  it('resolves a registered key to its predicate', () => {
    expect(predicateOf('snomedCode')).toBe('health:snomedCode');
  });

  it('takes the whole term declaration down with it', () => {
    // A runtime assertion, not a `@ts-expect-error`: nothing narrows the type
    // of `key` yet, so a type-level assertion would sit unused and prove
    // nothing. From the moment the serializer imports `termFor`, a bad key
    // throws as soon as anything imports the package.
    expect(() =>
      defineTerm({
        key: 'notAThing',
        predicate: predicateOf('notAThing'),
        rule: { form: 'literal' },
      }),
    ).toThrow();
  });
});

describe('a key no module claims is not an error', () => {
  it('returns undefined from termFor, leaving the type-driven defaults to run', () => {
    expect(termFor('resultUnit')).toBeUndefined();
  });
});

describe('no two terms claim the same key', () => {
  it('names the key a synthetic pair of terms both claim', () => {
    const terms = [
      { key: 'snomedCode' },
      { key: 'interpretation' },
      { key: 'snomedCode' },
    ];

    expect(duplicateKeys(terms)).toEqual(['snomedCode']);
  });

  it('stays silent on a list with no duplicate', () => {
    expect(duplicateKeys([{ key: 'snomedCode' }, { key: 'interpretation' }])).toEqual([]);
  });

  it('finds no duplicate among the terms we actually ship', () => {
    expect(duplicateKeys(TERMS)).toEqual([]);
  });
});

describe("every term's key exists in PROPERTY_PREDICATES", () => {
  it('names a synthetic key the spec does not know', () => {
    const terms = [{ key: 'snomedCode' }, { key: 'notAThing' }];

    expect(unregisteredKeys(terms)).toEqual(['notAThing']);
  });

  it('stays silent on a list of registered keys', () => {
    expect(unregisteredKeys([{ key: 'snomedCode' }, { key: 'sleepQuality' }])).toEqual([]);
  });

  it('finds no unregistered key among the terms we actually ship', () => {
    expect(unregisteredKeys(TERMS)).toEqual([]);
  });
});

describe('both real-half guards read the raw TERMS array', () => {
  // Not `termFor`. Resolving PROPERTY_PREDICATES keys through the registry
  // cannot fail either guard, whatever the registry holds — which would make
  // both of the "terms we actually ship" assertions above permanently vacuous,
  // not merely quiet while TERMS is empty. Each half is shown below.

  it('a Map keyed by term.key hides a duplicate the array reports', () => {
    const claimed = [
      { key: 'snomedCode', predicate: 'health:snomedCode' },
      { key: 'snomedCode', predicate: 'clinical:snomedCode' },
    ];
    const throughMap = [...new Map(claimed.map((term) => [term.key, term])).values()];

    expect(duplicateKeys(throughMap)).toEqual([]);
    expect(duplicateKeys(claimed)).toEqual(['snomedCode']);
  });

  it('enumerating PROPERTY_PREDICATES hides an unregistered key the array reports', () => {
    const claimed = [{ key: 'notAThing', predicate: 'health:snomedCode' }];
    const throughRegisteredKeys = Object.keys(PROPERTY_PREDICATES).flatMap((key) =>
      claimed.filter((term) => term.key === key),
    );

    expect(unregisteredKeys(throughRegisteredKeys)).toEqual([]);
    expect(unregisteredKeys(claimed)).toEqual(['notAThing']);
  });
});

describe('the barrel-completeness check', () => {
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

  it('names the term file the barrel forgot', () => {
    const dir = scratchTermsDir({
      'snomed-code.ts': 'export const snomedCode = {};\n',
      'interpretation.ts': 'export const interpretation = {};\n',
    });
    const barrel = "export * from './snomed-code.js';\n";

    expect(unbarrelled(dir, barrel)).toEqual(['interpretation.ts']);
  });

  it('stays silent when the barrel lists every term file', () => {
    const dir = scratchTermsDir({
      'snomed-code.ts': 'export const snomedCode = {};\n',
      'interpretation.ts': 'export const interpretation = {};\n',
    });
    const barrel = "export * from './snomed-code.js';\nexport * from './interpretation.js';\n";

    expect(unbarrelled(dir, barrel)).toEqual([]);
  });

  it('finds nothing missing from our own barrel', () => {
    // One line, and deliberately NOT the test that proves the function works:
    // it asserts nothing on the day this lands, and starts biting the moment a
    // term file is added that the barrel forgets.
    expect(unbarrelled(TERMS_DIR, readFileSync(BARREL, 'utf8'))).toEqual([]);
  });
});
