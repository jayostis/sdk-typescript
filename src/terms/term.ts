/**
 * One field, one module: the predicate, the rule for writing it, and the
 * per-record-type variations of both, in a single declaration.
 *
 * STUB. The shapes below are the observable contract the tests are written
 * against; the behaviour is not implemented yet.
 *
 * @module terms
 */

import { PROPERTY_PREDICATES } from '../vocabularies/namespaces.js';

/** How a field's value becomes RDF. */
export type FieldRule = {
  form: 'literal' | 'iri' | 'iriList' | 'prefixedEnum' | 'blankNode';
  /** Accept an array OR a bare scalar, and write one triple per value. */
  many?: boolean;
  /** `literal` only, e.g. `xsd:integer`. */
  datatype?: string;
  /** `prefixedEnum` only, e.g. `health`. */
  prefix?: string;
  /** `blankNode` only, e.g. `cascade:EmergencyContact`. */
  rdfType?: string;
};

/** The declaration a term module exports. */
export type TermSpec = {
  /** The JSON field name. */
  key: string;
  /** From {@link predicateOf}, never a literal. */
  predicate: string;
  /** recordType -> predicate. */
  predicateByType?: Record<string, string>;
  rule: FieldRule;
  /** recordType -> rule. */
  ruleByType?: Record<string, FieldRule>;
};

/** One triple-shaped thing a term asks the builder to write. */
export type Output =
  | { kind: 'literal'; predicate: string; value: string; datatype?: string }
  | { kind: 'uri'; predicate: string; value: string }
  | { kind: 'uriList'; predicate: string; items: string[] }
  | { kind: 'blankNode'; predicate: string; rdfType: string; children: Output[] };

export type Term = TermSpec & {
  /**
   * Reads `record[key]` itself, and `record.type` to resolve
   * `predicateByType` / `ruleByType`. Returns `[]` when the field is absent.
   */
  outputsFor(record: Record<string, unknown>): Output[];
};

/**
 * Resolve a JSON field name to its registered predicate.
 *
 * STUB: does not yet reject an unregistered key.
 */
export function predicateOf(key: string): string {
  return PROPERTY_PREDICATES[key] ?? '';
}

/**
 * Build a term from its declaration.
 *
 * STUB: `outputsFor` produces nothing for any record.
 */
export function defineTerm(spec: TermSpec): Term {
  return { ...spec, outputsFor: () => [] };
}
