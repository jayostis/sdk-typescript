/**
 * High-level serialization functions for converting Cascade Protocol
 * data model objects to Turtle (RDF) format.
 *
 * Uses the {@link TurtleBuilder} internally and produces output conforming
 * to the Cascade Protocol conformance fixtures.
 *
 * @example
 * ```typescript
 * import { serialize, serializeMedication } from '@the-cascade-protocol/sdk';
 *
 * const turtle = serializeMedication(myMed);
 * // or generically:
 * const turtle2 = serialize(myRecord);
 * ```
 *
 * @module serializer
 */

import { TurtleBuilder, SubjectBuilder } from './turtle-builder.js';
import { NAMESPACES, PROPERTY_PREDICATES, TYPE_MAPPING, TYPE_TO_MAPPING_KEY } from '../vocabularies/namespaces.js';
import { predicateFor, termFor } from '../terms/index.js';
import { childPredicateFor, childPredicatesIn, ruleFor } from '../terms/term.js';
import type { CascadeEntity } from '../models/common.js';
import type { Medication } from '../models/medication.js';
import type { Condition } from '../models/condition.js';
import type { Allergy } from '../models/allergy.js';
import type { LabResult } from '../models/lab-result.js';
import type { VitalSign } from '../models/vital-sign.js';
import type { Immunization } from '../models/immunization.js';
import type { Procedure } from '../models/procedure.js';
import type { FamilyHistory } from '../models/family-history.js';
import type { Coverage } from '../models/coverage.js';
import type { PatientProfile } from '../models/patient-profile.js';
import type { ActivitySnapshot } from '../models/activity-snapshot.js';
import type { SleepSnapshot } from '../models/sleep-snapshot.js';

// ─── Internal Helpers ───────────────────────────────────────────────────────

/**
 * Type-specific predicate overrides.
 *
 * When a JSON field name maps to different RDF predicates depending on the
 * record type, these overrides take precedence over PROPERTY_PREDICATES.
 *
 * For example, `snomedCode` maps to `health:snomedCode` for Conditions
 * but `clinical:snomedCode` for VitalSigns.
 */
const TYPE_PREDICATE_OVERRIDES: Record<string, Record<string, string>> = {
  VitalSign: {
    snomedCode: 'clinical:snomedCode',
    interpretation: 'clinical:interpretation',
    // `interpretationSourceCode` is NOT here: it is declared by
    // `src/terms/interpretation-source-code.ts`, whose `predicateByType` says
    // the same thing. `emitField` and `collectPrefixes` both fork on `termFor`
    // ahead of this table, so a termed key never reaches
    // `getPredicateForField` — an entry left here would be a second copy of
    // one fact, unread, and free to drift from the one that is read.
  },
  // Core v3.4: the export-manifest classes carry cascade:notes, not the
  // health:notes that health records use. Same JSON key, different predicate.
  ExportManifest: {
    notes: 'cascade:notes',
  },
  RecordSummary: {
    notes: 'cascade:notes',
  },
  InteractionScenario: {
    notes: 'cascade:notes',
  },
  // Health v2.5: a daily snapshot carries cascade:date, per
  // health:DailyActivitySnapshotShape / health:DailySleepSnapshotShape. The
  // 7-day aggregate ActivitySnapshot / SleepSnapshot carry health:date. Both
  // spellings mean the same thing and readers accept both; this decides which
  // one is WRITTEN.
  DailyActivitySnapshot: {
    date: 'cascade:date',
  },
  DailySleepSnapshot: {
    date: 'cascade:date',
  },
  // Coverage v1.5: `status` already resolves to health:status (a condition's
  // clinical status), so the coverage spelling has to be selected by record
  // type. Declared for InsurancePlan ONLY, not for CoverageRecord: coverage:
  // status has rdfs:domain coverage:InsurancePlan, and asserting it on a
  // subject typed clinical:CoverageRecord would entail, to a reasoner, that the
  // subject is an InsurancePlan.
  //
  // KNOWN GAP, recorded rather than papered over: TYPE_MAPPING resolves BOTH
  // 'CoverageRecord' and 'InsurancePlan' to rdfType clinical:CoverageRecord, so
  // this SDK cannot currently emit a coverage:InsurancePlan subject at all. The
  // predicate is therefore correct while the subject's class is not. Retargeting
  // 'InsurancePlan' would change what every existing record serializes as, which
  // is a migration and not part of a vocabulary sync.
  InsurancePlan: {
    status: 'coverage:status',
  },
};

