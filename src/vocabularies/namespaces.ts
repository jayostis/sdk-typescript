/**
 * Cascade Protocol namespace URIs and vocabulary constants.
 *
 * These constants map directly to the RDF namespace prefixes used
 * in Turtle serialization throughout the Cascade Protocol ecosystem.
 *
 * @see https://cascadeprotocol.org/docs/cascade-protocol-schemas
 */

// ─── Namespace URIs ──────────────────────────────────────────────────────────

/**
 * Cascade Protocol namespace URIs.
 *
 * Used as RDF prefixes in Turtle serialization. Each entry maps a
 * short prefix name to its full IRI.
 *
 * @example
 * ```typescript
 * import { NAMESPACES } from '@the-cascade-protocol/sdk';
 *
 * // Use in Turtle prefix declarations
 * const prefix = `@prefix cascade: <${NAMESPACES.cascade}> .`;
 * ```
 */
export const NAMESPACES = {
  /** Cascade Protocol core vocabulary (v1). */
  cascade: 'https://ns.cascadeprotocol.org/core/v1#',

  /** Cascade Protocol clinical vocabulary (v1). */
  clinical: 'https://ns.cascadeprotocol.org/clinical/v1#',

  /** Cascade Protocol health/wellness vocabulary (v1). */
  health: 'https://ns.cascadeprotocol.org/health/v1#',

  /** Cascade Protocol checkup vocabulary (v1). */
  checkup: 'https://ns.cascadeprotocol.org/checkup/v1#',

  /** Cascade Protocol POTS vocabulary (v1). */
  pots: 'https://ns.cascadeprotocol.org/pots/v1#',

  /** Cascade Protocol coverage/insurance vocabulary (v1). */
  coverage: 'https://ns.cascadeprotocol.org/coverage/v1#',

  /** HL7 FHIR namespace. */
  fhir: 'http://hl7.org/fhir/',

  /** SNOMED CT namespace. */
  sct: 'http://snomed.info/sct/',

  /** ICD-10-CM namespace. */
  icd10: 'http://hl7.org/fhir/sid/icd-10-cm/',

  /** LOINC namespace. */
  loinc: 'http://loinc.org/rdf#',

  /** RxNorm namespace. */
  rxnorm: 'http://www.nlm.nih.gov/research/umls/rxnorm/',

  /** W3C PROV-O namespace. */
  prov: 'http://www.w3.org/ns/prov#',

  /** XML Schema datatypes namespace. */
  xsd: 'http://www.w3.org/2001/XMLSchema#',

  /** Unified Code for Units of Measure namespace. */
  ucum: 'http://unitsofmeasure.org/',

  /** FOAF (Friend of a Friend) namespace for personal info. */
  foaf: 'http://xmlns.com/foaf/0.1/',

  /** vCard namespace for contact information. */
  vcard: 'http://www.w3.org/2006/vcard/ns#',

  /** Solid Terms namespace for WebID profile discovery. */
  solid: 'http://www.w3.org/ns/solid/terms#',

  /** Personal Information Management (PIM) namespace for Solid storage discovery. */
  pim: 'http://www.w3.org/ns/pim/space#',

  /** Linked Data Platform namespace. */
  ldp: 'http://www.w3.org/ns/ldp#',

  /** Dublin Core Terms namespace. */
  dcterms: 'http://purl.org/dc/terms/',

  /**
   * W3C DCAT 3 namespace. `cascade:ExportManifest` is `rdfs:subClassOf
   * dcat:Dataset` (core v3.4): a pod export is a published dataset with a
   * title, description, creation date and publisher, which DCAT already
   * standardises.
   * @see https://www.w3.org/TR/vocab-dcat-3/
   */
  dcat: 'http://www.w3.org/ns/dcat#',

  /**
   * W3C VoID namespace. `cascade:RecordSummary` is `rdfs:subClassOf
   * void:Dataset` and every per-domain count property is
   * `rdfs:subPropertyOf void:entities` paired with the `void:class` it counts
   * (core v3.4), so a VoID-aware consumer can read Cascade record counts with
   * no Cascade-specific code.
   * @see https://www.w3.org/TR/void/
   */
  void: 'http://rdfs.org/ns/void#',

  // ── Draft vocabularies (v1-draft) ─────────────────────────────────────────
  // NOT registered in VOCAB_VERSIONS until v1.0 graduation (per D-PATH), and
  // deliberately EXCLUDED from the generated JSON-LD context (see
  // DRAFT_CONTEXT_EXCLUDED_PREFIXES in src/jsonld/context.ts). Registered here so
  // their terms round-trip in Turtle and the reverse predicate map resolves.
  /** Cascade Protocol evidence vocabulary (v1-draft): grounding/assertion facets. */
  evidence: 'https://ns.cascadeprotocol.org/evidence/v1#',
  /** Cascade Protocol workbench vocabulary (v1-draft): investigation app, notes. */
  workbench: 'https://ns.cascadeprotocol.org/workbench/v1#',
  /** W3C Web Annotation namespace: notes substrate (body/target/motivation/selectors). */
  oa: 'http://www.w3.org/ns/oa#',
  /** W3C RDF Calendar (iCalendar) namespace: follow-up due date / status. */
  ical: 'http://www.w3.org/2002/12/cal/ical#',
  /** SKOS namespace: workbench:followUp is an oa:Motivation with skos:broader. */
  skos: 'http://www.w3.org/2004/02/skos/core#',
} as const;

