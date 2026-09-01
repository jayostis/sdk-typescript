/**
 * `spec` is read where it is checked out, and this is what says so.
 *
 * Four shapes files used to be copied in here and kept in step by a sync script
 * and a 239-line drift check. A copy that falls behind asserts last month's
 * constraints while reporting green, and the guard against that is a guard the
 * repository only needs because it copies. Reading spec where it sits removes
 * both, and these three checks are what stop either coming back: a Turtle file
 * nobody publishes, a path a caller resolved for itself, or a message naming a
 * script that no longer exists.
 *
 * Each detector is handed input where it MUST speak before it is pointed at
 * ours — `tests/README.md`, "A detector is proven by making it speak."
 */

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import { turtleFiles, specPathLiterals, vendoringNames } from './spec-single-source.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** A scratch tree whose files say what the case needs them to say. */
function scratchTree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'spec-single-source-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content, 'utf-8');
  }
  return root;
}

describe('turtleFiles', () => {
  it('names a copied shapes file wherever it is put', () => {
    // Wherever, because the name is not the tell. `tests/shapes/` is where the
    // copies used to live, and a check keyed on that directory would miss the
    // same four files under any other.
    const root = scratchTree({
      'tests/fixtures/core.shapes.ttl': '# copied\n',
      'src/index.ts': 'export const x = 1;\n',
    });

    expect(turtleFiles(root)).toEqual(['tests/fixtures/core.shapes.ttl']);
  });

  it('is silent for a repository that copies nothing', () => {
    const root = scratchTree({ 'src/index.ts': 'export const x = 1;\n' });

    expect(turtleFiles(root)).toEqual([]);
  });

  it('finds no Turtle in the repository we actually ship', () => {
    expect(turtleFiles(repoRoot)).toEqual([]);
  });
});

describe('specPathLiterals', () => {
  it('names the file and the path it hardcoded', () => {
    const root = scratchTree({
      'tests/support/shacl.ts': "const dir = 'ontologies/core/v1';\n",
    });

    expect(specPathLiterals(root)).toEqual(["tests/support/shacl.ts -> ontologies/core/v1"]);
  });

  it('names a path built in a template literal', () => {
    // The form the deleted sync script used. A check that reads only quoted
    // strings would call `cp "$SPEC/ontologies/$specPath/$name"` clean.
    const root = scratchTree({
      'scripts/sync.ts': 'const p = `ontologies/${name}/v1`;\n',
    });

    expect(specPathLiterals(root)).toEqual(['scripts/sync.ts -> ontologies/']);
  });

  it('names a path assembled one segment at a time', () => {
    // The form the deleted drift check used — `join(specRoot, 'ontologies', sub,
    // name)`. Not one of its literals carries a slash or a `.shapes.ttl`
    // suffix, so a pattern keyed on those two spellings reports the likeliest
    // reintroduction of a self-resolved spec path as clean.
    const root = scratchTree({
      'tests/support/shacl.ts':
        "const p = join(root, 'ontologies', 'core', 'v1', 'core.ttl');\n",
    });

    expect(specPathLiterals(root)).toEqual(['tests/support/shacl.ts -> ontologies']);
  });

  it('is silent for an @see citation', () => {
    // The 20-odd `@see spec/ontologies/…` lines in `src/terms/definitions/` are
    // why this parses instead of grepping. They cite spec; they do not read it.
    const root = scratchTree({
      'src/terms/definitions/allergen.ts':
        '/**\n * @see spec/ontologies/health/v1/health.shapes.ttl  health:AllergyRecordShape\n */\n'
        + 'export const allergen = {};\n',
    });

    expect(specPathLiterals(root)).toEqual([]);
  });

  it('finds no hardcoded spec path in the code we actually ship', () => {
    // `spec-sources.json` is the one place a spec path is written down, and it
    // is JSON: this walks TypeScript and JavaScript, so the manifest is out of
    // scope by construction rather than by an exception. `tests/support/spec-sources.ts`
    // is NOT spared either — it reads the layout's top directory off the
    // manifest rather than spelling it, which is what keeps it silent here.
    //
    // The two spared files are the ones that BUILD scratch spec checkouts to
    // prove a resolver refuses or resolves — they have to name real paths to do
    // it. No file that reads spec for a verdict is spared, which is the rule
    // this check is for.
    expect(
      specPathLiterals(repoRoot, [
        'tests/spec-single-source.test.ts',
        'tests/support/spec-sources.test.ts',
      ]),
    ).toEqual([]);
  });
});

describe('vendoringNames', () => {
  it('names the message that sends a reader to a deleted script', () => {
    const root = scratchTree({
      'tests/support/shacl.ts':
        "throw new Error('re-run scripts/sync-shapes-from-spec.sh');\n",
    });

    expect(vendoringNames(root)).toEqual([
      'tests/support/shacl.ts:1 -> sync-shapes-from-spec',
    ]);
  });

  it('names a comment too, not only a thrown string', () => {
    // A comment pointing at a deleted directory misinforms the next reader
    // exactly as well as an error message does.
    const root = scratchTree({
      'src/validator/validator.ts': '// `tests/shapes/` is not in the files list\n',
    });

    expect(vendoringNames(root)).toEqual([
      'src/validator/validator.ts:1 -> tests/shapes',
    ]);
  });

  it('names the scheme where it was actually written — a script, and the npm entry that ran it', () => {
    // Not one of these files is TypeScript, and that is the point: the scheme
    // lived in a `.sh`, a `.mjs` and `package.json`. Re-adding all three is the
    // likeliest reintroduction, and a walker keyed on `.ts` calls it clean.
    //
    // The `.mjs` is named by its PATH, not by a line: a re-added script need
    // never mention itself, and its filename is the loudest mention there is.
    const root = scratchTree({
      'scripts/check-shapes-drift.mjs': 'const stale = compare();\n',
      'scripts/sync-shapes-from-spec.sh': '#!/bin/sh\ncp "$SPEC/$path" "$dest"\n',
      'package.json': '{\n  "scripts": { "drift": "node scripts/check-shapes-drift.mjs" }\n}\n',
    });

    expect(vendoringNames(root)).toEqual([
      'package.json:2 -> check-shapes-drift',
      'scripts/check-shapes-drift.mjs -> check-shapes-drift',
      'scripts/sync-shapes-from-spec.sh -> sync-shapes-from-spec',
    ]);
  });

  it('finds nothing naming the vendoring scheme in what we actually ship', () => {
    // Every file, not only the TypeScript, so a re-added `.sh`, `.mjs` or npm
    // script is a finding. Anything naming a dead name is one, including a
    // comment.
    //
    // Four files are spared, in two pairs. This one and the detector it drives,
    // because proving a check that reports dead names means writing dead names
    // down. And `CHANGELOG.md` and `VOCAB_VERSIONS`, because both are
    // append-only records of what was true at a past release: `CHANGELOG.md:117`
    // and `VOCAB_VERSIONS:481` describe the release that vendored
    // `coverage.shapes.ttl` into `tests/shapes/`, and that release did. Editing
    // a dated entry to match today would be a lie about a version someone can
    // still install. Nothing a reader takes as CURRENT is spared.
    expect(
      vendoringNames(repoRoot, [
        'tests/spec-single-source.ts',
        'tests/spec-single-source.test.ts',
        'CHANGELOG.md',
        'VOCAB_VERSIONS',
      ]),
    ).toEqual([]);
  });
});
