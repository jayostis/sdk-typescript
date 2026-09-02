/**
 * Nothing in this repository copies `spec`, and nothing but the manifest says
 * where `spec` is.
 *
 * Three functions over a directory the CALLER supplies, so a test can hand each
 * one sources where it MUST speak before pointing it at ours — the same shape,
 * and for the same reason, as `thirdPartyImports` in `tests/no-runtime-deps.ts`.
 *
 * Parsed, not grepped, for the path check. `src/terms/definitions/` carries
 * about twenty `@see spec/ontologies/health/v1/health.shapes.ttl` citations, and
 * they are the traceability this repository wants: a pattern over file text
 * reports every one of them as a hardcoded path. A STRING LITERAL is the thing
 * that means code went looking for a file, and TypeScript's own parser is what
 * tells one from a sentence in a comment.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import ts from 'typescript';

/** Directories that are not ours to judge, whatever they contain. */
const SKIP = new Set(['node_modules', '.git', 'dist', 'coverage']);

/** Every file under `dir`, recursively, as absolute paths. */
function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (SKIP.has(entry.name)) return [];
    const full = join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(full) : [full];
  });
}

/** A repo-relative path with forward slashes, so a finding reads the same on either OS. */
const asPosix = (root: string, file: string): string => relative(root, file).replace(/\\/g, '/');

/**
 * Every Turtle file under `root`.
 *
 * The whole tree rather than what git tracks: an untracked copy judges records
 * exactly as loudly as a tracked one, and the point of the check is that no
 * verdict in this repository comes from a file `spec` did not publish.
 */
export function turtleFiles(root: string): string[] {
  return filesUnder(root)
    .filter((file) => file.endsWith('.ttl'))
    .map((file) => asPosix(root, file))
    .sort();
}

/**
 * Every string literal under `root` that names a path inside a spec checkout.
 *
 * `ontologies/` and `.shapes.ttl` are the two spellings that mean it: the first
 * is spec's directory layout, the second is a file only spec publishes. A
 * template literal counts — `` `ontologies/${name}` `` is how the deleted sync
 * script wrote one.
 *
 * A BARE `ontologies` counts too, and it is the form that matters most. A path
 * assembled a segment at a time — `join(root, 'ontologies', sub, name)`, which
 * is how the deleted drift check wrote one — puts no slash in any literal, so a
 * pattern keyed on `ontologies/` reports the likeliest reintroduction as clean.
 * The whole literal must be the segment, which is what keeps prose about the
 * layout out of it.
 *
 * A PATH, not the word. `ontologies/` must be followed by a path segment, an
 * interpolation, or the end of the literal — a template head stops there, and
 * the rest of the path is the expression after it. So the resolver's own
 * refusal, "it holds no ontologies/ directory", is prose about a layout rather
 * than a path anything opens, and needs no exemption to stay silent. `except` is for the files that must write real paths down to
 * prove something, and they are named at the call site.
 *
 * JavaScript as well as TypeScript: `check-shapes-drift.mjs` was a `.mjs`, and
 * the TypeScript parser reads one. A `.sh` or a `.yml` cannot be parsed and is
 * not walked here — `vendoringNames` is what sees those, by name.
 */
export function specPathLiterals(root: string, except: string[] = []): string[] {
  const spared = new Set(except);
  const found: string[] = [];

  for (const file of filesUnder(root).filter((f) => /\.[mc]?[jt]sx?$/.test(f))) {
    if (spared.has(asPosix(root, file))) continue;
    const parsed = ts.createSourceFile(
      file,
      readFileSync(file, 'utf-8'),
      ts.ScriptTarget.Latest,
      false,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    const visit = (node: ts.Node): void => {
      if (
        (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) &&
        /^ontologies$|ontologies\/(?:[\w{$]|$)|\.shapes\.ttl/.test(node.text)
      ) {
        found.push(`${asPosix(root, file)} -> ${node.text}`);
      }
      ts.forEachChild(node, visit);
    };

    visit(parsed);
  }

  return found.sort();
}

/**
 * Every mention of a file the vendoring scheme left behind.
 *
 * Text, not literals, and deliberately: a comment pointing at a deleted script
 * misinforms exactly as badly as a thrown message does, and `refuse()` used to
 * end with "re-run scripts/sync-shapes-from-spec.sh" — a remedy nobody can
 * carry out, printed by the check people see most.
 *
 * EVERY FILE, not only the TypeScript. Not one file the scheme lived in was
 * TypeScript: `sync-shapes-from-spec.sh`, `check-shapes-drift.mjs`, and the
 * `check:shapes-drift` entry in `package.json` that ran them. Walking `.ts`
 * alone means all three can come back and this check stays green, which is the
 * one reintroduction it exists to stop.
 *
 * The PATH is matched as well as the lines. A re-added script need never
 * mention itself, and its own filename is the loudest mention there is — a path
 * hit is reported without a line number to say so.
 *
 * `except` spares the files that PROVE this check, which have to write the dead
 * names down to hand them to it, and the two append-only records of what was
 * true at a past release. Naming them at the call site rather than here keeps
 * the exemption where a reader meets it.
 */
export function vendoringNames(root: string, except: string[] = []): string[] {
  const gone = ['tests/shapes', 'vendored.json', 'sync-shapes-from-spec', 'check-shapes-drift'];
  const spared = new Set(except);
  const found: string[] = [];

  for (const file of filesUnder(root)) {
    const posix = asPosix(root, file);
    if (spared.has(posix)) continue;

    for (const name of gone) {
      if (posix.includes(name)) found.push(`${posix} -> ${name}`);
    }

    readFileSync(file, 'utf-8')
      .split('\n')
      .forEach((line, index) => {
        for (const name of gone) {
          if (line.includes(name)) found.push(`${posix}:${index + 1} -> ${name}`);
        }
      });
  }

  return found.sort();
}
