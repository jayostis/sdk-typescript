/**
 * JSON-LD conversion utilities for Cascade Protocol records.
 *
 * Converts between Cascade Protocol typed model objects and JSON-LD documents.
 * Uses the bundled context from `context.ts` for property mapping.
 *
 * @module jsonld
 */

import { NAMESPACES, PROPERTY_PREDICATES, buildReversePredicateMap } from '../vocabularies/namespaces.js';
import { recordTypeFor, recordTypeForClass } from '../record-types/index.js';
import { termFor } from '../terms/index.js';
import { CONTEXT_URI } from './context.js';
import type { CascadeEntity } from '../models/common.js';

// ─── Internal Helpers ───────────────────────────────────────────────────────

const REVERSE_PREDICATE_MAP = buildReversePredicateMap();

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Convert a Cascade Protocol record to a JSON-LD document.
 *
 * The resulting document includes:
 * - `@context` referencing the published Cascade Protocol context URI
 * - `@id` set to the record's `id`
 * - `@type` set to the full RDF type URI
 * - All record properties mapped to their predicate IRIs
 *
 * @param record - A typed Cascade Protocol record
 * @returns A JSON-LD document object
 *
 * @example
 * ```typescript
 * import { toJsonLd } from '@the-cascade-protocol/sdk';
 *
 * const jsonld = toJsonLd(myMedication);
 * // { "@context": "https://...", "@id": "urn:uuid:...", "@type": "clinical:Medication", ... }
 * ```
 */
export function toJsonLd(record: CascadeEntity): object {
  const recordType = recordTypeFor(record.type);
  if (!recordType) {
    throw new Error(`Unknown record type: ${record.type}. No TYPE_MAPPING found.`);
  }

  const doc: Record<string, unknown> = {
    '@context': CONTEXT_URI,
    '@id': record.id,
    '@type': recordType.rdfType,
  };

  // Widened once, as `serializeRecord` does at turtle-serializer.ts:642. A term
  // reads the whole record — that is what keeps `ruleByType` resolution in one
  // place — and `CascadeEntity` carries no index signature to read it through.
  const rec: Record<string, unknown> = { ...record };

  // Map all record properties to the JSON-LD doc
  for (const [key, value] of Object.entries(rec)) {
    if (key === 'id' || key === 'type' || value === undefined || value === null) continue;

    // A term owns this field in both formats, so it is written here and the
    // legacy chain below never sees it. First, and above `PROPERTY_PREDICATES`
    // deliberately: a termed field must not depend on a row in the table that
    // terms are replacing, or deleting that row would drop the field from every
    // JSON-LD document this SDK writes without a word. `emitField` forks in the
    // same place and for the same reason (turtle-serializer.ts:668).
    //
    // Everything below this point is the legacy chain. It shrinks as fields are
    // termed and goes away entirely when the last one moves.
    const term = termFor(key);
    if (term) {
      doc[key] = term.jsonLdFor(rec);
      continue;
    }

    const pred = PROPERTY_PREDICATES[key];
    if (!pred) continue;

    // dataProvenance gets expanded to a prefixed type reference
    if (key === 'dataProvenance') {
      doc[key] = `cascade:${String(value)}`;
      continue;
    }

    // All other values are passed through as-is; the JSON-LD context
    // will handle type coercion for dates, booleans, integers, etc.
    doc[key] = value;
  }

  return doc;
}

/**
 * The record type a JSON-LD `@type` names, written either way.
 *
 * `toJsonLd` writes a CURIE, but a document produced anywhere else may carry
 * the full IRI, and both name the same class. Tried as an IRI first because a
 * full IRI contains a colon too, so a CURIE test would claim `https` as its
 * prefix.
 */
function recordTypeOfJsonLd(rdfType: string): ReturnType<typeof recordTypeForClass> {
  const byIri = recordTypeForClass(rdfType);
  if (byIri) return byIri;

  const colonIdx = rdfType.indexOf(':');
  if (colonIdx < 0) return undefined;

  const namespace = (NAMESPACES as Record<string, string>)[rdfType.slice(0, colonIdx)];
  return namespace ? recordTypeForClass(`${namespace}${rdfType.slice(colonIdx + 1)}`) : undefined;
}