/**
 * Get the predicate for a given field and record type, respecting overrides.
 */
function getPredicateForField(key: string, recordType: string): string | undefined {
  const overrides = TYPE_PREDICATE_OVERRIDES[recordType];
  if (overrides && key in overrides) {
    return overrides[key];
  }
  return PROPERTY_PREDICATES[key];
}

/**
 * Fields whose values should be serialized as URI references (angle-bracket enclosed)
 * rather than string literals, when the value looks like a full URI.
 */
const URI_FIELDS = new Set([
  'rxNormCode',
  'icd10Code',
  'snomedCode',
  'loincCode',
  'testCode',
  // Core v3.4: object properties whose range is a cascade:RecordSummary.
  'clinicalSummary',
  'wellnessSummary',
  // Clinical v1.10: the encounter grouping edge. Always an IRI.
  'hasEncounter',
  // Core v3.7: the attachment edge. Always an IRI —
  // cascade:HasAttachmentEdgeShape declares sh:nodeKind sh:IRI so the record and
  // the attachment can live in different files. Listed here as well as in
  // IRI_ARRAY_FIELDS so that a caller passing a single bare IRI (rather than a
  // one-element array) still gets a resource, not a quoted literal.
  'hasAttachment',
]);

/**
 * String-valued properties whose vocabulary cardinality is `0..*`.
 *
 * Each accepts a bare value or an array, and each value becomes its own
 * repeated-predicate triple in the order given. Never an `rdf:List`: none of
 * these vocabularies declares an order, and the SHACL shapes count triples.
 *
 * Membership is by FIELD NAME rather than by record type, because that is the
 * only thing this serializer knows: `getPredicateForField` resolves the
 * namespace per type (a VitalSign writes `clinical:snomedCode`, a Condition
 * writes `health:snomedCode`), but the cardinality decision is made before any
 * type context is available. Applying it uniformly is also correct: no shape
 * caps any member at one.
 *
 * Distinct from {@link IRI_ARRAY_FIELDS}, whose values are resources rather
 * than literals.
 */
const MULTI_VALUE_FIELDS = new Set([
  // health v2.6 / clinical v1.14: `sh:maxCount 1` was removed because FHIR R4
  // `Observation.category` is 0..* and `CodeableConcept.coding` is 0..*.
  'testCode',
  'labCategory',
  'icd10Code',
  'snomedCode',
  // clinical v1.16. Encounter.reasonCode is 0..*; Encounter.identifier and the
  // `.identifier` element of every other FHIR resource are 0..*;
  // DocumentReference.author is 0..*, and the sh:maxCount 1 on
  // clinical:providerName is what had been discarding every author past the
  // first. participantRoleCode is 0..* inside a participation blank node and is
  // listed here so the nested writer resolves its arity the same way.
  'encounterReason',
  'businessIdentifier',
  'documentAuthorName',
  'participantRoleCode',
]);

/**
 * Fields whose values are arrays of URIs or strings and should be serialized
 * as repeated predicate triples (one per value).
 */
const ARRAY_FIELDS = new Set([
  'drugCodes',
  'affectsVitalSigns',
  'monitoredVitalSigns',
]);

/**
 * Object-property fields whose values are arrays of IRIs, serialized as
 * repeated predicate triples (one per value).
 *
 * Distinct from {@link ARRAY_FIELDS}, which infers list-versus-repeated from
 * whether the values look like `http` URLs. Cascade record IRIs are `urn:uuid:`
 * and would fail that test, so the traversable graph edges added in clinical
 * v1.10–v1.12 are declared explicitly instead of guessed at.
 */
const IRI_ARRAY_FIELDS = new Set([
  'indicationReference',
  'parsedIndicationReference',
  'linkedCondition',
  // Core v3.7: one report legitimately has a PDF and an HTML rendering of the
  // same content, so the edge repeats. Each value is a cascade:Attachment IRI.
  'hasAttachment',
]);

/**
 * Fields serialized as an `rdf:List` whose members are IRIs or prefixed names,
 * e.g. `cascade:deviceSources ( <urn:uuid:a> <urn:uuid:b> )`.
 *
 * The core v3.4 manifest declares these `rdfs:range rdf:List`, so the order is
 * meaningful and a repeated predicate would lose it.
 */
