/**
 * `readPredicatesModule` (`scripts/lib/predicates-module.mjs`) reads every
 * entry of `PROPERTY_PREDICATES` or refuses, naming the lines it could not read.
 *
 * A DROPPED ENTRY IS A CLEAN REPORT ON THE THING BEING CHECKED. The reader is a
 * text scan for one line shape, `key: 'value',`, and an entry written any other
 * way — double quotes, a template literal, a quoted key with a colon in it —
 * matched nothing and was silently absent from the table handed to
 * `declared-predicate-not-in-ontology`. Nothing in the repository holds the
 * file to one quoting style, so the hand-added registration that check exists
 * to catch is exactly the one most likely to be written differently, and the
 * check would report clean on it. Refusing the whole file is the honest
 * answer: the scan does not know what it skipped.
 *
 * @module tests/scripts
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, afterEach } from 'vitest';

// @ts-expect-error -- a build script, deliberately plain JavaScript and untyped.
import { readPredicatesModule } from '../../scripts/lib/predicates-module.mjs';

let workdir: string | undefined;

afterEach(() => {
  if (workdir) rmSync(workdir, { recursive: true, force: true });
  workdir = undefined;
});

/** A stand-in for `namespaces.ts` with the body given inside `PROPERTY_PREDICATES`. */
function moduleWith(predicatesBody: string): string {
  workdir = mkdtempSync(join(tmpdir(), 'predicates-module-'));
  const file = join(workdir, 'namespaces.ts');
  writeFileSync(file, `export const NAMESPACES = {
  cascade: 'https://ns.cascadeprotocol.org/core/v1#',
} as const;

export const PROPERTY_PREDICATES: Record<string, string> = {
${predicatesBody}
};
`, 'utf-8');
  return file;
}

describe('readPredicatesModule', () => {
  it('reads every single-quoted entry, past comments and blank lines', () => {
    const file = moduleWith(`  /** The record's identity. */
  recordId: 'cascade:recordId',

  // A trailing comment is part of the entry line.
  status: 'cascade:status', // still one entry
`);

    expect(readPredicatesModule(file).predicates).toEqual({
      recordId: 'cascade:recordId',
      status: 'cascade:status',
    });
  });

  it('refuses an entry it cannot read rather than dropping it, naming the line', () => {
    const file = moduleWith(`  recordId: 'cascade:recordId',
  fhirResourceType: "cascade:fhirResourceType",
  status: 'cascade:status',
`);

    expect(() => readPredicatesModule(file)).toThrow(/fhirResourceType: "cascade:fhirResourceType"/);
  });

  it('refuses a template-literal value the same way', () => {
    const file = moduleWith('  recordId: \'cascade:recordId\',\n  status: `cascade:status`,\n');

    expect(() => readPredicatesModule(file)).toThrow(/PROPERTY_PREDICATES/);
  });
});
