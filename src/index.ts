/**
 * @the-cascade-protocol/sdk - TypeScript library for structured health data.
 *
 * Provides typed interfaces for all Cascade Protocol data types,
 * vocabulary constants, namespace URIs, and serialization/deserialization
 * utilities for RDF Turtle and JSON-LD formats.
 *
 * @example
 * ```typescript
 * import type { Medication, Condition, HealthProfile } from '@the-cascade-protocol/sdk';
 * import { NAMESPACES, serialize, deserialize, toJsonLd } from '@the-cascade-protocol/sdk';
 * ```
 *
 * @see https://cascadeprotocol.org
 * @see https://cascadeprotocol.org/docs/cascade-protocol-schemas
 *
 * @packageDocumentation
 */

// ─── Data Model Types ────────────────────────────────────────────────────────

// Base record and common types
export type {
  CascadeEntity,
  CascadeRecord,
  ProvenanceType,
  ProvenanceClass,
  ConditionStatus,
  AllergySeverity,
  AllergyCategory,
  LabInterpretation,
  MedicationClinicalIntent,
  CourseOfTherapyType,
  PrescriptionCategory,
  SourceFhirResourceType,
  VitalType,
  VitalInterpretation,
  ImmunizationStatus,
  PlanType,
  CoverageType,
  CoverageStatus,
  DocumentReferenceStatus,
  SubscriberRelationship,
  BiologicalSex,
  AgeGroup,
  BloodType,
  ProcedureStatus,
  MultiValue,
} from './models/index.js';

/**
 * Vocabulary value sets and helpers.
 *
 * `LAB_INTERPRETATION_VALUES` is the accepted `interpretation` set (health v2.6 /
 * clinical v1.14) and the source `LabInterpretation` is derived from;
 * `asArray()` normalizes a {@link MultiValue} field to an array.
 */
export {
  LAB_INTERPRETATION_VALUES,
  LAB_INTERPRETATION_CHECKSUM,
  OBSERVATION_INTERPRETATION_CODE_COUNT,
  asArray,
} from './models/index.js';

// Clinical record types
export type { Medication } from './models/medication.js';
export type { Condition } from './models/condition.js';
export type { Allergy } from './models/allergy.js';
export type { LabResult } from './models/lab-result.js';
export type { VitalSign } from './models/vital-sign.js';
export type { Immunization } from './models/immunization.js';
export type { Procedure } from './models/procedure.js';
// Encounter, and the participation sub-node it carries inline (clinical v1.16)
export type { Encounter, EncounterParticipant } from './models/encounter.js';
export type { FamilyHistory } from './models/family-history.js';
export type { Coverage } from './models/coverage.js';
export type { MedicationAdministration } from './models/medication-administration.js';
export type { ImplantedDevice } from './models/implanted-device.js';
export type { ImagingStudy } from './models/imaging-study.js';
export type { ClaimRecord, BenefitStatement, DenialNotice, AppealRecord } from './models/claim-record.js';

// Clinical social history (EHR-extracted, clinical v1.8)
export type { ClinicalSocialHistoryRecord, SocialHistoryCategory } from './models/social-history-clinical.js';

// AI extraction provenance (core v3.0)
export type {
  AIExtractionActivity,
  AIDiscardedExtraction,
  SocialHistoryConsent,
} from './models/ai-extraction.js';

// Patient profile and nested types
export type {
  PatientProfile,
  EmergencyContact,
  Address,
  PharmacyInfo,
} from './models/patient-profile.js';

// Wellness snapshot types
export type { ActivitySnapshot } from './models/activity-snapshot.js';
export type { SleepSnapshot } from './models/sleep-snapshot.js';

// Aggregate health profile
export type { HealthProfile } from './models/health-profile.js';

// Consumer-reported social history (health v2.4)
// DISTINCT from ClinicalSocialHistoryRecord (EHR-extracted, clinical v1.8)
export type { SocialHistoryRecord } from './models/social-history.js';

// Advisory application + AI generation provenance, caregiver-proxy (core v3.1–v3.3)
export type {
  AdvisoryApplicationActivity,
  AIGenerationActivity,
  ProxyAgent,
  GenerationTrigger,
} from './models/advisory-generation.js';

// Pod export manifest (core v3.4)
export type {
  ExportManifest,
  RecordSummary,
  InteractionScenario,
  InteractionSeverity,
} from './models/export-manifest.js';

