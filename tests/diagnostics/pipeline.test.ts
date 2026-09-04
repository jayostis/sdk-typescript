/**
 * `npm run generate` leaves a merged `diagnostics.json` behind, and still
 * exits 0 with findings in it.
 *
 * THE WHOLE PIPELINE, END TO END: a spec checkout in, the three generators and
 * the collector as `package.json` actually chains them, one file out. The
 * detector tests each drive one generator at one fixture; this is the one
 * place that says a finding a generator recorded is a row a person can read
 * at the end, with every field the worklist needs on it.
 *
 * NOT A GATE, and asserted as such. Every detector reports a spec defect the
 * build has to keep running through — the pinned spec has several, and CI
 * builds from the pin — so a diagnostics build that failed on its own findings
 * would break every build until upstream caught up. That boundary is the
 * easiest thing to get wrong when wiring a collector into `generate`, which is
 * why the real spec is run here and required to exit 0 with a non-empty file.
 *
 * Into a scratch data directory, never the tree: `pretest` has already built
 * `src/spec/`, and a second generate racing the workers that read it would
 * delete their input under them.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect, afterAll } from 'vitest';

import {
  OWNERS, SEVERITIES, cleanupScratch, context, repoRoot, scratchCheckout, scratchDir, type Finding,
} from './scratch.js';

interface Merged {
  readonly commit: string | null;
  readonly findings: readonly Finding[];
}

/** `npm run generate`, as package.json chains it, with the environment given. */
function generate(env: Record<string, string>) {
  return spawnSync('npm run generate', {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: 'utf-8',
    shell: true,
  });
}

function merged(data: string): Merged {
  const file = join(data, 'diagnostics.json');

  expect(existsSync(file), `generate wrote no ${file}`).toBe(true);

  return JSON.parse(readFileSync(file, 'utf-8')) as Merged;
}

afterAll(cleanupScratch);

describe('the diagnostics build', () => {
  it('carries a seeded finding from the generator that found it into the merged file', () => {
    // The real `jayostis/spec#48` shape: a section header written as a term.
    const checkout = scratchCheckout({
      contexts: {
        cascade: context({
          __comment_core: '=== Core Vocabulary (cascade:) ===',
          Widget: 'cascade:Widget',
        }),
      },
    });
    const data = scratchDir();

    const result = generate({ CASCADE_SPEC_DIR: checkout, CASCADE_SPEC_DATA_DIR: data });

    expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0);

    const row = merged(data).findings.find((finding) => finding.id === 'term-value-not-iri:cascade:__comment_core');

    expect(row, 'the seeded finding has no row').toBeDefined();
    expect(row?.code).toBe('term-value-not-iri');
    expect(row?.subject).toBe('cascade:__comment_core');
    expect(SEVERITIES).toContain(row?.severity);
    expect(OWNERS).toContain(row?.owner);
    expect(row?.location.length).toBeGreaterThan(0);
    expect(row?.location.every((path) => typeof path === 'string' && path.length > 0)).toBe(true);
    expect(row?.source).toBe('build-terms');
  }, 120_000);

  it('still exits 0 against the pinned spec, with findings to report', () => {
    const data = scratchDir();

    const result = generate({ CASCADE_SPEC_DATA_DIR: data });

    expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0);
    expect(merged(data).findings.length).toBeGreaterThan(0);
  }, 120_000);
});
