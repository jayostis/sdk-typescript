/**
 * `docs/spec-diagnostics.md` is the answer key: one `### \`<code>\`` section
 * per code the findings helper can emit, saying what the finding means and
 * what to do about it.
 *
 * COMPARED BOTH WAYS. A code with no entry is a row the reader cannot act on;
 * an entry for no code is documentation of something the build never says,
 * which is how an answer key drifts into fiction. `answerKeyDrift` names each
 * side's leftovers, and the fixture cases prove it names them rather than
 * counting them.
 *
 * THE TWELVE CODES ARE WRITTEN OUT. Without that, an empty code list against
 * an empty document agrees perfectly, and the both-ways check is satisfied by
 * a build that diagnoses nothing.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

// @ts-expect-error -- a build script, deliberately plain JavaScript and untyped.
import { DIAGNOSTIC_CODES, answerKeyDrift } from '../../scripts/lib/diagnostics.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ANSWER_KEY = join(repoRoot, 'docs/spec-diagnostics.md');

const CODES = [
  'declared-predicate-not-in-ontology',
  'deprecated-class-unresolved-successor',
  'normative-language-in-comment',
  'property-no-range',
  'range-has-unrecognized-typed-members',
  'record-class-name-collision',
  'record-class-no-published-name',
  'target-class-not-in-ontology',
  'term-cross-context-conflict',
  'term-no-type-info',
  'term-value-not-iri',
  'unclassifiable-range',
];

const FIXTURE_KEY = `# Answer key (fixture)

### \`unclassifiable-range\`

What it means.

### \`term-no-type-info\`

What it means.
`;

describe('the answer key', () => {
  it('declares exactly the twelve codes', () => {
    expect([...(DIAGNOSTIC_CODES as readonly string[])].sort()).toEqual(CODES);
  });

  it('documents every declared code, and documents nothing else', () => {
    expect(existsSync(ANSWER_KEY), `no answer key at ${ANSWER_KEY}`).toBe(true);

    expect(answerKeyDrift(DIAGNOSTIC_CODES, readFileSync(ANSWER_KEY, 'utf-8')))
      .toEqual({ undocumented: [], unknown: [] });
  });

  it('names a code with no entry', () => {
    expect(answerKeyDrift(['unclassifiable-range', 'term-no-type-info', 'fixture-only-code'], FIXTURE_KEY))
      .toEqual({ undocumented: ['fixture-only-code'], unknown: [] });
  });

  it('names an entry with no code', () => {
    expect(answerKeyDrift(['unclassifiable-range'], FIXTURE_KEY))
      .toEqual({ undocumented: [], unknown: ['term-no-type-info'] });
  });
});
