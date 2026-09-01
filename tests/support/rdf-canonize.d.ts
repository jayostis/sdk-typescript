/**
 * Hand-verified declarations for the sliver of `rdf-canonize` these tests use.
 *
 * Same reasoning as `tests/support/n3.d.ts`, and the same rule. `rdf-canonize@5`
 * ships no `types` field and there is no `@types/rdf-canonize` — unlike
 * `@rdfjs/parser-jsonld`, whose `@types/rdfjs__parser-jsonld` arrives
 * transitively and is used directly rather than shimmed here.
 *
 * The surface below is exactly what `tests/support/graph.ts` calls, read off
 * `rdf-canonize@5`'s own `lib/index.js`. Using anything not declared here is a
 * compile error, which forces whoever adds the call to check the real signature
 * rather than guess one. Delete this file the day the package ships types.
 */
declare module 'rdf-canonize' {
  import type { Quad } from '@rdfjs/types';

  /**
   * A dataset's canonical N-Quads form.
   *
   * This is what makes two graphs comparable when either carries blank nodes.
   * `triples()` in `graph.ts` compares a blank node by its parser-assigned
   * LABEL, which is stable within one parse and not across two;
   * canonicalization replaces those labels with ones derived from the graph's
   * own shape, so two isomorphic graphs canonicalize to the same string and two
   * that genuinely differ do not.
   *
   * Async because the algorithm is permitted to yield between rounds; it does
   * no I/O.
   */
  export function canonize(
    input: readonly Quad[],
    options: { algorithm: 'RDFC-1.0' | 'URDNA2015' },
  ): Promise<string>;
}
