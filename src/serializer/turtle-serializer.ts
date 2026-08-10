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
]);

/**
 * Code properties whose vocabulary cardinality is `0..*` (health v2.6,
 * clinical v1.14): `sh:maxCount 1` was removed because FHIR R4
 * `Observation.category` is 0..* and `CodeableConcept.coding` is 0..*.
 *
 * Each accepts a bare value or an array, and each value becomes its own
 * repeated-predicate triple in the order given. Never an `rdf:List`: the
 * vocabulary declares no order, and the SHACL shapes count triples.
 *
 * Membership is by FIELD NAME rather than by record type, because that is the
 * only thing this serializer knows: `getPredicateForField` resolves the
 * namespace per type (a VitalSign writes `clinical:snomedCode`, a Condition
 * writes `health:snomedCode`), but the cardinality decision is made before any
 * type context is available. Applying it uniformly is also correct: no shape
 * still caps any of these four at one.
 */
const MULTI_VALUE_CODE_FIELDS = new Set([
  'testCode',
  'labCategory',
  'icd10Code',
  'snomedCode',
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
]);

/**
 * Nested-object fields that serialize as a typed blank node, keyed by the
 * `rdf:type` the blank node carries.
 */
const BLANK_NODE_TYPES: Record<string, string> = {
  emergencyContact: 'cascade:EmergencyContact',
  address: 'cascade:Address',
  preferredPharmacy: 'cascade:PharmacyInfo',
  // Core v3.4: an export manifest carries its per-domain summaries inline.
  clinicalSummary: 'cascade:RecordSummary',
  wellnessSummary: 'cascade:RecordSummary',
};

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

    const pred = getPredicateForField(key, record.type);
    if (pred) {
      const nsPrefix = pred.split(':')[0];
      if (nsPrefix && nsPrefix in NAMESPACES) {
        prefixes.set(nsPrefix, NAMESPACES[nsPrefix as keyof typeof NAMESPACES]);
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
 * @param record - Any CascadeRecord (Medication, Condition, VitalSign, etc.)
 * @returns A complete Turtle document string
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

    // 0..* code properties (health v2.6, clinical v1.14). One triple per value,
    // in the order given, whether the caller passed a bare value or an array.
    // Object form (URI reference vs literal) is unchanged from the single-value
    // case, so a record carrying one code serializes byte-identically to before.
    if (MULTI_VALUE_CODE_FIELDS.has(key) && (typeof value === 'string' || Array.isArray(value))) {
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

    // Boolean fields
    if (isBooleanField(key, value)) {
      sub.boolean(pred, value as boolean);
      return;
    }

    // Integer fields
    if (INTEGER_FIELDS.has(key) && typeof value === 'number') {
      sub.integer(pred, value);
      return;
    }

    // Number fields (plain, untyped literals like clinical:value,
    // referenceRangeLow, health:steps, health:durationHours). RDF 1.1 already
    // types a bare 8432 as xsd:integer and a bare 7.4 as xsd:decimal.
    if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        sub.number(pred, value);
      } else {
        sub.decimal(pred, value);
      }
      return;
    }

    // URI fields
    if (URI_FIELDS.has(key) && typeof value === 'string') {
      sub.uri(pred, value);
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

    // Date-only fields
    if (isDateOnlyField(key) && typeof value === 'string') {
      sub.date(pred, value);
      return;
    }

    // DateTime fields
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

    // Default: string literal
    if (typeof value === 'string') {
      sub.literal(pred, value);
      return;
    }
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

  sub.blankNode(predicate, (b) => {
    if (bnodeType) {
      b.type(bnodeType);
    }
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined || v === null) continue;
      // Nested fields are `type`-free sub-structures under the cascade: vocabulary.
      if (k === 'type' || k === 'id') continue;
      const nestedPred = `cascade:${k}`;
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
