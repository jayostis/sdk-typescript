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

/** Every `.ts` file under `dir`, recursively, as absolute paths. */
function sourcesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourcesUnder(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

/**
 * Every module specifier `source` imports, in the order they are written.
 *
 * Static `import` and `export ... from` carry a `moduleSpecifier`; a dynamic
 * `import()` is a call whose callee is the `import` keyword. A dynamic import
 * whose argument is not a literal — `import(name)` — names no specifier to
 * report, and `src/` writes none; a computed specifier is the one form this
 * function cannot see.
 */
function specifiersIn(source: string, fileName: string): string[] {
  const parsed = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const found: string[] = [];

  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      if (ts.isStringLiteral(node.moduleSpecifier)) found.push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      found.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };

  visit(parsed);
  return found;
}

/**
 * Does this specifier need something installed?
 *
 * A relative path is a file in this repository, whatever its extension: the
 * JSON data asset is admitted here and not by a clause of its own. Everything
 * else is a name a resolver looks up, and `node:` is the only prefix that is
 * answered by the runtime instead of by `node_modules`.
 *
 * A bare `crypto` is therefore a finding. An npm package by that name exists,
 * so the specifier alone cannot say which one a resolver hands back, and `src/`
 * writes the prefix everywhere already.
 */
function needsInstalling(specifier: string): boolean {
  return !specifier.startsWith('.') && !specifier.startsWith('node:');
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
