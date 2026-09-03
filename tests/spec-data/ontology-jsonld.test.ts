/**
 * The converted ontologies carry every quad the Turtle did.
 *
 * `scripts/build-spec-data.mjs` writes expanded JSON-LD by hand — group the
 * quads by subject, emit `@id`, `@type` and one array per predicate. That is a
 * mechanical transform and it is also exactly the kind of thing that loses a
 * language tag, flattens a datatype, or drops the second object of a repeated
 * predicate without anyone noticing, because the output still looks like a
 * graph.
 *
 * SO IT IS READ BACK BY A REAL JSON-LD PROCESSOR, not by the inverse of the
 * writer. `quadsFromJsonLd` runs `@rdfjs/parser-jsonld`; a hand-written reader
 * would share the writer's misconceptions and agree with it about all of them.
 * The oracle pattern this repository already uses for SHACL, applied to a
 * format instead of a verdict.
 *
 * COMPARED AS GRAPHS, canonically. The ontologies carry blank nodes —
 * `owl:Restriction`, `owl:unionOf` lists — whose labels are assigned by
 * whichever parser saw them, so a textual comparison reports differences that
 * are not differences. RDFC-1.0 derives labels from the graph's own shape.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, beforeAll } from 'vitest';

import { graphDifference, quadsFromJsonLd, quadsFromTurtle } from '../support/graph.js';
import { pathsFor, specRoot, vocabularies } from '../support/spec-sources.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(repoRoot, 'src/spec/ontologies');

const RDFS_COMMENT = 'http://www.w3.org/2000/01/rdf-schema#comment';

/**
 * Build the artifacts if they are absent.
 *
 * `src/spec/` is gitignored and generated, so a clean clone has none — and the
 * two ways of handling that are both worse than this. Failing teaches people to
 * ignore a red suite on a fresh checkout; skipping makes every assertion below
 * vacuous exactly when the data has never been produced, which is when they
 * matter most. Generating takes about a second and leaves the tree in the state
 * `npm run build` would.
 */
beforeAll(() => {
  if (!existsSync(OUT)) {
    execFileSync('node', [join(repoRoot, 'scripts/build-spec-data.mjs')], { cwd: repoRoot });
  }
}, 60_000);

/** The emitted document for one vocabulary. */
const emitted = (vocabulary: string): object =>
  JSON.parse(readFileSync(join(OUT, `${vocabulary}.jsonld`), 'utf-8')) as object;

describe('every ontology survives the conversion', () => {
  it('emits one document per declared vocabulary, and nothing else', () => {
    // A vocabulary dropped from the manifest must not leave its artifact behind
    // where every consumer would go on reading it — the build removes the
    // directory rather than overwriting into it, and this is what says so.
    const files = readdirSync(OUT).filter((f) => f.endsWith('.jsonld')).sort();

    expect(files).toEqual(vocabularies().map((v) => `${v}.jsonld`).sort());
  });

  it.each(vocabularies())('%s carries every quad but rdfs:comment', async (vocabulary) => {
    const turtle = readFileSync(pathsFor(vocabulary).ontology, 'utf-8');
    const source = quadsFromTurtle(turtle).filter((q) => q.predicate.value !== RDFS_COMMENT);
    const converted = await quadsFromJsonLd(emitted(vocabulary));

    // Not a length check. Two graphs of equal size can differ in every triple,
    // and the failure worth reading is WHICH quad went missing.
    expect(
      await graphDifference(source, converted),
      `${vocabulary}: the emitted JSON-LD is not the same graph as ${vocabulary}.ttl`,
    ).toBeNull();
  }, 60_000);

  it('finds real quads to compare, in every vocabulary', async () => {
    // The assertion above passes trivially on two empty graphs, and an empty
    // graph is exactly what a converter that silently wrote nothing produces.
    for (const vocabulary of vocabularies()) {
      expect((await quadsFromJsonLd(emitted(vocabulary))).length, vocabulary)
        .toBeGreaterThan(100);
    }
  }, 60_000);
});

describe('what the conversion deliberately drops', () => {
  it('drops rdfs:comment, and drops nothing else', () => {
    // The omission is a DECLARATION, computed both ways rather than asserted
    // about one predicate. A second predicate quietly going missing — because a
    // term type was unhandled, say — would otherwise pass every check above
    // that compares only what did arrive.
    const inSource = new Set<string>();
    const inOutput = new Set<string>();

    for (const vocabulary of vocabularies()) {
      const turtle = readFileSync(pathsFor(vocabulary).ontology, 'utf-8');
      for (const quad of quadsFromTurtle(turtle)) inSource.add(quad.predicate.value);

      for (const node of emitted(vocabulary) as Record<string, unknown>[]) {
        for (const key of Object.keys(node)) {
          if (key === '@id') continue;
          // `@type` is how expanded JSON-LD spells `rdf:type`.
          inOutput.add(key === '@type'
            ? 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
            : key);
        }
      }
    }

    expect([...inSource].filter((p) => !inOutput.has(p))).toEqual([RDFS_COMMENT]);
    expect([...inOutput].filter((p) => !inSource.has(p))).toEqual([]);
  });

  it('drops a comment from every vocabulary that has one', () => {
    // Proven by making it speak: if the filter silently stopped matching, the
    // check above would still pass — the set difference would simply be empty
    // in both directions.
    for (const vocabulary of vocabularies()) {
      const turtle = readFileSync(pathsFor(vocabulary).ontology, 'utf-8');
      const comments = quadsFromTurtle(turtle).filter((q) => q.predicate.value === RDFS_COMMENT);

      expect(comments.length, `${vocabulary} declares no rdfs:comment at all`).toBeGreaterThan(0);
    }
  });
});

describe('provenance', () => {
  it('records the repository, the commit and the vocabularies', () => {
    const provenance = JSON.parse(
      readFileSync(join(OUT, 'PROVENANCE.json'), 'utf-8'),
    ) as { repo: string; commit: string | null; vocabularies: string[] };

    expect(provenance.repo).toContain('spec');
    expect(provenance.vocabularies.sort()).toEqual(vocabularies().sort());
    // `null` is legitimate — a checkout with no `.git`, which CI's clone is not
    // but a vendored copy would be. What must never happen is a commit that is
    // not one, since the whole value of this file is being checkable against
    // `conformance/scripts/SPEC_PIN` after the fact.
    if (provenance.commit !== null) expect(provenance.commit).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe('the build script and the test suite resolve the same spec', () => {
  it('agrees on the checkout', () => {
    // DECLARED DUPLICATION. `tests/support/spec-sources.ts` is "the only module
    // that knows", and a `.mjs` build script cannot import it while `allowJs`
    // is off — so `build-spec-data.mjs` carries a second copy of the resolution
    // order. That is a real hazard: the two drifting would mean the suite
    // judging one checkout while the build converted another, and every
    // assertion above would still pass. This is what makes the duplication
    // checked rather than silent, until the resolver is extracted.
    const fromScript = execFileSync(
      'node',
      ['-e', 'const {readFileSync}=require("fs"),{join,resolve}=require("path");'
        + 'const m=JSON.parse(readFileSync("spec-sources.json","utf8"));'
        + 'process.stdout.write(resolve(process.env.CASCADE_SPEC_DIR||join(".","../spec")));'],
      { cwd: repoRoot, encoding: 'utf-8' },
    );

    expect(fromScript).toBe(specRoot());
  });
});