const IRI_LIST_FIELDS = new Set([
  'provenanceLayers',
  'deviceSources',
  'interactionScenarios',
  'involvedResources',
]);

/**
 * Fields whose value is a bare local name in JSON but an IRI in Turtle, keyed
 * by the namespace prefix to qualify it with.
 *
 * `dataProvenance` is handled separately (it predates this map). The health
 * v2.5 sleep-quality individuals work the same way: `sleepQuality: 'Good'`
 * serializes as `health:sleepQuality health:Good`.
 */
const PREFIXED_ENUM_FIELDS: Record<string, string> = {
  sleepQuality: 'health',
};

/**
 * Explicit set of fields that are dateTime-typed even though their names
 * don't contain "date" or "time" as a substring.
 */
const EXPLICIT_DATETIME_FIELDS = new Set([
  'effectivePeriodStart',
  'effectivePeriodEnd',
  'effectiveStart',
  'effectiveEnd',
  // Core v3.4: dcterms:created on an export manifest. Required to be
  // xsd:dateTime by cascade:ExportManifestShape, and the name contains neither
  // "date" nor "time", so the heuristic below would miss it.
  'created',
]);

/**
 * Record types whose `date` field is a full `xsd:dateTime` rather than the
 * bare `YYYY-MM-DD` the aggregate snapshots carry.
 *
 * `health:DailyActivitySnapshotShape` and `health:DailySleepSnapshotShape` both
 * declare `cascade:date` with `sh:datatype xsd:dateTime` (health v2.5).
 */
const DATETIME_DATE_TYPES = new Set([
  'DailyActivitySnapshot',
  'DailySleepSnapshot',
]);

/**
 * Fields whose values contain date/time and get ^^xsd:dateTime typing.
 * We check the key name and a set of explicit fields.
 */
function isDateTimeField(key: string, recordType?: string): boolean {
  if (EXPLICIT_DATETIME_FIELDS.has(key)) return true;
  const lower = key.toLowerCase();
  // Specific date-only field
  if (key === 'dateOfBirth') return false;
  if (key === 'date') return recordType !== undefined && DATETIME_DATE_TYPES.has(recordType);
  return lower.includes('date') || lower.includes('time');
}

/**
 * Fields whose values are date-only (no time component) and get ^^xsd:date typing.
 */
function isDateOnlyField(key: string): boolean {
  return key === 'dateOfBirth';
}

/**
 * Fields that represent integers with ^^xsd:integer typing in the expected output.
 */
const INTEGER_FIELDS = new Set([
  'computedAge',
  'refillsAllowed',
  'supplyDurationDays',
  'onsetAge',
  // Core v3.4 cascade:RecordSummary counts. cascade:RecordSummaryShape declares
  // every one of them sh:datatype xsd:integer.
  'conditionCount',
  'medicationCount',
  'allergyCount',
  'labResultCount',
  'immunizationCount',
  'coverageCount',
  'supplementCount',
  'vitalSignDays',
  'heartRateDays',
  'bloodPressureDays',
  'activityDays',
  'sleepDays',
  // Core v3.7: cascade:AttachmentShape declares sh:datatype xsd:integer.
  'byteSize',
]);

/**
 * Nested-object fields that serialize as a typed blank node, keyed by the
 * `rdf:type` the blank node carries.
 */
const BLANK_NODE_TYPES: Record<string, string> = {
  // The three patient-profile sub-structures are NOT here. `emergencyContact`,
  // `address` and `preferredPharmacy` are term modules, and `emitField` returns
  // before this table for a termed key, so a row would be a second copy of a
  // fact `src/terms/` owns — and the copy that a reader looking for the
  // `rdf:type` of a contact would find first (#27).
  // Core v3.4: an export manifest carries its per-domain summaries inline.
  wellnessSummary: 'cascade:RecordSummary',
  // Clinical v1.16: one participation in an encounter.
  // clinical:EncounterParticipantShape deliberately omits sh:nodeKind sh:IRI
  // ("requiring an IRI would forbid the blank node a serializer may reasonably
  // write for a structural sub-node"), so the inline form is conformant.
  hasParticipant: 'clinical:EncounterParticipant',
};

