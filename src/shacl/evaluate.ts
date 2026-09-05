/**
 * A SHACL evaluator over the shape data this package ships.
 *
 * THE SEAM, NOT THE ENGINE. The signature below is what `tests/shacl/` is
 * written against and what `validate()` will call for a record type routed on
 * `'validate'` (`src/migration/allow-list.ts`). Everything in it is a stub that
 * evaluates nothing and says so — `evaluated: 0` — so every test that needs a
 * verdict fails on its assertion rather than on a missing import.
 *
 * @module shacl
 */

import type { Quad } from '../vendor/n3/n3.js';

/**
 * One value in the shapes index, in expanded JSON-LD terms: a node reference,
 * a literal, an RDF list resolved to its members, or a blank shape inlined.
 */
export type IndexValue =
  | { readonly '@id': string }
  | { readonly '@value': string; readonly '@type'?: string; readonly '@language'?: string }
  | { readonly '@list': readonly IndexValue[] }
  | IndexedShape;

/**
 * One shape as `scripts/build-shapes.mjs` indexes it.
 *
 * `id` is the IRI of a named shape and absent on a blank one. Every other key
 * is a parameter — the local name for a `sh:` predicate, the full IRI for any
 * other — and every value is an array of {@link IndexValue}, whatever the
 * parameter's cardinality: the index keeps what it does not understand, and
 * cannot know the cardinality of a parameter it does not understand.
 */
export interface IndexedShape {
  readonly id?: string;
  readonly [parameter: string]: unknown;
}

/** One validation result, in the terms `rdf-validate-shacl` reports. */
export interface ShaclResult {
  readonly focusNode: string;
  /** The `sh:path` IRI, or `null` for a node-level constraint. */
  readonly path: string | null;
  readonly sourceConstraintComponent: string;
  /** The `sh:severity` IRI; `sh:Violation` where the shape declares none. */
  readonly severity: string;
  /** The shape's `sh:message`, unaltered; absent where it carries none. */
  readonly message?: string;
}

export interface ShaclReport {
  /** `false` when anything was reported, when anything went unevaluated, or when nothing was evaluated at all. */
  readonly conforms: boolean;
  readonly results: readonly ShaclResult[];
  /** Constraint evaluations performed. Zero is a refusal, never a pass. */
  readonly evaluated: number;
  /** Parameter IRIs present on a selected shape that this engine did not judge, distinct and sorted. */
  readonly unevaluated: readonly string[];
}

/**
 * Evaluate a data graph against indexed shapes.
 *
 * STUB. Selects nothing and evaluates nothing.
 */
export function evaluate(data: readonly Quad[], shapes: readonly IndexedShape[]): ShaclReport {
  void data;
  void shapes;
  return { conforms: true, results: [], evaluated: 0, unevaluated: [] };
}
