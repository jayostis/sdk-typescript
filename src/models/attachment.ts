/**
 * Pod attachment metadata for the Cascade Protocol (core v3.7).
 *
 * A `cascade:Attachment` is the RDF metadata node for a binary document that
 * lives beside a Pod's Turtle as an ordinary file: the PDF a DiagnosticReport
 * was rendered as, the scanned page behind a DocumentReference.
 *
 * RDF type: `cascade:Attachment`
 * Vocabulary: `https://ns.cascadeprotocol.org/core/v1#`
 *
 * ## Why this is a subject with an IRI, not an inline blank node
 *
 * `cascade:HasAttachmentEdgeShape` declares `sh:nodeKind sh:IRI` on the object
 * of `cascade:hasAttachment`, so the edge must point at something addressable:
 * "an attachment must be addressable from the file that points at it", because
 * a Pod partitions records into per-type files and the record and its
 * attachment may live in different ones. An inline blank node would violate
 * that shape. This is the opposite of `clinical:EncounterParticipant`, whose
 * shape deliberately omits `sh:nodeKind sh:IRI` so that a serializer may write
 * a blank node for a structural sub-node.
 *
 * So an `Attachment` serializes as its own subject and the parent record
 * carries `hasAttachment` as one or more IRIs.
 *
 * ## The bytes are a file, not a literal
 *
 * FHIR's Attachment datatype permits inline base64 (`Attachment.data`) or a
 * pointer (`Attachment.url`). Cascade takes the second: Turtle in a Pod is
 * parse-critical and read in full by every consumer, so an unbounded base64
 * literal would be paid for by readers that never open the attachment. This
 * SDK models the metadata node only; it neither reads nor writes the bytes.
 *
 * @see https://hl7.org/fhir/R4/datatypes.html#Attachment
 * @see https://cascadeprotocol.org/docs/cascade-protocol-schemas
 */

import type { CascadeEntity } from './common.js';

/**
 * Metadata for a binary document stored alongside a Pod's RDF (core v3.7).
 *
 * Required fields: `attachmentPath`, `contentHash`, `hashAlgorithm`. Those are
 * the three facts `cascade:AttachmentShape` requires at `sh:Violation` — where
 * the bytes are, what their digest is, and which algorithm produced it. The
 * media type is only an `sh:Warning`, because stored bytes with no stated type
 * are awkward to render but not lost.
 *
 * Serializes as `cascade:Attachment` in Turtle, as its own subject.
 */
export interface Attachment extends CascadeEntity {
  type: 'Attachment';

  /**
   * Location of the bytes, as a path RELATIVE to the Pod root, e.g.
   * `"attachments/sha-256/3f786850e387550fdab836ed7e6dc881de23001b"`.
   *
   * Never absolute and never a `file:` URL: a Pod is copied, exported and
   * re-rooted, and both break on the first of those. A `..` segment is
   * malformed rather than merely discouraged, because it turns an attachment
   * reference into a way to read a file the Pod does not contain.
   *
   * FHIR alignment: `Attachment.url`. NOT the URL the bytes were originally
   * fetched from; that is ordinary provenance and belongs on the attachment as
   * `prov:wasDerivedFrom`.
   *
   * Maps to `cascade:attachmentPath` in Turtle serialization.
   */
  attachmentPath: string;

  /**
   * Digest of the attachment bytes: LOWERCASE HEXADECIMAL, no algorithm prefix
   * and no separator. Byte-for-byte the file's name under
   * `attachments/{algorithm}/`, which is what makes the store verifiable — a
   * consumer hashes what it read and compares it with where it read it from.
   *
   * Lowercase hex rather than the base64 FHIR uses for `Attachment.hash`,
   * because this value is also a filename: base64's alphabet includes `/` and
   * is case-sensitive.
   *
   * Maps to `cascade:contentHash` in Turtle serialization.
   */
  contentHash: string;

  /**
   * Algorithm {@link Attachment.contentHash} was computed with, named by its
   * token in the IANA Named Information Hash Algorithm Registry (RFC 6920):
   * `"sha-256"`, `"sha-512"`. New implementations MUST write `"sha-256"`.
   *
   * Deliberately NOT FHIR's: `Attachment.hash` fixes SHA-1 in the
   * specification, and a collision-capable digest in a content-addressed store
   * is a mechanism for one document to silently replace another.
   *
   * Not enumerated as a union type here, because the registry grows and this
   * property exists precisely so the algorithm can be replaced.
   *
   * Maps to `cascade:hashAlgorithm` in Turtle serialization.
   */
  hashAlgorithm: string;

  /**
   * IANA media type of the bytes in RFC 6838 `type/subtype` form, e.g.
   * `"application/pdf"` or `"text/html"`. FHIR alignment:
   * `Attachment.contentType`.
   *
   * Stated in RDF rather than in the filename, because the filename is the
   * digest and must stay verifiable against the bytes; a media type in a
   * filename is a claim nothing checks.
   *
   * Maps to `cascade:attachmentMediaType` in Turtle serialization.
   */
  attachmentMediaType?: string;

  /**
   * Size of the attachment in bytes. FHIR alignment: `Attachment.size`; the
   * same quantity DCAT states with `dcat:byteSize`. Recorded so a consumer can
   * decide whether to read a file before opening it, and so a truncated copy is
   * detectable without rehashing.
   *
   * Maps to `cascade:byteSize` (`xsd:integer`) in Turtle serialization.
   */
  byteSize?: number;

  /**
   * Label to show in place of the bytes, verbatim from the source. FHIR
   * alignment: `Attachment.title`. Without it the only thing a reader can
   * display for an attachment is a digest.
   *
   * Maps to `cascade:attachmentTitle` in Turtle serialization.
   */
  attachmentTitle?: string;
}