/**
 * Namespace prefix to qualify a blank node's NESTED predicates with, keyed by
 * the parent field name. Defaults to `cascade` when a field is absent.
 *
 * The nested predicates are built from the prefix and the JSON key rather than
 * looked up in `PROPERTY_PREDICATES`, because the pre-existing patient-profile
 * sub-structures carry keys that resolve differently at the top level: a
 * `name` inside an `emergencyContact` is `cascade:name`, while the top-level
 * `name` is `foaf:name`. A blanket lookup would silently rewrite output that
 * has been stable since those sub-structures were introduced.
 */
const BLANK_NODE_PREDICATE_PREFIXES: Record<string, string> = {
  hasParticipant: 'clinical',
};

/**
 * Fields whose value is an ARRAY of nested objects, each serialized as its own
 * blank node under a repeated predicate.
 *
 * Distinct from the single-object blank nodes above: `clinical:hasParticipant`
 * is 0..* because a visit routinely carries an attender, a referrer and an
 * authorizing physician at once, and which of them actually saw the patient is
 * only answerable if all of them are kept with their roles attached.
 */
const BLANK_NODE_ARRAY_FIELDS = new Set(['hasParticipant']);

/**
 * Every table above that is keyed by JSON FIELD NAME, under its own name.
 *
 * The tables are module-private and stay that way; this aggregate exists so one
 * invariant can be asserted across all of them at once — a name in any of them
 * is a key of `PROPERTY_PREDICATES`. It is not part of the package's public
 * surface: `src/serializer/index.ts` and `src/index.ts` both re-export by name,
 * so nothing outside this repo can reach it.
 *
 * A table added above and left out here is unchecked, which is the one way this
 * can be wrong without anything saying so.
 *
 * `TYPE_PREDICATE_OVERRIDES` and `DATETIME_DATE_TYPES` are absent on purpose:
 * their keys are record types, not field names.
 */
export const SERIALIZER_FIELD_TABLES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  URI_FIELDS: [...URI_FIELDS],
  MULTI_VALUE_FIELDS: [...MULTI_VALUE_FIELDS],
  ARRAY_FIELDS: [...ARRAY_FIELDS],
  IRI_ARRAY_FIELDS: [...IRI_ARRAY_FIELDS],
  IRI_LIST_FIELDS: [...IRI_LIST_FIELDS],
  PREFIXED_ENUM_FIELDS: Object.keys(PREFIXED_ENUM_FIELDS),
  EXPLICIT_DATETIME_FIELDS: [...EXPLICIT_DATETIME_FIELDS],
  INTEGER_FIELDS: [...INTEGER_FIELDS],
  BLANK_NODE_TYPES: Object.keys(BLANK_NODE_TYPES),
  BLANK_NODE_PREDICATE_PREFIXES: Object.keys(BLANK_NODE_PREDICATE_PREFIXES),
  BLANK_NODE_ARRAY_FIELDS: [...BLANK_NODE_ARRAY_FIELDS],
});

/**
 * Fields that are boolean and should be serialized unquoted.
 */
function isBooleanField(_key: string, value: unknown): boolean {
  return typeof value === 'boolean';
}

/**
 * Determine which prefixes are needed for a given record.
 */
