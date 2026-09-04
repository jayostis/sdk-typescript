/**
 * One triple, as everything downstream of a parser reads it.
 *
 * Split out of `turtle-parser.ts` when a second parser arrived. Two modules
 * producing this shape and each declaring its own copy of it would compile,
 * agree structurally, and drift the first time a field was added to one — and
 * the whole point of `tests/deserializer/parser-differential.test.ts` is that
 * the two are comparable.
 *
 * NOT AN RDF TERM, deliberately. `objectType` mixes a term kind (`uri`,
 * `blankNode`, `literal`) with a value kind (`boolean`, `integer`, `double`)
 * and a syntactic one (`list`), because what reads it is asking "what
 * JavaScript value does this become?" rather than "what kind of RDF node is
 * this?". A faithful RDF term would push that question downstream to every
 * consumer instead of answering it once.
 *
 * @module deserializer
 */

export interface ParsedTriple {
  subject: string;
  predicate: string;
  object: string;
  objectType: 'uri' | 'literal' | 'boolean' | 'integer' | 'double' | 'list' | 'blankNode';
  datatype?: string;
}
