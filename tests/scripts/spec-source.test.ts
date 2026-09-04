/**
 * `mergedOntologyGraph` (`scripts/lib/spec-source.mjs`) merges array-valued
 * predicates across files rather than letting the later file replace them.
 *
 * `nodes.set(node['@id'], existing ? { ...existing, ...node } : node)` used to
 * be a shallow spread: for a key present in both `existing` and `node` —
 * including an array-valued predicate like `@type` — `node`'s value replaced
 * `existing`'s wholesale instead of concatenating. If the same class `@id` is
 * ever declared across two ontology files, each contributing part of its
 * `@type` array, whichever file is read second would silently win and any
 * marker only present in the first file's array — including
 * `cascade:RecordClass`, which record-type population reads off `@type` — is
 * lost with no error. Unreachable at the pinned spec revision (no `@id`
 * collides across files there), but the merge strategy should not depend on
 * that staying true.
 *
 * @module tests/scripts
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

import { describe, it, expect, afterEach } from 'vitest';

import { mergedOntologyGraph } from '../../scripts/lib/spec-source.mjs';

let workdir: string | undefined;

afterEach(() => {
  if (workdir) rmSync(workdir, { recursive: true, force: true });
  workdir = undefined;
});

/** A scratch ontologies directory with one `.jsonld` file per entry given. */
function scratchOntologies(files: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'spec-source-ontologies-'));
  for (const [name, nodes] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), JSON.stringify(nodes), 'utf-8');
  }
  return dir;
}

describe('mergedOntologyGraph', () => {
  it('merges @type across files instead of letting the second file replace it', () => {
    workdir = scratchOntologies({
      'a.jsonld': [{ '@id': 'clinical:SocialHistoryRecord', '@type': ['owl:Class'] }],
      'b.jsonld': [
        { '@id': 'clinical:SocialHistoryRecord', '@type': ['cascade:RecordClass'] },
      ],
    });

    const nodes = mergedOntologyGraph(workdir);
    const merged = nodes.get('clinical:SocialHistoryRecord');

    expect(merged?.['@type']).toEqual(
      expect.arrayContaining(['owl:Class', 'cascade:RecordClass'])
    );
    expect((merged?.['@type'] as string[]).length).toBe(2);
  });

  it('still lets a later file win a shared scalar key, as before', () => {
    workdir = scratchOntologies({
      'a.jsonld': [{ '@id': 'clinical:X', 'rdfs:label': 'first' }],
      'b.jsonld': [{ '@id': 'clinical:X', 'rdfs:label': 'second' }],
    });

    const nodes = mergedOntologyGraph(workdir);
    expect(nodes.get('clinical:X')?.['rdfs:label']).toBe('second');
  });
});