function collectPrefixes(record: CascadeEntity): Map<string, string> {
  const prefixes = new Map<string, string>();

  // Always include cascade and xsd
  prefixes.set('cascade', NAMESPACES.cascade);
  prefixes.set('xsd', NAMESPACES.xsd);

  // Get the rdfType to determine base vocabulary
  const mappingKey = TYPE_TO_MAPPING_KEY[record.type];
  if (mappingKey) {
    const mapping = TYPE_MAPPING[mappingKey];
    if (mapping) {
      const rdfType = mapping.rdfType;
      const nsPrefix = rdfType.split(':')[0];
      if (nsPrefix && nsPrefix in NAMESPACES) {
        prefixes.set(nsPrefix, NAMESPACES[nsPrefix as keyof typeof NAMESPACES]);
      }
    }
  }

  // Scan all fields and add namespaces for predicates and URI values
  for (const [key, value] of Object.entries(record)) {
    if (key === 'id' || key === 'type' || value === undefined || value === null) continue;

    // The same fork `emitField` takes at the write step, and it has to be
    // taken here too. A term resolves its own predicate out of `predicate` /
    // `predicateByType`, so asking `getPredicateForField` for a TERMED field is
    // a second, independent answer to "which namespace does this field write
    // under" — and the two answers decide different halves of one document.
    // This one picks the `@prefix` lines the header declares; the other picks
    // what the subject block writes.
    //
    // Harmless while they agree, which they do for every term shipped today.
    // It stops being harmless at the first term that re-prefixes a field per
    // type — the shape every `TYPE_PREDICATE_OVERRIDES` entry already has, e.g.
    // `snomedCode` under `clinical:` on a VitalSign. Resolved the old way, the
    // header would declare `health:` and the subject block would write
    // `clinical:snomedCode` under a prefix that was never declared. That is not
    // a wrong triple: it is a document that does not parse, and it fails on the
    // whole record rather than on the field.
    const term = termFor(key);
    const pred = term ? predicateFor(term, record.type) : getPredicateForField(key, record.type);
    if (pred) addPrefixForPredicate(pred, prefixes);

    // A blank node's CHILD predicates, which can now leave the node's own
    // namespace: a `cascade:RecordSummary` inherits `sourceRecordId` from
    // `CascadeEntity` and writes it `health:sourceRecordId` inside a node
    // written under `cascade:`. The loop above sees only the top-level field,
    // and the same reasoning that put `predicateFor` here applies one level
    // down — the header is decided here and the triple is written by
    // `childrenOf`, so both have to be asked the same question.
    if (term) {
      for (const childPred of childPredicatesIn(ruleFor(term, record.type), value)) {
        addPrefixForPredicate(childPred, prefixes);
      }
    }

    // Check URI values for namespace references. A 0..* code property needs a
    // prefix declared for EVERY member, not only the first: two codings from
    // two systems must both be declared.
    if (URI_FIELDS.has(key)) {
      for (const item of Array.isArray(value) ? value : [value]) {
        if (typeof item === 'string') addPrefixForUri(item, prefixes);
      }
    }
    if (Array.isArray(value) && ARRAY_FIELDS.has(key)) {
      for (const item of value) {
        if (typeof item === 'string' && item.startsWith('http')) {
          addPrefixForUri(item, prefixes);
        }
      }
    }
  }

  return prefixes;
}

/**
 * Declare the namespace of a `prefix:localName` predicate.
 *
 * A no-op for an absolute-IRI predicate — `<https://other.example.org/ns#wardCount>`
 * carries its own namespace and needs no `@prefix` line — and for a prefix
 * `NAMESPACES` does not declare, which is unwritable rather than undeclared and
 * is refused where it is written, not here.
 */
function addPrefixForPredicate(predicate: string, prefixes: Map<string, string>): void {
  const nsPrefix = predicate.split(':')[0];
  if (nsPrefix && nsPrefix in NAMESPACES) {
    prefixes.set(nsPrefix, NAMESPACES[nsPrefix as keyof typeof NAMESPACES]);
  }
}

