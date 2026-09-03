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

  /** The class this SDK WRITES, as a CURIE: `'clinical:Medication'`. */
  readonly rdfType: string;

  /**
   * The same class, expanded once.
   *
   * Twelve `indexOf(':')`-and-two-`slice`s appeared across four files, seven of
   * them splitting a class CURIE. More to the point for #69: this is derived
   * from the ontologies rather than transcribed, so it is the one key that
   * survives the deletion of `src/vocabularies/`.
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

/**
 * One `owl:Class` declaration as the derivation needs it.
 *
 * Deliberately not an RDF term, a quad, or a path on disk. The derivation takes
 * these as an ARGUMENT — see {@link deriveRecordTypes} — and the whole benefit
 * of that is that a test can write two of them in an object literal.
 */
export interface ClassDeclaration {
  /** The vocabulary prefix the class declares itself under: `'clinical'`. */
  readonly prefix: string;

  /** The local name: `'Medication'`. */
  readonly localName: string;

  /**
   * `owl:deprecated`, in either spelling.
   *
   * A deprecated class is READ but never WRITTEN, so it must not be a
   * derivation target: `clinical:CoverageRecord` is declared, is an exact
   * local-name match for the accepted input spelling `CoverageRecord`, and
   * deriving to it would make this SDK write the class #26 removed.
   */
  readonly deprecated?: boolean;
}

/** A name that more than one vocabulary declares a class for. */
export interface Ambiguity {
  readonly name: string;

  /** Every candidate CURIE, sorted, so the message is stable. */
  readonly candidates: readonly string[];
}

/**
 * What derivation could work out, and what it could not.
 *
 * `unresolved` is the complete list of names needing a declared override, and
 * an ambiguous name is in BOTH: `ambiguous` says why — which candidates — and
 * `unresolved` says that something must decide. A caller reading only
 * `unresolved` cannot miss a collision, which is the failure this shape exists
 * to prevent.
 */
export interface DerivationReport {
  /** `name -> CURIE`, for names exactly one non-deprecated class matches. */
  readonly derived: ReadonlyMap<string, string>;

  /** Names more than one vocabulary declares, with their candidates. */
  readonly ambiguous: readonly Ambiguity[];

  /** Every name derivation could not resolve to exactly one class, sorted. */
  readonly unresolved: readonly string[];
}
