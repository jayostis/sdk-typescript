/**
 * Hand-verified declarations for the sliver of `n3` these tests use.
 *
 * WHY NOT `@types/n3`. That package tracks n3 **1.x** and has no 2.x release —
 * `npm view @types/n3 versions` stops at 1.26.1 — while `n3@2` ships no
 * `types`, `typings` or `exports` field of its own. Depending on it meant tsc
 * validated against one major while vitest ran another, so anything that moved
 * across the boundary (Parser options, the RDF-1.2 `versionCallback` argument
 * n3 v2 added to `Parser.parse`, dropped exports) typechecked green and could
 * still misbehave at runtime.
 *
 * The surface below is exactly what `tests/support/rdf.ts` calls, read off
 * `n3@2`'s own `lib/N3Parser.js`. Using anything not declared here is a compile
 * error, which is the point: it forces whoever adds the call to check the real
 * v2 signature rather than inherit a v1 guess. Delete this file the day
 * `@types/n3` ships a 2.x, or n3 ships its own types.
 */
declare module 'n3' {
  export class Parser {
    constructor(options?: {
      format?: string;
      baseIRI?: string;
      blankNodePrefix?: string;
      factory?: unknown;
    });

    /**
     * Synchronous form. With no quad callback, `parse` reads the whole input
     * and returns the quads; the callback forms stream instead.
     */
    parse(input: string): import('@rdfjs/types').Quad[];
  }
}