function addPrefixForUri(uri: string, prefixes: Map<string, string>): void {
  for (const [prefix, ns] of Object.entries(NAMESPACES)) {
    if (uri.startsWith(ns) || uri.startsWith(ns.replace(/#$/, '/'))) {
      prefixes.set(prefix, ns);
      break;
    }
  }
}

/**
 * Determine the stable order for prefix declarations.
 * The order follows: cascade, health, clinical, coverage, then
 * external namespaces (rxnorm, sct, loinc, icd10, foaf), then xsd.
 */
function sortedPrefixes(prefixes: Map<string, string>): [string, string][] {
  const order = [
    'cascade', 'health', 'clinical', 'coverage', 'checkup', 'pots',
    'fhir', 'rxnorm', 'sct', 'loinc', 'icd10', 'ucum',
    'prov', 'foaf', 'ldp', 'dcterms', 'xsd',
  ];
  const entries = Array.from(prefixes.entries());
  entries.sort((a, b) => {
    const ai = order.indexOf(a[0]);
    const bi = order.indexOf(b[0]);
    const aIdx = ai >= 0 ? ai : order.length;
    const bIdx = bi >= 0 ? bi : order.length;
    return aIdx - bIdx;
  });
  return entries;
}

// ─── Generic Serializer ─────────────────────────────────────────────────────

/**
 * Serialize any Cascade Protocol record to Turtle format.
 *
 * Dispatches based on the `type` field of the record. The output matches
 * the conformance fixture expected Turtle format.
 *
 * **This writer is FAITHFUL, never a gate.** It writes what it is given —
 * including data the shapes reject. A field capped at `sh:maxCount 1` and handed
 * two values gets two triples, because a shape can only judge what reached the
 * graph: a writer that dropped the second would hand the validator a record with
 * nothing left to violate, and a clean verdict on incomplete data is the failure
 * this SDK is least able to detect. Cardinality and value sets belong to
 * {@link validate}. `conformance/fixtures/lab-013.json` exists to be written and
 * then rejected, and a writer that refused it could not produce it at all.
 *
 * It still refuses to INVENT. A value with no expressible form — a scalar where
 * a rule declares a blank node, a nested array — throws naming the field, since
 * writing nothing is silent loss and writing something is fabrication. That is a
 * different question from whether the data is valid.
 *
 * @param record - Any CascadeRecord (Medication, Condition, VitalSign, etc.)
 * @returns A complete Turtle document string
 * @throws when a value has no serializable form, or the record type is unknown
 */
export function serialize(record: CascadeEntity): string {
  return serializeRecord(record);
}

/**
 * Internal workhorse that serializes any record.
 */
function serializeRecord(record: CascadeEntity): string {
  const mappingKey = TYPE_TO_MAPPING_KEY[record.type];
  const mapping = mappingKey ? TYPE_MAPPING[mappingKey] : undefined;
  if (!mapping) {
    throw new Error(`Unknown record type: ${record.type}. No TYPE_MAPPING found.`);
  }

  const prefixes = collectPrefixes(record);
  const builder = new TurtleBuilder();

  // Add prefixes in stable order
  for (const [name, uri] of sortedPrefixes(prefixes)) {
    builder.prefix(name, uri);
  }

  // Build the subject
  const subjectUri = record.id.startsWith('urn:') || record.id.startsWith('http')
    ? `<${record.id}>`
    : `<${record.id}>`;

  const sub = builder.subject(subjectUri);
  sub.type(mapping.rdfType);

  // Serialize fields in a deterministic order:
  // 1. The "name" field (primary identifier)
  // 2. Required CascadeRecord fields (dataProvenance, schemaVersion)
  //    are placed after the type-specific required fields
  // 3. All other fields in their natural object order

  const rec: Record<string, unknown> = { ...record };

  // Collect field entries, preserving the order they appear in the record,
  // but ensuring a deterministic output that matches the conformance fixtures.
  const fieldOrder = Object.keys(rec);

  // Track fields we've already emitted
  const emitted = new Set<string>();

  // Helper to emit a single field
  const emitField = (key: string): void => {
    if (emitted.has(key)) return;
    emitted.add(key);

    const value = rec[key];
    if (value === undefined || value === null) return;
    if (key === 'id' || key === 'type') return;

    // A term module owns this field's predicate and rule, so it writes it and
    // the type-driven chain below never sees it. Placed AFTER the three guards
    // above rather than at the top of the function: jumping them would leave a
    // termed field out of `emitted` and run `outputsFor` on an absent value.
    //
    // `termFor` is undefined for every field no module claims, which is all of
    // them but one — so this fork's job is to RETURN CONTROL, and everything
    // below is reached exactly as often as it is today.
    const term = termFor(key);
    if (term) {
      sub.addAll(term.outputsFor(rec));
      return;
    }

    const pred = getPredicateForField(key, record.type);
    if (!pred) return;

    // dataProvenance is special: value is a prefixed name
    if (key === 'dataProvenance') {
      sub.uri(pred, `cascade:${String(value)}`);
      return;
    }

    // Bare local names that serialize as prefixed IRIs (e.g. sleepQuality).
    const enumPrefix = PREFIXED_ENUM_FIELDS[key];
    if (enumPrefix && typeof value === 'string') {
      sub.uri(pred, `${enumPrefix}:${value}`);
      return;
    }

    // rdf:List of IRIs / prefixed names. Order is meaningful, so these are
    // never flattened into repeated predicates.
    if (IRI_LIST_FIELDS.has(key) && Array.isArray(value)) {
      if (value.length === 0) return;
      const items = value.map((item) =>
        key === 'provenanceLayers' ? `cascade:${String(item)}` : String(item),
      );
      sub.uriList(pred, items);
      return;
    }

    // Repeated object-property triples, one per IRI.
    if (IRI_ARRAY_FIELDS.has(key) && Array.isArray(value)) {
      for (const item of value) {
        sub.uri(pred, String(item));
      }
      return;
    }

    // Repeated blank nodes, one per nested object (clinical v1.16
    // hasParticipant). Checked BEFORE the generic array handling below, which
    // would otherwise stringify each object into a literal.
    if (BLANK_NODE_ARRAY_FIELDS.has(key) && Array.isArray(value)) {
      for (const item of value) {
        if (item === undefined || item === null || typeof item !== 'object') continue;
        serializeBlankNode(sub, pred, key, item as Record<string, unknown>);
      }
      return;
    }

    // 0..* code properties (health v2.6, clinical v1.14). One triple per value,
    // in the order given, whether the caller passed a bare value or an array.
    // Object form (URI reference vs literal) is unchanged from the single-value
    // case, so a record carrying one code serializes byte-identically to before.
    if (MULTI_VALUE_FIELDS.has(key) && (typeof value === 'string' || Array.isArray(value))) {
      const values = (Array.isArray(value) ? value : [value]).filter(
        (item): item is string => typeof item === 'string',
      );
      if (values.length === 0) return;
      for (const item of values) {
        if (URI_FIELDS.has(key)) {
          sub.uri(pred, item);
        } else {
          sub.literal(pred, item);
        }
      }
      return;
    }

    // Array fields (repeated predicates for URI lists, RDF list for string lists)
    if (Array.isArray(value) && ARRAY_FIELDS.has(key)) {
      if (value.length === 0) return;
      // Check if items look like URIs
      const isUriList = value.every((item) => typeof item === 'string' && item.startsWith('http'));
      if (isUriList) {
        for (const item of value) {
          sub.uri(pred, item as string);
        }
      } else {
        sub.list(pred, value.map(String));
      }
      return;
    }

    // Everything left is written MEMBER BY MEMBER — one triple per value, in
    // the order given, whether the caller passed a scalar or an array.
    //
    // The mirror of the reader's `convertObject`. Arity and form are separate
    // questions: the branches above decide the shape of the FIELD (an rdf:List,
    // a set of blank nodes), and `emitMember` decides the form of one VALUE.
    // Keeping them apart is what lets a repeated predicate come back off the
    // graph and go straight out again — a document carrying two health:reaction
    // triples is read as two values and written as two triples, where a writer
    // that only understood scalars had to drop one or refuse the record.
    for (const member of Array.isArray(value) ? value : [value]) {
      if (member === undefined || member === null) continue;
      emitMember(key, pred, member);
    }
  };

  /**
   * One value of a field, in whatever form its type calls for.
   *
   * Every branch here is about the VALUE, never the field's arity, which is why
   * the same function serves a scalar and each member of an array.
   */
  const emitMember = (key: string, pred: string, value: unknown): void => {
    if (isBooleanField(key, value)) {
      sub.boolean(pred, value as boolean);
      return;
    }

    if (INTEGER_FIELDS.has(key) && typeof value === 'number') {
      sub.integer(pred, value);
      return;
    }

    // Plain, untyped numeric literals (clinical:value, referenceRangeLow,
    // health:steps). RDF 1.1 types a bare 8432 as xsd:integer and 7.4 as
    // xsd:decimal.
    if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        sub.number(pred, value);
      } else {
        sub.decimal(pred, value);
      }
      return;
    }

    if (URI_FIELDS.has(key) && typeof value === 'string') {
      sub.uri(pred, value);
      return;
    }

    if (isDateOnlyField(key) && typeof value === 'string') {
      sub.date(pred, value);
      return;
    }

    if (isDateTimeField(key, record.type) && typeof value === 'string') {
      sub.dateTime(pred, value);
      return;
    }

    // Nested objects (blank nodes): patient-profile sub-structures and the
    // core v3.4 manifest record summaries.
    if (typeof value === 'object' && !Array.isArray(value)) {
      serializeBlankNode(sub, pred, key, value as Record<string, unknown>);
      return;
    }

    if (typeof value === 'string') {
      sub.literal(pred, value);
      return;
    }

    // A member no branch above claims — a nested array, a symbol, a function.
    // #15's throw stood here and named the whole FIELD, on the reasoning that a
    // value written nowhere is worse than an error. That reasoning is kept and
    // narrowed: an array is no longer unwritable, so what remains is a single
    // value with no form, and the error says which one rather than condemning
    // the field it sits in.
    throw new Error(
      `No serialization rule for ${Array.isArray(value) ? 'a nested array' : `a ${typeof value}`} ` +
        `in '${key}' (predicate ${pred})`,
    );
  };

  // Emit all fields in the order they appear in the object
  for (const key of fieldOrder) {
    emitField(key);
  }

  sub.done();
  return builder.build();
}