// Single-day wellness snapshots (health v2.5)
// DISTINCT from ActivitySnapshot / SleepSnapshot, which carry the 7-day
// aggregate forms; both are emitted.
export type {
  DailyActivitySnapshot,
  DailySleepSnapshot,
  SleepQuality,
} from './models/daily-snapshot.js';

// Pod attachment metadata (core v3.7). A subject with its own IRI, NOT an
// inline sub-node: cascade:HasAttachmentEdgeShape requires sh:nodeKind sh:IRI,
// so a record and its attachment can live in different files.
export type { Attachment } from './models/attachment.js';

// ─── Vocabulary Constants ────────────────────────────────────────────────────

export {
  NAMESPACES,
  CURRENT_SCHEMA_VERSION,
  TYPE_MAPPING,
  PROPERTY_PREDICATES,
  DEPRECATED_TYPE_ALIASES,
  WELLNESS_CONTAINER_SUBCLASSES,
  SLEEP_QUALITY_VALUES,
  isHealthProfileType,
} from './vocabularies/index.js';

export type { NamespacePrefix } from './vocabularies/index.js';

// ─── Turtle Serializer ─────────────────────────────────────────────────────

export {
  serialize,
  serializeMedication,
  serializeCondition,
  serializeAllergy,
  serializeLabResult,
  serializeVitalSign,
  serializeImmunization,
  serializeProcedure,
  serializeFamilyHistory,
  serializeCoverage,
  serializePatientProfile,
  serializeActivitySnapshot,
  serializeSleepSnapshot,
} from './serializer/index.js';

export { TurtleBuilder, SubjectBuilder, escapeTurtleString } from './serializer/index.js';

// `SubjectBuilder.addAll` is a method on a shipped class, so its argument type
// is public too, and the package's `exports` map allows no deep import to name
// it from anywhere else.
export type { Output } from './terms/term.js';

// ─── Turtle Deserializer ────────────────────────────────────────────────────

export { deserialize, deserializeOne } from './deserializer/index.js';

// ─── JSON-LD ────────────────────────────────────────────────────────────────

export { toJsonLd, fromJsonLd, getContext, CONTEXT_URI } from './jsonld/index.js';

// ─── Pod Builder ─────────────────────────────────────────────────────────────

export { PodBuilder, type PodFile, type PodManifest, type PodOptions } from './pod/index.js';

// ─── Consent Filter ──────────────────────────────────────────────────────────

export { applyConsent, clinicalOnlyPolicy, fullAccessPolicy, noAccessPolicy, type ConsentCategory, type ConsentRule, type ConsentPolicy } from './consent/index.js';

// ─── Validator ───────────────────────────────────────────────────────────────

export { validate, validateAll, type ValidationError, type ValidationResult } from './validator/index.js';

// ─── Deterministic URI Utilities ─────────────────────────────────────────────

export {
  deterministicUuid,
  contentHashedUri,
  patientUri,
  immunizationUri,
  observationUri,
  conditionUri,
  allergyUri,
  medicationUri,
} from './utils/deterministic-uri.js';

// ─── Medication Normalization ─────────────────────────────────────────────────

export {
  normalizeMedName,
  normalizeDose,
  normalizeFrequency,
  normalizeRoute,
  type DrugNameNormalizer,
} from './utils/medication-normalize.js';

// ─── Clinical Terminology Resolver (brand/generic + lay synonym + name->code) ──

export {
  createTerminologyResolver,
  cascadeTerminologyResolver,
  identityTerminologyResolver,
  CASCADE_TERMINOLOGY_VERSION,
  type TerminologyResolver,
  type TerminologyAsset,
  type ConceptCode,
} from './utils/terminology.js';

// ─── Code-System Identification + Medication Code Ladder ──────────────────────

export {
  classifyCodeSystem,
  extractCodeValue,
  codeRefsFromUris,
  medicationCodeKeys,
  strongestMedicationCodeKey,
  sharedMedicationCodeKey,
  MEDICATION_CODE_TIER,
  MEDICATION_NAME_TIER,
  type CodeSystem,
  type CodeRef,
  type CodeKey,
} from './utils/code-keys.js';

// ─── Shared Code-Keyed Fact Index (slice-4) ───────────────────────────────────

export {
  InMemoryFactIndex,
  type FactIndex,
  type IndexableFact,
  type FactQuery,
} from './utils/fact-index.js';