/**
 * Parse a JSON-LD document back to a typed Cascade Protocol record.
 *
 * Supports documents using the Cascade Protocol context (either inline
 * or by reference). Maps `@id` to `id`, `@type` to `type`, and all
 * known property IRIs back to their TypeScript model field names.
 *
 * @param doc - A JSON-LD document object
 * @returns A typed CascadeRecord
 *
 * @example
 * ```typescript
 * import { fromJsonLd } from '@the-cascade-protocol/sdk';
 * import type { Medication } from '@the-cascade-protocol/sdk';
 *
 * const med = fromJsonLd<Medication>(jsonldDoc);
 * ```
 */
export function fromJsonLd<T extends CascadeEntity>(doc: object): T {
  const raw = doc as Record<string, unknown>;
  const record: Record<string, unknown> = {};

  // Extract @id
  record['id'] = raw['@id'] ?? '';

  // Extract @type and resolve to local type name
  const rdfType = String(raw['@type'] ?? '');
  let typeName = rdfType;

  // Try to extract local name from prefixed or full URI type
  const colonIdx = rdfType.indexOf(':');
  if (colonIdx >= 0) {
    const prefix = rdfType.slice(0, colonIdx);
    const local = rdfType.slice(colonIdx + 1);
    // Check if it's a prefixed name
    if (prefix in NAMESPACES) {
      typeName = local;
    } else {
      typeName = local;
    }
  }

  // If full URI, extract local name
  for (const ns of Object.values(NAMESPACES)) {
    if (rdfType.startsWith(ns)) {
      typeName = rdfType.slice(ns.length);
      break;
    }
  }

  // Resolve to the canonical type name — the spelling `src/models/` declares.
  //
  // THE CLASS DECIDES, NOT THE LOCAL NAME. This used to scan
  // `TYPE_TO_MAPPING_KEY` for the first entry whose mapping had a matching
  // local name, which carried both of the defects the deserializer carried.
  // It broke the tie by key order, so `clinical:Procedure` came back as
  // `ProcedureRecord`; and it compared LOCAL NAMES, so
  // `clinical:SocialHistoryRecord` and `health:SocialHistoryRecord` were the
  // same string to it and whichever was written first won.
  //
  // Falls back to the bare local name, which is what a `@type` naming no
  // registered class already did. Reading is faithful: an unknown class is a
  // record this SDK has no model for, not a document to refuse.
  const resolvedType = recordTypeOfJsonLd(rdfType)?.name ?? typeName;
  record['type'] = resolvedType;

  // Map all other properties
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith('@') || value === undefined || value === null) continue;

    // The reading half of the same fork, in the same place and for the same
    // reason — see `toJsonLd`. What `jsonLdFor` added on the way out comes back
    // off here, so a record read out of its own JSON-LD is the record that
    // went in.
    const term = termFor(key);
    if (term) {
      record[key] = term.fromJsonLdValue(value, resolvedType);
      continue;
    }

    // Check if key is a known property name (short form from context)
    if (key in PROPERTY_PREDICATES) {
      // Handle dataProvenance: strip the "cascade:" prefix
      if (key === 'dataProvenance' && typeof value === 'string') {
        const cascadePrefix = 'cascade:';
        if (value.startsWith(cascadePrefix)) {
          record[key] = value.slice(cascadePrefix.length);
        } else {
          record[key] = value;
        }
        continue;
      }
      record[key] = value;
      continue;
    }

    // Check if key is a full IRI
    //
    // THE SAME FORK AGAIN, and it has to be. A full IRI and the short field
    // name are two spellings of one document — expansion is what a JSON-LD
    // processor emits, and `fromJsonLd` documents both as supported — so a
    // reading rule that reaches only the short branch lets the spelling the
    // caller happened to receive decide what they get back. What `jsonLdFor`
    // stamped on the way out (a nested node's `@type`) comes off here too;
    // without it the `@type` survives as a record field, `NESTED_SKIP` does not
    // hold it, and `serialize` writes it as the predicate `cascade:@type` —
    // not a PN_LOCAL, and so a document no parser accepts.
    const jsonKey = REVERSE_PREDICATE_MAP.get(key);
    if (jsonKey) {
      const iriTerm = termFor(jsonKey);
      record[jsonKey] = iriTerm ? iriTerm.fromJsonLdValue(value, resolvedType) : value;
      continue;
    }
  }

  return record as T;
}