/**
 * Serialize a nested object as a Turtle blank node.
 */
function serializeBlankNode(
  sub: SubjectBuilder,
  predicate: string,
  key: string,
  obj: Record<string, unknown>,
): void {
  const bnodeType = BLANK_NODE_TYPES[key];
  const nsPrefix = BLANK_NODE_PREDICATE_PREFIXES[key] ?? 'cascade';

  sub.blankNode(predicate, (b) => {
    if (bnodeType) {
      b.type(bnodeType);
    }
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined || v === null) continue;
      // Nested fields are `type`-free sub-structures under one vocabulary.
      if (k === 'type' || k === 'id') continue;
      // Through the term module's spelling, not `${nsPrefix}:${k}` inline. This
      // is the UNTERMED nested path — `wellnessSummary`, `hasParticipant` —
      // and it takes children from the same faithful reader the termed path
      // does, including the absolute-IRI keys `recoverableChildKey` returns for
      // a predicate from another namespace. Abbreviated under this node's
      // prefix those produced `cascade:https://other.example.org/ns#wardCount`,
      // which is not a document a parser will take back. Undeclared, because
      // an untermed node has vouched for no child.
      const nestedPred = childPredicateFor(k, nsPrefix);

      // 0..* nested properties (clinical v1.16 participantRoleCode). One
      // repeated-predicate triple per value, arity preserved, matching how the
      // top-level writer treats a MULTI_VALUE_FIELDS member.
      if (MULTI_VALUE_FIELDS.has(k) && (typeof v === 'string' || Array.isArray(v))) {
        const values = (Array.isArray(v) ? v : [v]).filter(
          (item): item is string => typeof item === 'string',
        );
        for (const item of values) {
          b.literal(nestedPred, item);
        }
        continue;
      }

      if (INTEGER_FIELDS.has(k) && typeof v === 'number') {
        b.integer(nestedPred, v);
        continue;
      }
      if (typeof v === 'string') {
        b.literal(nestedPred, v);
      } else if (typeof v === 'boolean') {
        b.boolean(nestedPred, v);
      } else if (typeof v === 'number') {
        if (Number.isInteger(v)) {
          b.number(nestedPred, v);
        } else {
          b.decimal(nestedPred, v);
        }
      }
    }
  });
}