/**
 * Type representing all known namespace prefix keys.
 */
export type NamespacePrefix = keyof typeof NAMESPACES;

// ─── Type Mapping ────────────────────────────────────────────────────────────

/**
 * Mapping from data type key (as used in Pod file paths and CLI queries)
 * to the corresponding RDF type, name field key, and name predicate.
 *
 * Used during serialization and deserialization to determine:
 * - `rdfType`: The `rdf:type` value for the record
 * - `nameKey`: The JSON property holding the record's display name
 * - `namePred`: The Turtle predicate for the name field
 *
 * @example
 * ```typescript
 * import { TYPE_MAPPING } from '@the-cascade-protocol/sdk';
 *
 * const medType = TYPE_MAPPING.medications;
 * // { rdfType: 'clinical:Medication', nameKey: 'medicationName', namePred: 'clinical:drugName' }
 * ```
 */
export const TYPE_MAPPING: Record<string, { rdfType: string; nameKey: string; namePred: string }> = {
  medications: {
    rdfType: 'clinical:Medication',
    nameKey: 'medicationName',
    namePred: 'clinical:drugName',
  },
  conditions: {
    rdfType: 'health:ConditionRecord',
    nameKey: 'conditionName',
    namePred: 'health:conditionName',
  },
  allergies: {
    rdfType: 'health:AllergyRecord',
    nameKey: 'allergen',
    namePred: 'health:allergen',
  },
  'lab-results': {
    rdfType: 'health:LabResultRecord',
    nameKey: 'testName',
    namePred: 'health:testName',
  },
  immunizations: {
    rdfType: 'health:ImmunizationRecord',
    nameKey: 'vaccineName',
    namePred: 'health:vaccineName',
  },
  'vital-signs': {
    rdfType: 'clinical:VitalSign',
    nameKey: 'vitalType',
    namePred: 'clinical:vitalType',
  },
  supplements: {
    rdfType: 'clinical:Supplement',
    nameKey: 'supplementName',
    namePred: 'clinical:supplementName',
  },
  // clinical v1.15: clinical:Procedure is the class clinical:ProcedureShape
  // targets. No vocabulary has ever defined health:ProcedureRecord or
  // health:procedureName and no shape targeted either, so procedure records
  // written under those spellings ran against zero constraints.
  // health:procedureName is still READ during the migration window; see
  // healthProcedureName below.
  procedures: {
    rdfType: 'clinical:Procedure',
    nameKey: 'procedureName',
    namePred: 'clinical:procedureName',
  },
  encounters: {
    rdfType: 'clinical:Encounter',
    nameKey: 'encounterType',
    namePred: 'clinical:encounterType',
  },
  'medication-administrations': {
    rdfType: 'clinical:MedicationAdministration',
    nameKey: 'medicationName',
    namePred: 'clinical:drugName',
  },
  'implanted-devices': {
    rdfType: 'clinical:ImplantedDevice',
    nameKey: 'deviceType',
    namePred: 'clinical:deviceType',
  },
  'imaging-studies': {
    rdfType: 'clinical:ImagingStudy',
    nameKey: 'studyDescription',
    namePred: 'clinical:studyDescription',
  },
  claims: {
    rdfType: 'coverage:ClaimRecord',
    nameKey: 'claimType',
    namePred: 'coverage:claimType',
  },
  'benefit-statements': {
    rdfType: 'coverage:BenefitStatement',
    nameKey: 'adjudicationStatus',
    namePred: 'coverage:adjudicationStatus',
  },
  'denial-notices': {
    rdfType: 'coverage:DenialNotice',
    nameKey: 'deniedProcedureCode',
    namePred: 'coverage:deniedProcedureCode',
  },
  appeals: {
    rdfType: 'coverage:AppealRecord',
    nameKey: 'appealLevel',
    namePred: 'coverage:appealLevel',
  },
  'family-history': {
    rdfType: 'health:FamilyHistoryRecord',
    nameKey: 'conditionName',
    namePred: 'health:conditionName',
  },
  insurance: {
    rdfType: 'clinical:CoverageRecord',
    nameKey: 'providerName',
    namePred: 'clinical:providerName',
  },
  'patient-profile': {
    rdfType: 'cascade:PatientProfile',
    nameKey: 'name',
    namePred: 'foaf:name',
  },
  activity: {
    rdfType: 'health:ActivitySnapshot',
    nameKey: 'date',
    namePred: 'health:date',
  },
  sleep: {
    rdfType: 'health:SleepSnapshot',
    nameKey: 'date',
    namePred: 'health:date',
  },
  'heart-rate': {
    rdfType: 'clinical:VitalSign',
    nameKey: 'vitalType',
    namePred: 'clinical:vitalType',
  },
  'blood-pressure': {
    rdfType: 'clinical:VitalSign',
    nameKey: 'vitalType',
    namePred: 'clinical:vitalType',
  },
  'clinical-social-history': {
    rdfType: 'clinical:SocialHistoryRecord',
    nameKey: 'socialHistoryCategory',
    namePred: 'clinical:socialHistoryCategory',
  },
  'ai-extraction-activities': {
    rdfType: 'cascade:AIExtractionActivity',
    nameKey: 'extractionModel',
    namePred: 'cascade:extractionModel',
  },
  'ai-discarded-extractions': {
    rdfType: 'cascade:AIDiscardedExtraction',
    nameKey: 'discardReason',
    namePred: 'cascade:discardReason',
  },
  'social-history-consents': {
    rdfType: 'cascade:SocialHistoryConsent',
    nameKey: 'consentScope',
    namePred: 'cascade:consentScope',
  },
  // Consumer-reported social history (health v2.4) — DISTINCT from the
  // EHR-extracted clinical:SocialHistoryRecord ('clinical-social-history').
  'social-history': {
    rdfType: 'health:SocialHistoryRecord',
    nameKey: 'smokingStatus',
    namePred: 'health:smokingStatus',
  },
  'advisory-application-activities': {
    rdfType: 'cascade:AdvisoryApplicationActivity',
    nameKey: 'appliedTriplesCount',
    namePred: 'cascade:appliedTriplesCount',
  },
  'ai-generation-activities': {
    rdfType: 'cascade:AIGenerationActivity',
    nameKey: 'extractionModel',
    namePred: 'cascade:extractionModel',
  },
  'proxy-agents': {
    rdfType: 'cascade:ProxyAgent',
    nameKey: 'proxyWebID',
    namePred: 'cascade:proxyWebID',
  },
  // ── Core v3.4 — pod export manifest ──
  'export-manifest': {
    rdfType: 'cascade:ExportManifest',
    nameKey: 'title',
    namePred: 'dcterms:title',
  },
  'record-summaries': {
    rdfType: 'cascade:RecordSummary',
    nameKey: 'domain',
    namePred: 'cascade:domain',
  },
  'interaction-scenarios': {
    rdfType: 'cascade:InteractionScenario',
    nameKey: 'title',
    namePred: 'dcterms:title',
  },
  // ── Health v2.5 — single-day snapshots inside the wellness history
  // containers. DISTINCT from the 7-day aggregate ActivitySnapshot /
  // SleepSnapshot above; both forms are emitted.
  'daily-activity': {
    rdfType: 'health:DailyActivitySnapshot',
    nameKey: 'date',
    namePred: 'cascade:date',
  },
  'daily-sleep': {
    rdfType: 'health:DailySleepSnapshot',
    nameKey: 'date',
    namePred: 'cascade:date',
  },
} as const;

