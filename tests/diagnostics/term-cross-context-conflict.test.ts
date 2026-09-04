/**
 * `build-terms.mjs` reports every JSON key that resolves to different
 * predicates in different contexts, one row per property key, with the
 * predicates it resolves to.
 *
 * THE SHARPEST VERSION OF THE PROBLEM. The generator has always found these —
 * it is why the term tables are per vocabulary at all — and until now it kept
 * a count and dropped the pairs: a doc comment says "33 JSON keys", a build
 * line says "35 cross-context conflicts", and nothing anywhere says WHICH keys
 * or which predicates. `jayostis/spec#4` is the fix upstream, and it needs the
 * list.
 *
 * ONE ROW PER KEY, NOT PER TRANSITION. `sourceBundleId` is declared in three
 * contexts — A, then B, then A again — which is two transitions in the loop
 * and one contested key with two predicates. Counting transitions is how "34
 * keys" and "35 conflicts" came to disagree.
 *
 * A CLASS TERM IS NOT A CONFLICT HERE. `SocialHistoryRecord` names two classes
 * in two contexts, and that is `record-class-name-collision`'s row already; a
 * second row under this code would be the same gap filed twice.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  contextPrefixes, expandCurie, isPrefixDeclaration, mergedOntologyGraph,
  // @ts-expect-error -- a build script, deliberately plain JavaScript and untyped.
} from '../../scripts/lib/spec-source.mjs';

import {
  CASCADE, CLINICAL, HEALTH, OWL_CLASS, XSD_STRING, cleanupScratch, context, findingsOf, klass,
  ontology, property, repoRoot, rowsFor, runGenerator, scratchData, type Finding,
} from './scratch.js';

const CODE = 'term-cross-context-conflict';

describe(CODE, () => {
  describe('against a fixture', () => {
    let rows: Finding[];

    beforeAll(() => {
      const typed = (curie: string) => ({ '@id': curie, '@type': 'xsd:string' });
      const data = scratchData({
        ontologies: {
          core: [ontology(CASCADE), property(`${CASCADE}sourceBundleId`, { range: XSD_STRING })],
          clinical: [
            ontology(CLINICAL),
            property(`${CLINICAL}sourceBundleId`, { range: XSD_STRING }),
            klass(`${CLINICAL}SocialHistoryRecord`, { record: true }),
          ],
          health: [ontology(HEALTH), klass(`${HEALTH}SocialHistoryRecord`, { record: true })],
        },
        // Read in name order: alpha (A), beta (B), gamma (A again).
        contexts: {
          alpha: context({
            sourceBundleId: typed('cascade:sourceBundleId'),
            a1: typed('cascade:a1'),
            a2: typed('cascade:a2'),
          }),
          beta: context({
            sourceBundleId: typed('clinical:sourceBundleId'),
            SocialHistoryRecord: 'clinical:SocialHistoryRecord',
            b1: typed('clinical:b1'),
          }),
          gamma: context({
            sourceBundleId: typed('cascade:sourceBundleId'),
            SocialHistoryRecord: 'health:SocialHistoryRecord',
            g1: typed('health:g1'),
            g2: typed('health:g2'),
          }),
        },
      });

      runGenerator('build-terms', { CASCADE_SPEC_DATA_DIR: data });
      rows = rowsFor(findingsOf(data, 'build-terms'), CODE);
    }, 60_000);

    afterAll(cleanupScratch);

    it('reports a key declared A, B, A once, with its two predicates', () => {
      expect(rows.map((row) => row.subject)).toEqual(['sourceBundleId']);
      expect([...(rows[0]?.predicates as string[])].sort()).toEqual([
        `${CLINICAL}sourceBundleId`,
        `${CASCADE}sourceBundleId`,
      ]);
    });

    it('reports no row for a class term two contexts name differently', () => {
      expect(rows.some((row) => row.subject === 'SocialHistoryRecord')).toBe(false);
    });
  });

  describe('against the build pretest already ran', () => {
    /**
     * Re-derived here rather than read from the generator: every key whose
     * expanded values across the shipped contexts are more than one IRI, less
     * the keys naming only classes. `scripts/lib/spec-source.mjs` is shared
     * plumbing, not the detector.
     */
    function conflictedPropertyKeys(): string[] {
      const contexts = join(repoRoot, 'src/spec/contexts');
      const prefixes = contextPrefixes(contexts) as Map<string, string>;
      const nodes = mergedOntologyGraph(join(repoRoot, 'src/spec/ontologies')) as Map<string, { '@type'?: string[] }>;
      const byKey = new Map<string, Set<string>>();

      for (const file of readdirSync(contexts).filter((f) => f.endsWith('.jsonld'))) {
        const document = JSON.parse(readFileSync(join(contexts, file), 'utf-8')) as { '@context'?: Record<string, unknown> };

        for (const [term, value] of Object.entries(document['@context'] ?? {})) {
          if (term.startsWith('@') || isPrefixDeclaration(value)) continue;
          const id = typeof value === 'string' ? value : (value as { '@id'?: unknown })?.['@id'];
          if (typeof id !== 'string') continue;
          const iri = expandCurie(prefixes, id) as string;
          if (!/^[A-Za-z][A-Za-z0-9+.-]*:\S*$/.test(iri)) continue;
          (byKey.get(term) ?? byKey.set(term, new Set()).get(term)!).add(iri);
        }
      }

      const isClass = (iri: string) => (nodes.get(iri)?.['@type'] ?? []).includes(OWL_CLASS);

      return [...byKey]
        .filter(([, iris]) => iris.size > 1 && ![...iris].every(isClass))
        .map(([term]) => term)
        .sort();
    }

    it('carries one row per conflicted property key, each with its predicates', () => {
      const file = join(repoRoot, 'src/spec/diagnostics.json');

      expect(existsSync(file), `no ${file}; npm run generate writes it`).toBe(true);

      const expected = conflictedPropertyKeys();
      // A zero here would make the equality below vacuous.
      expect(expected.length).toBeGreaterThan(0);

      const rows = rowsFor(
        (JSON.parse(readFileSync(file, 'utf-8')) as { findings: Finding[] }).findings,
        CODE,
      );

      expect(rows.map((row) => row.subject).sort()).toEqual(expected);

      for (const row of rows) {
        expect(new Set(row.predicates as string[]).size, row.subject).toBeGreaterThan(1);
      }
    });
  });
});