// ─── Type-Specific Serializers ──────────────────────────────────────────────

/** Serialize a Medication record to Turtle. */
export function serializeMedication(med: Medication): string {
  return serialize(med);
}

/** Serialize a Condition record to Turtle. */
export function serializeCondition(cond: Condition): string {
  return serialize(cond);
}

/** Serialize an Allergy record to Turtle. */
export function serializeAllergy(allergy: Allergy): string {
  return serialize(allergy);
}

/** Serialize a LabResult record to Turtle. */
export function serializeLabResult(lab: LabResult): string {
  return serialize(lab);
}

/** Serialize a VitalSign record to Turtle. */
export function serializeVitalSign(vital: VitalSign): string {
  return serialize(vital);
}

/** Serialize an Immunization record to Turtle. */
export function serializeImmunization(imm: Immunization): string {
  return serialize(imm);
}

/** Serialize a Procedure record to Turtle. */
export function serializeProcedure(proc: Procedure): string {
  return serialize(proc);
}

/** Serialize a FamilyHistory record to Turtle. */
export function serializeFamilyHistory(fam: FamilyHistory): string {
  return serialize(fam);
}

/** Serialize a Coverage record to Turtle. */
export function serializeCoverage(cov: Coverage): string {
  return serialize(cov);
}

/** Serialize a PatientProfile record to Turtle. */
export function serializePatientProfile(profile: PatientProfile): string {
  return serialize(profile);
}

/** Serialize an ActivitySnapshot record to Turtle. */
export function serializeActivitySnapshot(activity: ActivitySnapshot): string {
  return serialize(activity);
}

/** Serialize a SleepSnapshot record to Turtle. */
export function serializeSleepSnapshot(sleep: SleepSnapshot): string {
  return serialize(sleep);
}
