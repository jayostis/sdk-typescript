/**
 * The one module that knows where `spec` is, and what it refuses.
 *
 * Every refusal here is the same failure wearing a different hat: a suite that
 * cannot find the shapes must say so, because the alternative is a SHACL run
 * over an empty graph, which conforms to everything. Copies used to make that
 * impossible by keeping the shapes in the repository; nothing is copied now, so
 * these refusals are what replaced them.
 *
 * The detector is handed input where it MUST speak before it is pointed at ours
 * — `tests/README.md`, "A detector is proven by making it speak."
 */

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, isAbsolute, resolve } from 'node:path';

import { describe, it, expect, afterEach, vi } from 'vitest';

import {
  specRoot,
  undeclaredShapes,
  pathsFor,
  shapesGraph,
  parseManifest,
} from './spec-sources.js';

/** A scratch spec checkout holding the files named, with any content. */
function scratchSpec(files: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'spec-sources-'));
  for (const path of files) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), '# not read by these cases\n', 'utf-8');
  }
  return root;
}

const ENV = process.env.CASCADE_SPEC_DIR;

afterEach(() => {
  if (ENV === undefined) delete process.env.CASCADE_SPEC_DIR;
  else process.env.CASCADE_SPEC_DIR = ENV;


  vi.restoreAllMocks();
});

/** Two revisions that are certainly not each other, spelled as spec's are. */

describe('specRoot', () => {
  it('names the path it looked for and both ways to change it', () => {
    // The message is the whole product of this refusal. "spec not found" sends
    // a reader to search for a convention nobody wrote down; the path and the
    // two names are what let them fix it without opening this file.
    const empty = mkdtempSync(join(tmpdir(), 'spec-sources-empty-'));

    expect(() => specRoot(empty)).toThrow(empty);
    expect(() => specRoot(empty)).toThrow('CASCADE_SPEC_DIR');
    expect(() => specRoot(empty)).toThrow('../spec');
  });

  it('refuses a directory that exists but holds no ontologies', () => {
    // Present-but-wrong is the likelier mistake than absent: a half-cloned
    // checkout, or a path pointed at the repository above `spec`.
    const notSpec = scratchSpec(['README.md']);

    expect(() => specRoot(notSpec)).toThrow(notSpec);
  });

  it('ignores an empty override rather than reading it as the cwd', () => {
    // `??` falls back only on null/undefined, so an empty string survives to
    // `resolve('')`, which is the cwd. The cwd is a directory, so nothing
    // downstream notices; the next name in the order is simply never consulted.
    const elsewhere = scratchSpec(['ontologies/core/v1/core.ttl']);
    process.env.CASCADE_SPEC_DIR = elsewhere;

    expect(specRoot('')).toBe(elsewhere);
  });

  it('never answers with the cwd when a name in the order is empty', () => {
    // An exported-but-empty `CASCADE_SPEC_DIR=` is what any shell or CI that
    // passes an unset input straight through produces, and it is not a choice
    // of directory. Read as one it names THIS repository — a path nobody set,
    // with a perfectly good sibling sitting unconsulted — and the refusal sends
    // its reader to look for a spec checkout in the SDK.
    //
    // Asserted as "not the cwd" rather than as a path, because the sibling is
    // present on a developer's machine and absent in CI: resolving to it and
    // refusing to find it are both correct, and landing on the cwd is not.
    process.env.CASCADE_SPEC_DIR = '';

    let landed: string;
    try {
      landed = specRoot();
    } catch (error) {
      landed = (error as Error).message;
    }

    expect(landed).not.toContain(resolve(process.cwd()));
  });

  it('takes CASCADE_SPEC_DIR over the sibling', () => {
    // The order two upstream repositories document, asserted as an order
    // rather than as "a path resolved": with no sibling in play the sibling
    // fallback would answer identically and prove nothing.
    const elsewhere = scratchSpec(['ontologies/core/v1/core.ttl']);
    process.env.CASCADE_SPEC_DIR = elsewhere;

    expect(specRoot()).toBe(elsewhere);
  });
});

