/**
 * Bundled JSON-LD context for offline use with Cascade Protocol data.
 *
 * The context is embedded inline so that no network fetch is required.
 * It maps short property names and type names to their full IRIs in the
 * Cascade Protocol vocabularies.
 *
 * @module jsonld
 */

import { NAMESPACES, PROPERTY_PREDICATES, TYPE_MAPPING } from '../vocabularies/namespaces.js';

/**
 * The canonical URI for the published Cascade Protocol JSON-LD context.
 *
 * Use this when you want to reference the context by URL (e.g., in a
 * JSON-LD document's `@context` field) rather than embedding it inline.
 */
export const CONTEXT_URI = 'https://cascadeprotocol.org/ns/context/v1/cascade.jsonld';

/**
 * Prefixes for pre-stable draft vocabularies (and the external namespaces used
 * only by them). Draft vocabs are NOT registered in VOCAB_VERSIONS and get NO
 * JSON-LD context until v1.0 graduation (per D-PATH / spec
 * PENDING_DOWNSTREAM_SYNC.md). Their namespaces and predicates are still
 * registered in namespaces.ts so Turtle terms round-trip and the reverse
 * predicate map resolves, but they are deliberately excluded from the generated
 * context here so it stays byte-identical to the released-only context. Remove a
 * prefix from this set when its vocabulary graduates to a released version.
 */
const DRAFT_CONTEXT_EXCLUDED_PREFIXES = new Set(['evidence', 'workbench', 'oa', 'ical', 'skos']);

/** Prefix of a `prefix:localName` CURIE, or '' if it has no colon. */
function curiePrefix(curie: string): string {
  const colonIdx = curie.indexOf(':');
  return colonIdx >= 0 ? curie.slice(0, colonIdx) : '';
}

/**
 * Build and return the Cascade Protocol JSON-LD context object.
 *
 * The context includes:
 * - All namespace prefix mappings
 * - Property-to-IRI mappings from PROPERTY_PREDICATES
 * - Type-to-IRI mappings from TYPE_MAPPING
 * - Typed literal annotations for date, boolean, integer, and double fields
 *
 * @returns A JSON-LD context object suitable for use in `@context`
 */
