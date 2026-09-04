/**
 * `withFindings` (`scripts/lib/diagnostics.mjs`) is the one write cycle every
 * generator's findings go through: delete the previous file first, collect,
 * write at the end.
 *
 * THE DELETE-AT-START IS THE THING UNDER TEST. A file written only at the end
 * trivially does not exist after a crash — what would survive is the PREVIOUS
 * run's file, which the collector then merges as though it were this run's.
 * Stale findings are the failure a diagnostics build is least able to notice
 * about itself, because they look exactly like current ones.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, afterEach } from 'vitest';

// @ts-expect-error -- a build script, deliberately plain JavaScript and untyped.
import { withFindings } from '../../scripts/lib/diagnostics.mjs';

import type { Finding } from './scratch.js';

/** The real `jayostis/spec#48` shape: a context "term" that is a section header. */
const seeded = {
  code: 'term-value-not-iri',
  severity: 'info',
  subject: 'cascade:__comment_core',
  owner: 'spec',
  location: ['contexts/v1/cascade.jsonld'],
};

let dirs: string[] = [];

const scratch = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'findings-'));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs = [];
});

const written = (dir: string): Finding[] =>
  JSON.parse(readFileSync(join(dir, 'build-terms.json'), 'utf-8')) as Finding[];

describe('withFindings', () => {
  it('gives the same seeded finding the same id across two separate runs', () => {
    const first = scratch();
    const second = scratch();

    for (const dir of [first, second]) {
      withFindings({ source: 'build-terms', dir }, (findings: { record(f: object): void }) => {
        findings.record(seeded);
      });
    }

    expect(existsSync(join(first, 'build-terms.json'))).toBe(true);
    expect(existsSync(join(second, 'build-terms.json'))).toBe(true);

    const [a] = written(first);
    const [b] = written(second);

    expect(a.id).toBe(b.id);
    // Written out by hand, not read back: the subject itself contains `:`,
    // which is what makes this the id a split-on-`:` reader gets wrong.
    expect(a.id).toBe('term-value-not-iri:cascade:__comment_core');
    expect(a.source).toBe('build-terms');
  });

  it('leaves neither the previous file nor a new one when the run crashes after recording', () => {
    const dir = scratch();
    const file = join(dir, 'build-terms.json');

    writeFileSync(file, JSON.stringify([{ ...seeded, id: 'stale', source: 'build-terms' }]), 'utf-8');

    expect(() => withFindings({ source: 'build-terms', dir }, (findings: { record(f: object): void }) => {
      findings.record(seeded);
      throw new Error('fixture crash');
    })).toThrow('fixture crash');

    expect(existsSync(file), 'a findings file survived the crash').toBe(false);
  });
});
