/**
 * `renderMarkdown` (`scripts/lib/diagnostics.mjs`) is the rendering a person
 * picks up and works: the merged JSON, grouped by who owns the fix.
 *
 * OWNER BEFORE SEVERITY, because the reader is one party. Someone working the
 * spec rows wants every spec row in one place regardless of how loud each is;
 * grouping by severity first would scatter one owner's work across three
 * sections and put an `sdk` error above a `spec` info, which is the wrong
 * question answered first.
 *
 * EVERY ROW CARRIES ITS CODE AND A LINK TO THE ANSWER KEY. A row that says only
 * what was found leaves the reader to work out what to do about it; the code
 * is the key into `docs/spec-diagnostics.md`, where that is written once.
 *
 * Fixture JSON throughout, never the real one: the real file's contents are
 * whatever the pinned spec happens to say, and a test that counted them would
 * be asserting the spec rather than the renderer.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

// @ts-expect-error -- a build script, deliberately plain JavaScript and untyped.
import { renderMarkdown } from '../../scripts/lib/diagnostics.mjs';

import type { Finding } from './scratch.js';

const here = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = join(here, 'fixtures/render/template.md');

const HRV = 'https://ns.cascadeprotocol.org/health/v1#HRVReading';
const GHOST = 'https://ns.cascadeprotocol.org/core/v1#ghost';
const ORPHAN = 'https://ns.cascadeprotocol.org/core/v1#orphan';

/** One finding, with every field a row needs and the overrides given. */
function finding(over: Partial<Finding> & { code: string; subject: string }): Finding {
  return {
    id: `${over.code}:${over.subject}`,
    severity: 'info',
    owner: 'spec',
    location: ['ontologies/core/v1/core.ttl'],
    source: 'build-terms',
    ...over,
  };
}

const render = (findings: Finding[]): string =>
  renderMarkdown({ commit: null, findings }, TEMPLATE) as string;

const lines = (markdown: string): string[] => markdown.split(/\r?\n/);

/** The index of the first markdown heading whose text starts with `text`. */
function headingIndex(markdown: string, text: string): number {
  return lines(markdown).findIndex((line) => new RegExp(`^#{1,6}\\s+${text}\\b`).test(line));
}

describe('renderMarkdown', () => {
  it('renders every row with each of its location paths', () => {
    const markdown = render([
      finding({
        code: 'property-no-range',
        subject: ORPHAN,
        location: ['ontologies/core/v1/core.ttl', 'contexts/v1/core.jsonld'],
      }),
    ]);

    expect(markdown).toContain(ORPHAN);
    expect(markdown).toContain('ontologies/core/v1/core.ttl');
    expect(markdown).toContain('contexts/v1/core.jsonld');
  });

  it('groups by owner before severity', () => {
    const markdown = render([
      finding({ code: 'declared-predicate-not-in-ontology', subject: GHOST, severity: 'error', owner: 'sdk' }),
      finding({ code: 'unclassifiable-range', subject: HRV, severity: 'info', owner: 'spec' }),
    ]);

    const spec = headingIndex(markdown, 'spec');
    const sdk = headingIndex(markdown, 'sdk');

    expect(spec, 'no heading for the spec owner').toBeGreaterThanOrEqual(0);
    expect(sdk, 'no heading for the sdk owner').toBeGreaterThanOrEqual(0);
    // The error is the sdk's and the info is spec's: severity-first would put
    // the sdk heading first.
    expect(spec).toBeLessThan(sdk);

    const specRow = lines(markdown).findIndex((line) => line.includes(HRV));

    expect(specRow).toBeGreaterThan(spec);
    expect(specRow).toBeLessThan(sdk);
  });

  it('carries the code in the row and in a section heading that links the answer key', () => {
    const markdown = render([finding({ code: 'unclassifiable-range', subject: HRV })]);

    const row = lines(markdown).find((line) => line.includes(HRV) && !/^#/.test(line));

    expect(row, 'no row names the subject').toBeDefined();
    expect(row).toContain('unclassifiable-range');

    const heading = lines(markdown)
      .find((line) => /^#{1,6}\s/.test(line) && line.includes('unclassifiable-range'));

    expect(heading, 'no section heading carries the code').toBeDefined();
    expect(heading).toMatch(/docs\/spec-diagnostics\.md#unclassifiable-range/);
  });

  it('reads its markdown from the template file rather than an inlined string', () => {
    const markdown = render([finding({ code: 'unclassifiable-range', subject: HRV })]);

    expect(markdown).toContain('FIXTURE-TEMPLATE-MARKER-7f3a');
  });
});
