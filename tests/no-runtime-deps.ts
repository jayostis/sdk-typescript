/**
 * Every import under `src/` resolves without `node_modules`.
 *
 * A function over a directory the CALLER supplies, so a test can hand it
 * sources where it MUST speak before pointing it at ours — the same shape, and
 * for the same reason, as `reachesPastTheBarrel` in `tests/terms/front-door.ts`.
 *
 * Parsed, not grepped. `src/` carries a dozen JSDoc `@example` blocks showing a
 * consumer writing `import { serialize } from '@the-cascade-protocol/sdk'`, so
 * a pattern over the file text reports a dozen dependencies that do not exist.
 * TypeScript's own parser is what tells an import from a mention, and it is
 * already a devDependency of this repository.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import ts from 'typescript';

/**
 * Every source file under `dir`, recursively, as absolute paths.
 *
 * `.mts`, `.cts` and `.tsx` as well as `.ts`, none of which `endsWith('.ts')`
 * is true for. `src/` holds none of them today, and that is the reason to match
 * them rather than not to: a file the walk never opens is one the report calls
 * clean, so the check would answer "no third-party import" when what happened
 * was that it did not look. `.d.ts` is included on the same argument and not on
 * a claim about `dist/`: tsc does not copy an input declaration file there, but
 * one under `src/` is still source the compiler reads, and a bare specifier in
 * it is still a package the build resolves.
 *
 * JAVASCRIPT TOO, AND FOR THE SAME REASON. This walk matched TypeScript alone
 * until `src/vendor/` existed, at which point roughly 3,300 lines of shipped
 * JavaScript became invisible to the one check that exists to say `src/` pulls
 * nothing in. Vendored code is exactly where an unnoticed dependency would
 * arrive, because nobody reads it: it is copied, not written. A guard blind to
 * the riskiest directory in the tree reports clean about the part it skipped,
 * which is the failure this comment's first paragraph already argues against.
 *
 * What it finds there is DECLARED rather than exempted — see
 * {@link VENDOR_BARE_SPECIFIERS}, which today declares nothing, and is kept so
 * that the next one is written down rather than filtered out.
 */
function sourcesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourcesUnder(full);
    return /\.[mc]?[jt]sx?$/.test(entry.name) ? [full] : [];
  });
}

/**
 * Bare specifiers in vendored source, as `path -> specifier`, compared BOTH WAYS.
 *
 * Empty since #95. The CommonJS copy of n3 this replaced carried
 * `require("buffer")` in `N3Lexer.js`, on a streaming path this repository
 * never reaches, and it was declared here because the report was right: an npm
 * package named `buffer` exists, it was installed as n3's own dependency, and
 * at a consumer the Node builtin answered instead — two different `Buffer`s
 * the specifier could not tell apart. `scripts/vendor-n3.mjs` now answers that
 * import with a declared shim at bundle time, so the shipped `n3.js` has no
 * specifier in it at all, and `tests/vendor-drift.test.ts` holds that.
 *
 * Kept, and compared with `toEqual` rather than deleted, so a NEW bare
 * specifier in vendored code is a failure with a named place to declare it.
 * Empty, though, the comparison is `[]` against `[]` and cannot by itself tell
 * "walked `src/vendor/` and found nothing" from "never opened a `.js` file";
 * the scratch case `reads JavaScript, not only TypeScript` in the test file is
 * what says the walk reads JavaScript.
 */
export const VENDOR_BARE_SPECIFIERS: readonly string[] = [];

/**
 * Every module specifier `source` imports, in the order they are written.
 *
 * Static `import` and `export ... from` carry a `moduleSpecifier`; a dynamic
 * `import()` is a call whose callee is the `import` keyword; an inline
 * `import('n3').Quad` in a TYPE position is none of those — it is an
 * `ImportTypeNode`, and it is the form that survives into the emitted `.d.ts`,
 * where a consumer resolves it against their own `node_modules`.
 *
 * `import cf = require('clownface')` is the fourth, and not a dead one: under
 * `module: NodeNext` it compiles and tsc emits a `createRequire(import.meta.url)`
 * into the JavaScript, so an archaic-looking spelling takes a live runtime
 * dependency. A plain `require('n3')` is the fifth — how a `.cts` file loads a
 * package, and how an ESM file does through `createRequire`.
 *
 * Two forms remain invisible, and neither is an oversight:
 *
 * - A COMPUTED specifier. `import(name)` and `require(name)` name nothing to
 *   report, and a `require` aliased to another identifier is the same problem
 *   wearing a different hat. `src/` writes neither.
 * - `/// <reference types="n3" />`. Detectable — it is on
 *   `SourceFile.typeReferenceDirectives`, not in the AST — and deliberately not
 *   read. Compiled under this repo's settings the directive does NOT reach the
 *   emitted `.d.ts`, used or unused, so no consumer inherits it; meanwhile
 *   `/// <reference types="node" />` is legitimate and idiomatic, and reading
 *   directives would flag it on day one. A guard that needs an allow-list
 *   entry immediately is one somebody switches off.
 */
function specifiersIn(source: string, fileName: string): string[] {
  // JS is parsed as JS, not as TS-that-happens-to-be-valid. The two grammars
  // overlap almost entirely and `ScriptKind.TS` would read the vendored files
  // today, but "almost" is the wrong guarantee for a check whose failure mode is
  // silently reporting clean.
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX
    : /\.[mc]?jsx?$/.test(fileName) ? ts.ScriptKind.JS
      : ts.ScriptKind.TS;
  const parsed = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, false, kind);
  const found: string[] = [];

  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      if (ts.isStringLiteral(node.moduleSpecifier)) found.push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      found.push(node.arguments[0].text);
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      found.push(node.argument.literal.text);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      found.push(node.moduleReference.expression.text);
    }
    ts.forEachChild(node, visit);
  };

  visit(parsed);
  return found;
}

/**
 * Does this specifier need something installed?
 *
 * A path is a file on disk, whatever its extension and whether it is relative
 * or absolute: the JSON data asset is admitted here and not by a clause of its
 * own. Everything else is a name a resolver looks up, and `node:` is the only
 * prefix answered by the runtime instead of by `node_modules`.
 *
 * A bare `crypto` is therefore a finding. An npm package by that name exists,
 * so the specifier alone cannot say which one a resolver hands back, and `src/`
 * writes the prefix everywhere already.
 *
 * So is `#internal/thing`. A subpath import resolves through package.json's
 * `imports` field, and that field is ALLOWED to map a subpath onto a package —
 * which is most of why the form exists. The specifier cannot say whether
 * anything is installed, so this reports rather than assumes; `imports` is
 * undeclared here, so writing one means adding the field in the same change.
 */
function needsInstalling(specifier: string): boolean {
  return !specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.startsWith('node:');
}

/** `file -> specifier` for every import under `srcDir` that names a package. */
export function thirdPartyImports(srcDir: string): string[] {
  return sourcesUnder(srcDir)
    .flatMap((file) => {
      const posixPath = relative(srcDir, file).replace(/\\/g, '/');

      return specifiersIn(readFileSync(file, 'utf-8'), file)
        .filter(needsInstalling)
        .map((specifier) => `${posixPath} -> ${specifier}`);
    })
    .sort();
}
