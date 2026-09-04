/**
 * Hand-verified declarations for the sliver of the vendored n3 this SDK calls.
 *
 * THIS FILE IS OURS, NOT UPSTREAM'S. `n3.js` beside it is generated from n3's
 * source by `scripts/vendor-n3.mjs`; n3@2 ships no types of its own, and
 * `@types/n3` tracks 1.x. The surface below is exactly what
 * `src/converter/to-rdf.ts` and `src/deserializer/n3-adapter.ts` reach, read
 * off n3@2's `src/N3Parser.js` and `src/N3Writer.js`. Using anything not
 * declared here is a compile error, on purpose: it sends whoever adds the call
 * to the real v2 signature rather than to a v1 guess. The same reasoning as
 * `tests/support/n3.d.ts`, which declares the sliver the tests use.
 *
 * Term shapes are the RDF/JS ones, declared here rather than imported from
 * `@rdfjs/types` because that package is a devDependency and this file ships:
 * a type reference into it would put a package a consumer does not have into
 * the emitted declarations.
 */

/** An RDF/JS term: what a quad's positions hold. */
export interface Term {
  termType: 'NamedNode' | 'BlankNode' | 'Literal' | 'Variable' | 'DefaultGraph' | 'Quad';
  value: string;
  /** Literals only: the datatype IRI as a `NamedNode`. */
  datatype?: Term;
  /** Literals only: the BCP 47 tag, or `''` when none. */
  language?: string;
  equals(other: Term | null | undefined): boolean;
}

/** An RDF/JS quad, as n3 parses and writes it. */
export interface Quad {
  termType: 'Quad';
  subject: Term;
  predicate: Term;
  object: Term;
  graph: Term;
}

export class Parser {
  constructor(options?: {
    format?: string;
    baseIRI?: string;
    blankNodePrefix?: string;
    factory?: unknown;
  });

  /**
   * Synchronous form. With no callback, `parse` reads the whole input and
   * returns the quads; the callback forms stream instead, and are not declared.
   */
  parse(input: string): Quad[];
}

export class Writer {
  constructor(options?: {
    prefixes?: Record<string, string>;
    format?: string;
  });

  addQuad(quad: Quad): void;

  /**
   * Finish the document. With no output stream configured the callback is
   * invoked synchronously with the whole document as `result`.
   */
  end(callback?: (error: Error | null | undefined, result: string) => void): void;
}