// ─── Record Type to Mapping Key ─────────────────────────────────────────────

/**
 * Mapping from record type string (e.g. 'MedicationRecord') to the
 * TYPE_MAPPING key (e.g. 'medications') used for looking up rdfType,
 * nameKey, and namePred.
 *
 * Used by the serializer, deserializer, and JSON-LD converter to
 * dispatch on record type.
 */
export const TYPE_TO_MAPPING_KEY: Record<string, string> = {
  MedicationRecord: 'medications',
  Medication: 'medications',
  ConditionRecord: 'conditions',
  AllergyRecord: 'allergies',
  LabResultRecord: 'lab-results',
  ImmunizationRecord: 'immunizations',
  VitalSign: 'vital-signs',
  Supplement: 'supplements',
  ProcedureRecord: 'procedures',
  Procedure: 'procedures',
  Encounter: 'encounters',
  FamilyHistoryRecord: 'family-history',
  CoverageRecord: 'insurance',
  InsurancePlan: 'insurance',
  MedicationAdministration: 'medication-administrations',
  ImplantedDevice: 'implanted-devices',
  ImagingStudy: 'imaging-studies',
  ClaimRecord: 'claims',
  BenefitStatement: 'benefit-statements',
  DenialNotice: 'denial-notices',
  AppealRecord: 'appeals',
  PatientProfile: 'patient-profile',
  ActivitySnapshot: 'activity',
  SleepSnapshot: 'sleep',
  ClinicalSocialHistoryRecord: 'clinical-social-history',
  AIExtractionActivity: 'ai-extraction-activities',
  AIDiscardedExtraction: 'ai-discarded-extractions',
  SocialHistoryConsent: 'social-history-consents',
  SocialHistoryRecord: 'social-history',
  AdvisoryApplicationActivity: 'advisory-application-activities',
  AIGenerationActivity: 'ai-generation-activities',
  ProxyAgent: 'proxy-agents',
  ExportManifest: 'export-manifest',
  RecordSummary: 'record-summaries',
  InteractionScenario: 'interaction-scenarios',
  DailyActivitySnapshot: 'daily-activity',
  DailySleepSnapshot: 'daily-sleep',
};