describe('parseManifest', () => {
  it('names the vocabulary and the key when an entry declares no ontology', () => {
    // `pathsFor` reads `declared.ontology` straight into `join`, so an entry
    // missing the key throws ERR_INVALID_ARG_TYPE from `node:path` — a message
    // naming neither the vocabulary nor the key, out of a module whose header
    // promises every failure names the path it tried. Every SHACL-importing
    // suite fails at once behind it.
    const missing = { genomics: { shapes: 'ontologies/genomics/v1-draft/genomics.shapes.ttl' } };

    expect(() => parseManifest(missing, '/somewhere/spec-sources.json')).toThrow('genomics');
    expect(() => parseManifest(missing, '/somewhere/spec-sources.json')).toThrow('ontology');
    expect(() => parseManifest(missing, '/somewhere/spec-sources.json')).toThrow(
      '/somewhere/spec-sources.json',
    );
  });

  it('refuses a manifest that lists no vocabularies', () => {
    // An empty manifest makes every SHACL verdict vacuous rather than absent:
    // the shapes graph parses nothing and conforms to everything.
    expect(() => parseManifest({}, '/somewhere/spec-sources.json')).toThrow(
      '/somewhere/spec-sources.json',
    );
  });

  it('takes a manifest whose every entry declares an ontology', () => {
    const declared = { core: { ontology: 'ontologies/core/v1/core.ttl' } };

    expect(parseManifest(declared, '/somewhere/spec-sources.json')).toEqual(declared);
  });
});

describe('pathsFor', () => {
  it('names a vocabulary the manifest does not list', () => {
    // Returning undefined here would read to a caller as "this vocabulary has
    // no shapes", which is the vacuous pass `assertCovered` exists to refuse.
    const root = scratchSpec(['ontologies/core/v1/core.ttl']);

    expect(() => pathsFor('genomics', root)).toThrow('genomics');
  });

  it('answers with absolute paths', () => {
    // Absolute, because a caller that has to know what a relative path is
    // relative to has learned where spec is — the thing this module exists to
    // keep to itself.
    const root = scratchSpec([
      'ontologies/core/v1/core.ttl',
      'ontologies/core/v1/core.shapes.ttl',
    ]);

    const paths = pathsFor('core', root);

    expect(isAbsolute(paths.ontology)).toBe(true);
    expect(paths.ontology).toBe(join(root, 'ontologies/core/v1/core.ttl'));
    expect(paths.shapes).toBe(join(root, 'ontologies/core/v1/core.shapes.ttl'));
  });

  it('names the file when the manifest points at something that is not there', () => {
    // A manifest entry outliving the file it names is exactly the drift the
    // deleted check used to report, and it must not degrade into an empty
    // graph.
    const root = scratchSpec(['ontologies/core/v1/core.ttl']);

    expect(() => pathsFor('core', root)).toThrow('core.shapes.ttl');
  });
});

describe('shapesGraph', () => {
  it('carries every declared vocabulary, judged by its own targets', () => {
    // Read off the graph rather than counted: a count goes green on any four
    // files, including four copies of one. `sh:targetClass` from each
    // vocabulary is what says all four parsed and reached the same dataset.
    const targets = new Set<string>();
    for (const quad of shapesGraph()) {
      if (quad.predicate.value === 'http://www.w3.org/ns/shacl#targetClass') {
        targets.add(quad.object.value);
      }
    }

    const namespaces = new Set([...targets].map((iri) => iri.replace(/[#/][^#/]*$/, '')));

    expect(namespaces).toContain('https://ns.cascadeprotocol.org/core/v1');
    expect(namespaces).toContain('https://ns.cascadeprotocol.org/health/v1');
    expect(namespaces).toContain('https://ns.cascadeprotocol.org/clinical/v1');
    expect(namespaces).toContain('https://ns.cascadeprotocol.org/coverage/v1');
  });

  it('parses once and hands back the same dataset', () => {
    // Three suites import this. Parsing 125 KB of Turtle per importer is the
    // cost `tests/support/shacl.ts` documents and the reason fixture loading
    // was split out; sharing one dataset is what keeps it paid once.
    expect(shapesGraph()).toBe(shapesGraph());
  });
});

describe('undeclaredShapes', () => {
  // The list in `spec-sources.json` is the decision about which vocabularies
  // this SDK judges records against, and it is kept by hand — it sat at four of
  // the six `spec` publishes for weeks with nothing to say so, which is #31.
  // Discovery is what makes forgetting loud; the entry is still somebody's
  // commit.

  it('names a shapes file the manifest does not carry', () => {
    const root = scratchSpec([
      'ontologies/core/v1/core.shapes.ttl',
      'ontologies/genomics/v1/genomics.shapes.ttl',
    ]);

    expect(undeclaredShapes(root)).toEqual(['ontologies/genomics/v1/genomics.shapes.ttl']);
  });

  it('is silent for a vocabulary that publishes no shapes', () => {
    // An ontology with no shapes file is not an omission — spec publishes six
    // shapes files across more vocabularies than that, and a directory holding
    // only a `.ttl` is spec saying it constrains nothing yet.
    const root = scratchSpec([
      'ontologies/core/v1/core.shapes.ttl',
      'ontologies/genomics/v1/genomics.ttl',
    ]);

    expect(undeclaredShapes(root)).toEqual([]);
  });

  it('accounts for every shapes file the checkout we test against publishes', () => {
    expect(undeclaredShapes()).toEqual([]);
  });
});
