/**
 * What this SDK knows about a record type, in one place.
 *
 * The class-half sibling of `src/terms/`. `termFor(key)` answers everything
 * about a FIELD — its predicate, its rule, its per-type variations — and
 * nothing answered the same question about a CLASS: which RDF type it is
 * written as, which spellings a reader accepts, and which of two names a read
 * returns. That was spread across two tables in `src/vocabularies/namespaces.ts`
 * and three private functions in the deserializer, none of which the other
 * writers could reach. See #42.
 *
 * @module record-types
 */

/**
 * One record type: every name it answers to and every class it maps to.
 *
 * `name` versus `aliases` is the point of the interface. One RDF class must
 * read back as exactly one JSON `type`, and until this existed that choice was
 * made by OBJECT KEY ORDER — `buildReverseTypeMap` took "the first entry in
 * `TYPE_TO_MAPPING_KEY` that maps to each mapping key", so `clinical:Procedure`
 * read back as `ProcedureRecord`, a spelling `src/models/procedure.ts` does not
 * declare and no fixture uses. Declaring the canonical name makes it a
 * decision; leaving it to key order made it an accident that a reordering
 * could silently reverse.
 */
export interface RecordType {
  /** The canonical JSON `type` — what a read RETURNS. */
  readonly name: string;

  /** Other spellings accepted on input, never returned. */
  readonly aliases: readonly string[];

  /**
   * The class IRI this record type is written as.
   *
   * A FULL IRI, NOT A CURIE. `rdfType` used to sit beside this holding
   * `'clinical:Medication'`, which read nicely and cost a prefix map to expand —
   * twelve `indexOf(':')`-and-two-`slice`s across four files, seven of them
   * splitting a class CURIE. The prefix map is the last thing that would have
   * to be hand-kept once the classes are derived, because expanded JSON-LD
   * carries IRIs and no prefixes: `@prefix health: <...>` does not survive the
   * conversion, by construction. One identifier, and nothing to expand.
   */
  readonly rdfTypeUri: string;

  /**
   * Every class IRI a subject may carry and still read back as this type,
   * `rdfTypeUri` included.
   *
   * Where the deprecated `clinical:` spellings live. Clinical v1.13 deprecated
   * four classes and v1.5 a fifth; none was REMOVED, and the pod export path is
   * still their sole emitter. Refusing to read those pods would be a data-loss
   * bug dressed up as standards compliance.
   */
  readonly acceptedClassUris: readonly string[];
}