// ─── Deprecated Type Aliases (clinical v1.13) ───────────────────────────────

/**
 * Deprecated `clinical:` class spellings and the `health:` class each one is
 * superseded by.
 *
 * Clinical v1.13 marked `clinical:LabResult`, `clinical:Condition`,
 * `clinical:Allergy` and `clinical:Immunization` `owl:deprecated true`, each
 * with an `rdfs:seeAlso` pointing at its `health:` equivalent. They were
 * **deprecated, not removed**: the pod export path is still their sole emitter
 * and existing pods contain them.
 *
 * The resulting asymmetry is deliberate and is implemented here:
 *
 * - **Readers accept both spellings.** {@link deserialize} resolves a requested
 *   record type to its `health:` RDF type *and* to any deprecated `clinical:`
 *   spelling listed here, so a pod written before v1.13 still reads back.
 * - **Writers emit only the `health:` form.** `TYPE_MAPPING` carries no entry
 *   for the deprecated classes, so nothing in this SDK can produce one.
 *
 * Keys and values are full RDF type IRIs.
 */
export const DEPRECATED_TYPE_ALIASES: Readonly<Record<string, string>> = {
  [`${NAMESPACES.clinical}LabResult`]: `${NAMESPACES.health}LabResultRecord`,
  [`${NAMESPACES.clinical}Condition`]: `${NAMESPACES.health}ConditionRecord`,
  [`${NAMESPACES.clinical}Allergy`]: `${NAMESPACES.health}AllergyRecord`,
  [`${NAMESPACES.clinical}Immunization`]: `${NAMESPACES.health}ImmunizationRecord`,
};

// ─── Wellness Container Classes (health v2.5) ───────────────────────────────

/**
 * The six wellness container classes and the class each is a subclass of.
 *
 * Health v2.5 declared `health:ActivityData`, `health:SleepData`,
 * `health:HeartRateData`, `health:BloodPressureData`, `health:HRVData` and
 * `health:BodyMeasurements` as `rdfs:subClassOf health:HealthProfile`. That
 * subclass axiom is what makes the `rdfs:domain health:HealthProfile` already
 * asserted on the eight history-container properties true, and what brings
 * these subjects under `health:HealthProfileShape`.
 *
 * Use {@link isHealthProfileType} rather than comparing against
 * `health:HealthProfile` directly: a subject typed `health:SleepData` IS a
 * health profile, and an equality check will say it is not.
 *
 * Values are full RDF type IRIs.
 */
export const WELLNESS_CONTAINER_SUBCLASSES: Readonly<Record<string, string>> = {
  [`${NAMESPACES.health}ActivityData`]: `${NAMESPACES.health}HealthProfile`,
  [`${NAMESPACES.health}SleepData`]: `${NAMESPACES.health}HealthProfile`,
  [`${NAMESPACES.health}HeartRateData`]: `${NAMESPACES.health}HealthProfile`,
  [`${NAMESPACES.health}BloodPressureData`]: `${NAMESPACES.health}HealthProfile`,
  [`${NAMESPACES.health}HRVData`]: `${NAMESPACES.health}HealthProfile`,
  [`${NAMESPACES.health}BodyMeasurements`]: `${NAMESPACES.health}HealthProfile`,
};

/**
 * True when `rdfType` denotes a health profile: either `health:HealthProfile`
 * itself or one of the six `health:` wellness containers that v2.5 declared a
 * subclass of it.
 *
 * @param rdfType - A full RDF type IRI, e.g.
 *   `https://ns.cascadeprotocol.org/health/v1#SleepData`.
 */
export function isHealthProfileType(rdfType: string): boolean {
  if (rdfType === `${NAMESPACES.health}HealthProfile`) return true;
  return WELLNESS_CONTAINER_SUBCLASSES[rdfType] === `${NAMESPACES.health}HealthProfile`;
}

// ─── Sleep Quality Individuals (health v2.5) ────────────────────────────────

/**
 * The four `health:SleepQuality` named individuals, in descending order.
 *
 * `health:sleepQuality` is emitted with an IRI object (`health:Good`), not a
 * string literal. These are the local names; the serializer writes the
 * `health:`-prefixed form and the deserializer strips it back off.
 */
export const SLEEP_QUALITY_VALUES = ['Excellent', 'Good', 'Fair', 'Poor'] as const;

// ─── Schema Version ──────────────────────────────────────────────────────────

