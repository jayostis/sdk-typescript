/**
 * `scripts/collect-diagnostics.mjs` merges the per-generator findings files
 * into one `diagnostics.json`, and refuses a set it cannot vouch for.
 *
 * REFUSES, NEVER SKIPS. A missing per-generator file is not an empty one — a
 * generator that crashed before writing looks, from here, exactly like one
 * that found nothing — and a merged file that quietly carried on would be the
 * stale-findings failure `openFindings` deletes-at-start to prevent, arriving
 * by another door. So every malformed input exits non-zero naming its reason.
 *
 * THE ID CHECK IS AN EQUALITY, and the well-formed fixture is what forces it.
 * `term-value-not-iri:cascade:__comment_core` is a real id whose SUBJECT
 * contains `:`; a checker that split the id on `:` and compared parts would
 * refuse it, and a merged set that rejected a genuine finding for its spelling
 * is a worklist with a hole in it.
 *
 * FIXTURE DIRECTORIES, NEVER THE REAL `src/spec/diagnostics/`: the real one is
 * written by `pretest` in the same run, and a collector pointed at it from a
 * worker would be judging a directory another process is still filling.
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, afterEach } from 'vitest';

import type { Finding } from './scratch.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const COLLECTOR = join(repoRoot, 'scripts/collect-diagnostics.mjs');
const FIXTURES = join(here, 'fixtures/collector');

interface Merged {
  readonly commit: string | null;
  readonly findings: readonly Finding[];
}

let scratch: string[] = [];

const outFile = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'collector-'));
  scratch.push(dir);
  return join(dir, 'diagnostics.json');
};

afterEach(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
  scratch = [];
});

function collect(findingsDir: string, out: string) {
  return spawnSync(process.execPath, [COLLECTOR, findingsDir, out], { cwd: repoRoot, encoding: 'utf-8' });
}

describe('collect-diagnostics', () => {
  describe('refuses, naming the reason, and writes nothing', () => {
    it.each([
      ['missing-file', /build-terms/],
      // Interrupted mid-write: the refusal has to name the file and the
      // generator, not just echo JSON.parse.
      ['truncated', /build-terms\.json.*not valid JSON/],
      ['repeated-id', /unclassifiable-range:https:\/\/ns\.cascadeprotocol\.org\/health\/v1#HRVReading/],
      ['id-mismatch', /unclassifiable-range:HRVReading/],
      ['owner-none', /none/],
      ['source-mismatch', /build-record-types/],
    ])('%s', (fixture, reason) => {
      const out = outFile();
      const result = collect(join(FIXTURES, fixture), out);

      expect(result.status, `exited 0 on ${fixture}:\n${result.stdout}`).not.toBe(0);
      expect(result.stderr).toMatch(reason);
      expect(existsSync(out), 'wrote a merged file for a set it refused').toBe(false);
    });
  });

  describe('a well-formed set', () => {
    it('merges every file, sorted by id, carrying the provenance commit', () => {
      const out = outFile();
      const result = collect(join(FIXTURES, 'well-formed'), out);

      expect(result.status, result.stderr).toBe(0);
      expect(existsSync(out), `no merged file at ${out}`).toBe(true);

      const merged = JSON.parse(readFileSync(out, 'utf-8')) as Merged;

      // The order is written out, not sorted here: `build-spec-data.json` is
      // `[]` and contributes nothing, and the three sources interleave.
      expect(merged.findings.map((finding) => finding.id)).toEqual([
        'record-class-name-collision:SocialHistoryRecord',
        'term-cross-context-conflict:notes',
        'term-value-not-iri:cascade:__comment_core',
        'unclassifiable-range:https://ns.cascadeprotocol.org/health/v1#HRVReading',
      ]);
      expect(merged.commit).toBe('0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c');
    });

    it('carries the per-code detail a row came with', () => {
      const out = outFile();
      collect(join(FIXTURES, 'well-formed'), out);

      expect(existsSync(out), `no merged file at ${out}`).toBe(true);

      const merged = JSON.parse(readFileSync(out, 'utf-8')) as Merged;
      const conflict = merged.findings.find((finding) => finding.subject === 'notes');

      expect(conflict?.predicates).toEqual([
        'https://ns.cascadeprotocol.org/clinical/v1#notes',
        'https://ns.cascadeprotocol.org/health/v1#notes',
      ]);
    });

    it('records a null commit when the set carries no PROVENANCE.json', () => {
      // The same three files, copied without their provenance: a checkout with
      // no `.git` builds artifacts too, and they must not claim a commit.
      const findingsDir = mkdtempSync(join(tmpdir(), 'collector-no-provenance-'));
      scratch.push(findingsDir);

      for (const file of ['build-spec-data.json', 'build-record-types.json', 'build-terms.json']) {
        copyFileSync(join(FIXTURES, 'well-formed', file), join(findingsDir, file));
      }

      const out = outFile();
      const result = collect(findingsDir, out);

      expect(result.status, result.stderr).toBe(0);
      expect(existsSync(out), `no merged file at ${out}`).toBe(true);
      expect((JSON.parse(readFileSync(out, 'utf-8')) as Merged).commit).toBeNull();
    });
  });
});
