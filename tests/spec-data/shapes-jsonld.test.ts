/**
 * The converted shapes carry every quad the Turtle did.
 *
 * The sibling of `ontology-jsonld.test.ts`, for the second half of what spec
 * publishes. A shapes file is mostly blank nodes — every `sh:property` is one,
 * and every `sh:in` and `sh:or` is an RDF list of them — which is exactly the
 * structure a hand-written converter drops without the output looking any
 * less like a graph. Read back by a real JSON-LD processor and compared
 * canonically, so a lost list member is a named difference.
 *
 * `sh:name` is the one predicate deliberately not carried, on #76's
 * precedent, and the omission is computed both ways so a second predicate
 * going missing is a failure rather than a silence.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, beforeAll } from 'vitest';

import { graphDifference, quadsFromJsonLd, quadsFromTurtle } from '../support/graph.js';
import { pathsFor, vocabularies, SHACL_NS } from '../support/spec-sources.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(repoRoot, 'src/spec/shapes');

const SH_NAME = `${SHACL_NS}name`;

/** The vocabularies spec publishes a shapes file for. */
const shaped = (): string[] => vocabularies().filter((v) => pathsFor(v).shapes !== undefined);

/**
 * Build the artifacts if the data has never been produced — the same trigger
 * as the ontology suite, on the same directory, so the two cannot disagree
 * about whether a build is needed.
 */
beforeAll(() => {
  if (!existsSync(join(repoRoot, 'src/spec/ontologies'))) {
    execFileSync('node', [join(repoRoot, 'scripts/build-spec-data.mjs')], { cwd: repoRoot });
  }
}, 60_000);

/**
 * The emitted document for one vocabulary — an EMPTY graph where none was
 * written, so the comparison below names every quad that failed to arrive
 * rather than stopping at a missing file.
 */
const emitted = (vocabulary: string): object => {
  const file = join(OUT, `${vocabulary}.jsonld`);
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf-8')) as object) : [];
};

const shapesTurtle = (vocabulary: string): string =>
  readFileSync(pathsFor(vocabulary).shapes as string, 'utf-8');

describe('every shapes file survives the conversion', () => {
  it('emits one document per vocabulary that declares shapes, and nothing else', () => {
    const files = existsSync(OUT) ? readdirSync(OUT).filter((f) => f.endsWith('.jsonld')).sort() : [];

    expect(files).toEqual(shaped().map((v) => `${v}.jsonld`).sort());
  });

  it.each(shaped())('%s carries every quad but sh:name', async (vocabulary) => {
    const source = quadsFromTurtle(shapesTurtle(vocabulary)).filter((q) => q.predicate.value !== SH_NAME);
    const converted = await quadsFromJsonLd(emitted(vocabulary));

    expect(
      await graphDifference(source, converted),
      `${vocabulary}: the emitted JSON-LD is not the same graph as the shapes file`,
    ).toBeNull();
  }, 60_000);

  it('finds real quads to compare, in every vocabulary', async () => {
    // Two empty graphs are isomorphic, and an empty graph is what a converter
    // that wrote nothing produces.
    for (const vocabulary of shaped()) {
      expect((await quadsFromJsonLd(emitted(vocabulary))).length, vocabulary).toBeGreaterThan(100);
    }
  }, 60_000);
});

describe('what the conversion deliberately drops', () => {
  it('drops sh:name, and drops nothing else', () => {
    const inSource = new Set<string>();
    const inOutput = new Set<string>();

    for (const vocabulary of shaped()) {
      for (const quad of quadsFromTurtle(shapesTurtle(vocabulary))) inSource.add(quad.predicate.value);

      for (const node of emitted(vocabulary) as Record<string, unknown>[]) {
        for (const key of Object.keys(node)) {
          if (key === '@id') continue;
          inOutput.add(key === '@type' ? 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' : key);
        }
      }
    }

    expect([...inSource].filter((p) => !inOutput.has(p))).toEqual([SH_NAME]);
    expect([...inOutput].filter((p) => !inSource.has(p))).toEqual([]);
  });

  it('drops a name from every vocabulary that has one', () => {
    // Proven by making it speak: a filter that silently stopped matching
    // would leave the both-ways check above satisfied in both directions.
    for (const vocabulary of shaped()) {
      const names = quadsFromTurtle(shapesTurtle(vocabulary)).filter((q) => q.predicate.value === SH_NAME);

      expect(names.length, `${vocabulary} declares no sh:name at all`).toBeGreaterThan(0);
    }
  });
});