/**
 * Current Cascade Protocol schema version.
 *
 * Used by the validator to check records against the expected version.
 * Update this constant when the protocol schema version is bumped.
 */
export const CURRENT_SCHEMA_VERSION = '1.3';

// ─── Property Predicates ─────────────────────────────────────────────────────

/**
 * Mapping from JSON property names to their corresponding Turtle predicates.
 *
 * Used during serialization to convert JSON key-value pairs into
 * RDF triples with the correct predicate URIs.
 *
 * @example
 * ```typescript
 * import { PROPERTY_PREDICATES } from '@the-cascade-protocol/sdk';
 *
 * const pred = PROPERTY_PREDICATES.dose; // 'clinical:dosage'
 * ```
 */
export const PROPERTY_PREDICATES: Record<string, string> = {
  // ── Medication predicates (clinical: vocabulary) ──
  medicationName: 'clinical:drugName',
  dose: 'clinical:dosage',
  frequency: 'health:frequency',
  route: 'health:route',
  prescriber: 'health:prescriber',
  startDate: 'health:startDate',
  endDate: 'health:endDate',
  isActive: 'clinical:status',
  rxNormCode: 'clinical:rxNormCode',
  medicationClass: 'health:medicationClass',
  affectsVitalSigns: 'health:affectsVitalSigns',

  // ── Condition predicates (health: vocabulary) ──
  conditionName: 'health:conditionName',
  status: 'health:status',
  onsetDate: 'health:onsetDate',
  icd10Code: 'health:icd10Code',
  snomedCode: 'health:snomedCode',
  conditionClass: 'health:conditionClass',
  monitoredVitalSigns: 'health:monitoredVitalSigns',

  // ── Allergy predicates (health: vocabulary) ──
  allergen: 'health:allergen',
  allergyCategory: 'health:allergyCategory',
  reaction: 'health:reaction',
  allergySeverity: 'health:allergySeverity',

  // ── Lab result predicates (health: vocabulary) ──
  testName: 'health:testName',
  resultValue: 'health:resultValue',
  resultUnit: 'health:resultUnit',
  referenceRange: 'health:referenceRange',
  interpretation: 'health:interpretation',
  performedDate: 'health:performedDate',
  testCode: 'health:testCode',
  labCategory: 'health:labCategory',
  specimenType: 'health:specimenType',
  reportedDate: 'health:reportedDate',
  orderingProvider: 'health:orderingProvider',
  performingLab: 'health:performingLab',

  // ── Immunization predicates (health: vocabulary) ──
  vaccineName: 'health:vaccineName',
  administrationDate: 'health:administrationDate',
  vaccineCode: 'health:vaccineCode',
  manufacturer: 'health:manufacturer',
  lotNumber: 'health:lotNumber',
  doseQuantity: 'health:doseQuantity',
  site: 'health:site',
  administeringProvider: 'health:administeringProvider',
  administeringLocation: 'health:administeringLocation',

  // ── Vital sign predicates (clinical: vocabulary) ──
  vitalType: 'clinical:vitalType',
  vitalTypeName: 'clinical:vitalTypeName',
  value: 'clinical:value',
  unit: 'clinical:unit',
  effectiveDate: 'clinical:effectiveDate',
  loincCode: 'clinical:loincCode',
  referenceRangeLow: 'clinical:referenceRangeLow',
  referenceRangeHigh: 'clinical:referenceRangeHigh',

  // ── Clinical enrichment predicates ──
  provenanceClass: 'clinical:provenanceClass',
  sourceFhirResourceType: 'clinical:sourceFhirResourceType',
  clinicalIntent: 'clinical:clinicalIntent',
  indication: 'clinical:indication',
  courseOfTherapyType: 'clinical:courseOfTherapyType',
  asNeeded: 'clinical:asNeeded',
  medicationForm: 'clinical:medicationForm',
  activeIngredient: 'clinical:activeIngredient',
  ingredientStrength: 'clinical:ingredientStrength',
  refillsAllowed: 'clinical:refillsAllowed',
  supplyDurationDays: 'clinical:supplyDurationDays',
  prescriptionCategory: 'clinical:prescriptionCategory',
  drugCode: 'clinical:drugCode',
  drugCodes: 'clinical:drugCode',

  // ── Coverage predicates (clinical: and coverage: vocabularies) ──
  providerName: 'clinical:providerName',
  memberId: 'clinical:memberId',
  groupNumber: 'clinical:groupNumber',
  planName: 'clinical:planName',
  planType: 'clinical:planType',
  coverageType: 'clinical:coverageType',
  relationship: 'clinical:relationship',
  effectivePeriodStart: 'clinical:effectivePeriodStart',
  effectivePeriodEnd: 'clinical:effectivePeriodEnd',
  payorName: 'clinical:payorName',
  subscriberId: 'clinical:subscriberId',
  subscriberRelationship: 'coverage:subscriberRelationship',
  subscriberName: 'coverage:subscriberName',
  effectiveStart: 'coverage:effectiveStart',
  effectiveEnd: 'coverage:effectiveEnd',
  rxBin: 'coverage:rxBin',
  rxPcn: 'coverage:rxPcn',
  rxGroup: 'coverage:rxGroup',

  // ── Patient profile predicates (cascade:, foaf:, and vcard: vocabularies) ──
  dateOfBirth: 'cascade:dateOfBirth',
  biologicalSex: 'cascade:biologicalSex',
  contactPhone: 'vcard:hasTelephone',
  contactEmail: 'vcard:hasEmail',
  computedAge: 'cascade:computedAge',
  ageGroup: 'cascade:ageGroup',
  genderIdentity: 'cascade:genderIdentity',
  profileId: 'cascade:profileId',
  name: 'foaf:name',
  givenName: 'foaf:givenName',
  familyName: 'foaf:familyName',
  bloodType: 'health:bloodType',

  // ── Procedure predicates ──
  // clinical:procedureName is canonical (clinical v1.15). The health: spelling
  // is what a C-CDA import path writes on records it types clinical:Procedure;
  // it is accepted for the migration window and both halves are removed
  // together when the window closes.
  procedureName: 'clinical:procedureName',
  healthProcedureName: 'health:procedureName',
  cptCode: 'health:cptCode',
  procedureStatus: 'health:procedureStatus',
  performer: 'health:performer',
  location: 'health:location',

  // ── Encounter predicates (clinical: vocabulary — EHR-sourced) ──
  encounterType: 'clinical:encounterType',
  encounterClass: 'clinical:encounterClass',
  encounterStatus: 'clinical:encounterStatus',
  encounterStart: 'clinical:encounterStart',
  encounterEnd: 'clinical:encounterEnd',

  // ── Family history predicates ──
  // Note: `relationship` is shared with Coverage predicates above (clinical:relationship)
  onsetAge: 'health:onsetAge',

  // ── Shared predicates ──
  notes: 'health:notes',
  sourceRecordId: 'health:sourceRecordId',
  // Core v3.5: the ORIGIN axis. rdfs:domain is owl:Thing, so it may appear on
  // any subject; the typed accessor lives on CascadeEntity for that reason.
  sourceIdentity: 'cascade:sourceIdentity',
  // The INGESTION axis. Published in the JSON-LD context since core v3.0 and
  // never registered here, so it could not round-trip while the ORIGIN axis
  // above could. NOT a reconciliation key: one batch routinely carries several
  // organizations.
  sourceSystem: 'cascade:sourceSystem',
  // Core v3.6: why this record's primary VALUE is absent. Bound to the 15
  // codes of http://terminology.hl7.org/CodeSystem/data-absent-reason, and
  // meaningful only when that value is in fact absent.
  dataAbsentReason: 'cascade:dataAbsentReason',
  // health v2.7 / clinical v1.15: the source's own interpretation code,
  // verbatim, when it is a member of neither ratified value set. A vital sign
  // writes the clinical: spelling; see the serializer's type overrides.
  interpretationSourceCode: 'health:interpretationSourceCode',

  // ── Activity snapshot predicates ──
  date: 'health:date',
  steps: 'health:steps',
  distance: 'health:distance',
  activeMinutes: 'health:activeMinutes',
  calories: 'health:calories',

  // ── Sleep snapshot predicates ──
  totalSleepMinutes: 'health:totalSleepMinutes',
  deepSleepMinutes: 'health:deepSleepMinutes',
  remSleepMinutes: 'health:remSleepMinutes',
  lightSleepMinutes: 'health:lightSleepMinutes',
  awakenings: 'health:awakenings',

  // ── MedicationAdministration predicates (clinical: vocabulary) ──
  administeredDate: 'clinical:administeredDate',
  administeredDose: 'clinical:administeredDose',
  administeredRoute: 'clinical:administeredRoute',
  administrationStatus: 'clinical:administrationStatus',

  // ── ImplantedDevice predicates (clinical: vocabulary) ──
  deviceType: 'clinical:deviceType',
  implantDate: 'clinical:implantDate',
  deviceManufacturer: 'clinical:deviceManufacturer',
  udiCarrier: 'clinical:udiCarrier',
  deviceStatus: 'clinical:deviceStatus',

  // ── ImagingStudy predicates (clinical: vocabulary) ──
  imagingModality: 'clinical:imagingModality',
  studyDescription: 'clinical:studyDescription',
  numberOfSeries: 'clinical:numberOfSeries',
  studyDate: 'clinical:studyDate',
  dicomStudyUid: 'clinical:dicomStudyUid',
  retrieveUrl: 'clinical:retrieveUrl',

  // ── Coverage v1.3 — ClaimRecord predicates ──
  claimDate: 'coverage:claimDate',
  claimTotal: 'coverage:claimTotal',
  claimStatus: 'coverage:claimStatus',
  claimType: 'coverage:claimType',
  billingProvider: 'coverage:billingProvider',

  // ── Coverage v1.3 — BenefitStatement predicates ──
  adjudicationDate: 'coverage:adjudicationDate',
  adjudicationStatus: 'coverage:adjudicationStatus',
  outcomeCode: 'coverage:outcomeCode',
  denialReason: 'coverage:denialReason',
  totalBilled: 'coverage:totalBilled',
  totalAllowed: 'coverage:totalAllowed',
  totalPaid: 'coverage:totalPaid',
  patientResponsibility: 'coverage:patientResponsibility',
  relatedClaim: 'coverage:relatedClaim',

  // ── Coverage v1.3 — DenialNotice predicates ──
  deniedProcedureCode: 'coverage:deniedProcedureCode',
  denialReasonCode: 'coverage:denialReasonCode',
  denialLetterDate: 'coverage:denialLetterDate',
  appealDeadline: 'coverage:appealDeadline',
  coveragePolicyReference: 'coverage:coveragePolicyReference',

  // ── Coverage v1.3 — AppealRecord predicates ──
  appealLevel: 'coverage:appealLevel',
  appealFiledDate: 'coverage:appealFiledDate',
  appealOutcome: 'coverage:appealOutcome',
  appealOutcomeDate: 'coverage:appealOutcomeDate',

  // ── Core v2.8 — FHIR passthrough predicates ──
  layerPromotionStatus: 'cascade:layerPromotionStatus',
  fhirJson: 'cascade:fhirJson',
  sourceRecordDate: 'cascade:sourceRecordDate',

  // ── Health v2.4 — SocialHistoryRecord predicates (consumer-reported) ──
  // DISTINCT from the EHR-extracted clinical:SocialHistoryRecord above.
  smokingStatus: 'health:smokingStatus',
  alcoholUse: 'health:alcoholUse',
  exerciseFrequency: 'health:exerciseFrequency',
  occupationalExposure: 'health:occupationalExposure',

  // ── Core v3.1 — AIGenerationActivity predicates (cascade: vocabulary) ──
  // extractionModel / extractionConfidence / sourceNarrativeSection /
  // requiresUserReview are reused from AIExtractionActivity (declared below).
  promptVersion: 'cascade:promptVersion',
  generationTemperature: 'cascade:generationTemperature',
  trigger: 'cascade:trigger',

  // ── Core v3.2 — AdvisoryApplicationActivity predicates ──
  appliedTriplesCount: 'cascade:appliedTriplesCount',

  // ── Core v3.3 — ProxyAgent predicates (caregiver-proxy) ──
  actsForPatient: 'cascade:actsForPatient',
  proxyWebID: 'cascade:proxyWebID',
  proxyRelationship: 'cascade:proxyRelationship',
  proxyScope: 'cascade:proxyScope',
  proxyGrantedAt: 'cascade:proxyGrantedAt',
  proxyRevokedAt: 'cascade:proxyRevokedAt',

  // ── AI extraction/generation shared predicates (cascade: vocabulary) ──
  extractionModel: 'cascade:extractionModel',
  extractionConfidence: 'cascade:extractionConfidence',
  sourceNarrativeSection: 'cascade:sourceNarrativeSection',
  requiresUserReview: 'cascade:requiresUserReview',

  // ── Clinical v1.10–v1.12 — traversable graph edges ──
  // Object properties: every value is an IRI, never a literal.
  hasEncounter: 'clinical:hasEncounter',
  indicationReference: 'clinical:indicationReference',
  parsedIndicationReference: 'clinical:parsedIndicationReference',
  linkedCondition: 'clinical:linkedCondition',
  // DEPRECATED in clinical v1.10: packed related-condition UUIDs into one
  // space-separated literal that no graph query can traverse. Registered so
  // existing Checkup data still round-trips; write `linkedCondition` instead.
  linkedConditionIds: 'clinical:linkedConditionIds',

  // ── Health v2.5 — daily snapshot predicates ──
  // The single-day forms carried on health:DailyActivitySnapshot /
  // health:DailySleepSnapshot. Distinct from the 7-day aggregate forms above
  // (activeEnergyBurnedKcal, exerciseMinutesWeekly, standHoursDaily); both
  // sets are emitted.
  activeEnergyKcal: 'health:activeEnergyKcal',
  exerciseMinutes: 'health:exerciseMinutes',
  standHours: 'health:standHours',
  durationHours: 'health:durationHours',
  // Emitted with an IRI object (health:Good), not a string literal.
  sleepQuality: 'health:sleepQuality',

  // ── Core v3.4 — pod export manifest ──
  // cascade:ExportManifest is a dcat:Dataset, so the descriptive terms are the
  // DCAT/Dublin Core standard ones rather than Cascade-specific inventions.
  title: 'dcterms:title',
  description: 'dcterms:description',
  created: 'dcterms:created',
  creator: 'dcterms:creator',
  publisher: 'dcterms:publisher',
  patientProfileVersion: 'cascade:patientProfileVersion',
  provenanceLayers: 'cascade:provenanceLayers',
  clinicalSummary: 'cascade:clinicalSummary',
  wellnessSummary: 'cascade:wellnessSummary',
  deviceSources: 'cascade:deviceSources',
  interactionScenarios: 'cascade:interactionScenarios',

  // ── Core v3.4 — record summary (a void:Dataset) ──
  // Each count below is rdfs:subPropertyOf void:entities, paired in the
  // ontology with the void:class it counts.
  domain: 'cascade:domain',
  conditionCount: 'cascade:conditionCount',
  medicationCount: 'cascade:medicationCount',
  allergyCount: 'cascade:allergyCount',
  labResultCount: 'cascade:labResultCount',
  immunizationCount: 'cascade:immunizationCount',
  coverageCount: 'cascade:coverageCount',
  supplementCount: 'cascade:supplementCount',
  // Day counts: DAYS COVERED, not entities, so these are deliberately NOT
  // void:entities subproperties. A 30-day heart rate history holds many more
  // readings than 30.
  vitalSignDays: 'cascade:vitalSignDays',
  heartRateDays: 'cascade:heartRateDays',
  bloodPressureDays: 'cascade:bloodPressureDays',
  activityDays: 'cascade:activityDays',
  sleepDays: 'cascade:sleepDays',

  // ── Core v3.4 — interaction scenario (deliberately novel) ──
  involvedResources: 'cascade:involvedResources',
  severity: 'cascade:severity',
  requiresCrossProvenance: 'cascade:requiresCrossProvenance',

  // ── Core v3.4 — device sources ──
  // sourceType describes the TRANSPORT a reading arrived through, not its
  // trustworthiness; that is cascade:dataProvenance.
  sourceType: 'cascade:sourceType',
  dataTypes: 'cascade:dataTypes',
  version: 'cascade:version',

  // ── Core v3.4 — reading-level terms ──
  // cascade:date and cascade:loincCode are second spellings of `date` and
  // `loincCode`, which already map to health:date and clinical:loincCode
  // above. Both spellings are accepted on read (see ADDITIONAL_REVERSE_MAPPINGS
  // in the deserializer); which one is written is decided per record type by
  // TYPE_PREDICATE_OVERRIDES in the serializer.
  sampleCount: 'cascade:sampleCount',

  // ── Core predicates (cascade: vocabulary) ──
  dataProvenance: 'cascade:dataProvenance',
  schemaVersion: 'cascade:schemaVersion',

  // ── evidence v1-draft.0.2 (DRAFT) — verdict-taxonomy-v2 facet predicates ──
  // The grounding outcome as orthogonal facets on an evidence:Assertion.
  // Excluded from the generated JSON-LD context until v1.0 graduation.
  direction: 'evidence:direction',
  basis: 'evidence:basis',
  strength: 'evidence:strength',
  settled: 'evidence:settled',
  reason: 'evidence:reason',
  confidence: 'evidence:confidence',

  // ── workbench v1-draft.0.4 (DRAFT) — user filing label (organization axis) ──
  // workbench:followUp is an oa:Motivation individual (a VALUE of
  // oa:motivatedBy), not a predicate, so it is not registered here; the
  // workbench namespace lets it round-trip as a prefixed value.
  userSourceLabel: 'workbench:userSourceLabel',
} as const;

