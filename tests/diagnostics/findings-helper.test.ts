/**
 * `openFindings` (`scripts/lib/diagnostics.mjs`) is the write cycle every
 * generator's findings go through: delete the previous file at open, collect
 * through `record()`, write at `close()`. The three generators call exactly
 * this pair, so this is the path the real build takes.
 *
 * THE DELETE-AT-OPEN IS THE THING UNDER TEST. A file written only at the end
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
import { openFindings } from '../../scripts/lib/diagnostics.mjs';

import type { Finding } from './scratch.js';

interface Findings {
  record(finding: object): Finding;
  close(): number;
}

const open = (dir: string): Findings => openFindings({ source: 'build-terms', dir }) as Findings;

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

describe('openFindings', () => {
  it('gives the same seeded finding the same id across two separate runs', () => {
    const first = scratch();
    const second = scratch();

    for (const dir of [first, second]) {
      const findings = open(dir);
      findings.record(seeded);
      findings.close();
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

  it('leaves neither the previous file nor a new one when the run never reaches close()', () => {
    const dir = scratch();
    const file = join(dir, 'build-terms.json');

    writeFileSync(file, JSON.stringify([{ ...seeded, id: 'stale', source: 'build-terms' }]), 'utf-8');

    const findings = open(dir);
    expect(existsSync(file), 'the previous file survived open()').toBe(false);

    findings.record(seeded);
    // No close(): the generator crashed after recording.

    expect(existsSync(file), 'a findings file exists before close()').toBe(false);
  });
});