export function getContext(): object {
  const context: Record<string, unknown> = {};

  // Namespace prefixes (draft vocabularies excluded until v1.0 graduation)
  for (const [prefix, uri] of Object.entries(NAMESPACES)) {
    if (DRAFT_CONTEXT_EXCLUDED_PREFIXES.has(prefix)) continue;
    context[prefix] = uri;
  }

  // Add standard RDF namespace
  context['rdf'] = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';

  // Type mappings (RDF types as JSON-LD type aliases)
  for (const mapping of Object.values(TYPE_MAPPING)) {
    const colonIdx = mapping.rdfType.indexOf(':');
    if (colonIdx >= 0) {
      const localName = mapping.rdfType.slice(colonIdx + 1);
      context[localName] = mapping.rdfType;
    }
  }

  // Property predicates
  // Fields that need typed @id annotations
  const idTypedFields = new Set([
    'dataProvenance', 'emergencyContact', 'address', 'preferredPharmacy',
    // health v2.5: health:sleepQuality is emitted with an IRI object
    // (health:Good), never a string literal.
    'sleepQuality',
    // core v3.4: object properties whose range is a cascade:RecordSummary.
    'clinicalSummary', 'wellnessSummary',
    // clinical v1.10: the encounter grouping edge.
    'hasEncounter',
  ]);

  // Ordered rdf:List fields whose members are IRIs. @container: @list keeps the
  // order, which is meaningful for all four (core v3.4).
  const orderedIriListFields = new Set([
    'provenanceLayers', 'deviceSources', 'interactionScenarios', 'involvedResources',
  ]);

  // Unordered repeated object properties, one triple per IRI
  // (clinical v1.10-v1.12 graph edges).
  const iriSetFields = new Set([
    'indicationReference', 'parsedIndicationReference', 'linkedCondition',
    // core v3.7: the attachment edge. Repeatable, and its object is always an
    // IRI (cascade:HasAttachmentEdgeShape declares sh:nodeKind sh:IRI).
    'hasAttachment',
  ]);

  // Repeated object properties whose object is an inline NODE rather than a
  // bare IRI (clinical v1.16 hasParticipant). `@container: @set` keeps a single
  // participation an array on compaction, matching the model's
  // `EncounterParticipant[]`. Deliberately NOT given `@type: @id`: that coerces
  // a value to an IRI reference, which would misread the embedded blank node
  // these edges actually carry.
  const nodeSetFields = new Set(['hasParticipant']);

  // Fields that need xsd:dateTime typing
  const dateTimeFields = new Set([
    'startDate', 'endDate', 'onsetDate', 'performedDate', 'reportedDate',
    'administrationDate', 'effectiveDate', 'effectivePeriodStart', 'effectivePeriodEnd',
    'effectiveStart', 'effectiveEnd',
    'proxyGrantedAt', 'proxyRevokedAt',
    // core v3.4: dcterms:created on an export manifest.
    'created',
  ]);

  // Fields that need xsd:date typing
  const dateOnlyFields = new Set(['dateOfBirth', 'date']);

  // Fields that need xsd:boolean typing
  const booleanFields = new Set([
    'isActive', 'asNeeded',
    // core v3.4
    'requiresCrossProvenance',
  ]);

  // Fields that need xsd:integer typing
  const integerFields = new Set([
    'computedAge', 'refillsAllowed', 'supplyDurationDays', 'onsetAge',
    'steps', 'activeMinutes', 'calories', 'awakenings',
    'totalSleepMinutes', 'deepSleepMinutes', 'remSleepMinutes', 'lightSleepMinutes',
    'appliedTriplesCount',
    // core v3.4 — record summary counts (rdfs:subPropertyOf void:entities)
    'conditionCount', 'medicationCount', 'allergyCount', 'labResultCount',
    'immunizationCount', 'coverageCount', 'supplementCount',
    // core v3.4 — day counts (deliberately NOT void:entities subproperties)
    'vitalSignDays', 'heartRateDays', 'bloodPressureDays', 'activityDays', 'sleepDays',
    // core v3.4 — reading-level
    'sampleCount',
    // health v2.5 — daily snapshot
    'exerciseMinutes', 'standHours',
    // core v3.7 — attachment size in bytes
    'byteSize',
  ]);

  // Fields that need xsd:decimal/double typing
  const decimalFields = new Set([
    'generationTemperature',
    // health v2.5 — daily snapshot
    'activeEnergyKcal', 'durationHours',
  ]);

  // Fields that are URI references
  const uriRefFields = new Set([
    'rxNormCode', 'icd10Code', 'snomedCode', 'loincCode', 'testCode', 'drugCode',
  ]);

  for (const [key, pred] of Object.entries(PROPERTY_PREDICATES)) {
    // Draft-vocabulary predicates are excluded from the context until v1.0.
    if (DRAFT_CONTEXT_EXCLUDED_PREFIXES.has(curiePrefix(pred))) continue;
    if (idTypedFields.has(key)) {
      context[key] = { '@id': pred, '@type': '@id' };
    } else if (orderedIriListFields.has(key)) {
      context[key] = { '@id': pred, '@type': '@id', '@container': '@list' };
    } else if (iriSetFields.has(key)) {
      context[key] = { '@id': pred, '@type': '@id', '@container': '@set' };
    } else if (nodeSetFields.has(key)) {
      context[key] = { '@id': pred, '@container': '@set' };
    } else if (dateTimeFields.has(key)) {
      context[key] = { '@id': pred, '@type': 'xsd:dateTime' };
    } else if (dateOnlyFields.has(key)) {
      context[key] = { '@id': pred, '@type': 'xsd:date' };
    } else if (booleanFields.has(key)) {
      context[key] = { '@id': pred, '@type': 'xsd:boolean' };
    } else if (integerFields.has(key)) {
      context[key] = { '@id': pred, '@type': 'xsd:integer' };
    } else if (decimalFields.has(key)) {
      context[key] = { '@id': pred, '@type': 'xsd:decimal' };
    } else if (uriRefFields.has(key)) {
      context[key] = { '@id': pred, '@type': '@id' };
    } else {
      context[key] = pred;
    }
  }

  return { '@context': context };
}