// ─── Reverse Predicate Mapping ──────────────────────────────────────────────

/**
 * Build a reverse mapping from full predicate URI to JSON property name.
 *
 * Expands each PROPERTY_PREDICATES shorthand (e.g. 'health:medicationName')
 * to a full URI and maps it back to the JSON key.
 *
 * @param additionalMappings - Optional extra full-URI-to-JSON-key entries
 *   (e.g. type-specific overrides for VitalSign clinical predicates).
 */
export function buildReversePredicateMap(
  additionalMappings?: Record<string, string>,
): Map<string, string> {
  const reverseMap = new Map<string, string>();
  for (const [jsonKey, predShorthand] of Object.entries(PROPERTY_PREDICATES)) {
    const colonIdx = predShorthand.indexOf(':');
    if (colonIdx >= 0) {
      const nsPrefix = predShorthand.slice(0, colonIdx);
      const localName = predShorthand.slice(colonIdx + 1);
      const nsUri = NAMESPACES[nsPrefix as keyof typeof NAMESPACES];
      if (nsUri) {
        reverseMap.set(`${nsUri}${localName}`, jsonKey);
      }
    }
  }
  if (additionalMappings) {
    for (const [fullUri, jsonKey] of Object.entries(additionalMappings)) {
      reverseMap.set(fullUri, jsonKey);
    }
  }
  return reverseMap;
}
