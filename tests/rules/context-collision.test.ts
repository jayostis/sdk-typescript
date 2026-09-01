/**
 * What a JSON-LD context term means, where the same spelling means two things.
 *
 * `NESTED_CHILD_PREDICATES` is generated from the terms now, so it no longer
 * contains only keys nothing else claims: twenty of its twenty-one children are
 * ALSO registered top-level fields, and `getContext`'s loop overwrites every
 * one of them. Twenty agree and the overwrite is invisible. `notes` does not.
 *
 * THIS FILE PINS FACTS, NOT A FIX. The comment beside that loop said "No such
 * collision exists today", and by the time it was read that was false — which
 * is the failure a comment has and a test does not. Two of the assertions below
 * describe a DEFECT that is still open (`notes` inside a nested node expands to
 * `health:notes` where the Turtle writes `cascade:notes`) and are written to go
 * red when it is closed, saying so.
 *
 * The defect is not closed here because a flat context term has exactly one
 * meaning and this key has two — no ordering of the two loops produces a
 * correct answer for both occurrences. Closing it means changing the document
 * `toJsonLd` emits: a local `@context` on the nested node object, or JSON-LD
 * 1.1 term scoping. That is a decision about public output.
 *
 * @see src/jsonld/context.ts  the loop, and why it falls the way it does
 */

import { describe, it, expect } from 'vitest';

import { getContext } from '../../src/jsonld/context.js';
import { toJsonLd } from '../../src/jsonld/converter.js';
import { serialize } from '../../src/serializer/turtle-serializer.js';
import { childPredicates } from '../../src/terms/index.js';
import { PROPERTY_PREDICATES } from '../../src/vocabularies/namespaces.js';

/** Child keys that are also registered top-level fields, and whether they agree. */
function collisions(): { agreeing: string[]; disagreeing: string[] } {
  const agreeing: string[] = [];
  const disagreeing: string[] = [];
  for (const [key, nested] of Object.entries(childPredicates())) {
    const flat = PROPERTY_PREDICATES[key];
    if (!flat) continue;
    (flat === nested ? agreeing : disagreeing).push(key);
  }
  return { agreeing, disagreeing };
}

const manifest = {
  id: 'urn:uuid:collision-0001',
  type: 'ExportManifest',
  title: 'Export',
  created: '2026-08-29T00:00:00Z',
  schemaVersion: '1.3',
  clinicalSummary: { domain: 'clinical', notes: 'quarterly export' },
} as never;

describe('the child keys that collide with a registered field', () => {
  it('is most of them, and all but one agree', () => {
    const { agreeing, disagreeing } = collisions();

    expect(agreeing.length).toBeGreaterThan(1);
    expect(disagreeing).toEqual(['notes']);
  });

  it('resolves an agreeing collision to the predicate both sides name', () => {
    // `sourceRecordId` is declared `health:sourceRecordId` as a child AND
    // registered as `health:sourceRecordId` at top level, so the overwrite is
    // a no-op and the context is right for both occurrences.
    const context = (getContext() as { '@context': Record<string, unknown> })['@context'];

    expect(context['sourceRecordId']).toBe('health:sourceRecordId');
    expect(childPredicates()['sourceRecordId']).toBe('health:sourceRecordId');
  });
});

describe('notes, the collision the two sides disagree about', () => {
  it('resolves the flat term to the spelling a top-level notes carries', () => {
    // A health record's `notes` IS `health:notes`, and the top level is what a
    // flat term can be right about. This half is not the defect; it is the
    // reason the defect cannot be fixed by flipping the loop.
    const context = (getContext() as { '@context': Record<string, unknown> })['@context'];

    expect(context['notes']).toBe('health:notes');
    expect(childPredicates()['notes']).toBe('cascade:notes');
  });

  it('writes the nested notes as cascade:notes in Turtle', () => {
    // Correct, and per spec: `cascade:RecordSummaryShape` declares the path.
    expect(serialize(manifest)).toContain('cascade:notes "quarterly export"');
  });

  it('OPEN DEFECT: the JSON-LD expands the same value to health:notes', () => {
    // `toJsonLd` passes the nested object through unchanged, so the child is
    // read through the flat term and the document says a different property
    // than the Turtle for one value of one record. Nothing reports it.
    //
    // WHEN THIS GOES RED, the defect is fixed and the assertion is the thing to
    // delete: replace it with one that reads the corrected expansion, whatever
    // form the fix gives it.
    const doc = toJsonLd(manifest) as Record<string, unknown>;
    const summary = doc['clinicalSummary'] as Record<string, unknown>;

    expect(summary['notes']).toBe('quarterly export');
    expect(summary).not.toHaveProperty('@context');
    expect(summary).not.toHaveProperty('cascade:notes');
  });
});
