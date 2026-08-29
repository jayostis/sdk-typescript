/**
 * Re-exports all Cascade Protocol data model types.
 *
 * @module models
 */

// Common types and base interface
export type {
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
  CascadeEntity,
  CascadeRecord,
  MultiValue,
} from './common.js';

// Vocabulary value sets and helpers (runtime exports)
export {
  LAB_INTERPRETATION_VALUES,
  LAB_INTERPRETATION_CHECKSUM,
  OBSERVATION_INTERPRETATION_CODE_COUNT,
  asArray,
} from './common.js';

// Clinical record types
export type { Medication } from './medication.js';
export type { Condition } from './condition.js';
export type { Allergy } from './allergy.js';
export type { LabResult } from './lab-result.js';
export type { VitalSign } from './vital-sign.js';
export type { Immunization } from './immunization.js';
export type { Procedure } from './procedure.js';
// Encounter, and the participation sub-node it carries inline (clinical v1.16)
export type { Encounter, EncounterParticipant } from './encounter.js';
export type { FamilyHistory } from './family-history.js';
export type { Coverage } from './coverage.js';
export type { MedicationAdministration } from './medication-administration.js';
export type { ImplantedDevice } from './implanted-device.js';
export type { ImagingStudy } from './imaging-study.js';
export type { ClaimRecord, BenefitStatement, DenialNotice, AppealRecord } from './claim-record.js';

// Patient profile and nested types
export type {
  PatientProfile,
  EmergencyContact,
  Address,
  PharmacyInfo,
} from './patient-profile.js';

// Wellness snapshot types
export type { ActivitySnapshot } from './activity-snapshot.js';
export type { SleepSnapshot } from './sleep-snapshot.js';

// Aggregate health profile
export type { HealthProfile } from './health-profile.js';

// Clinical social history (EHR-extracted, clinical v1.8)
export type { ClinicalSocialHistoryRecord, SocialHistoryCategory } from './social-history-clinical.js';

// AI extraction provenance (core v3.0)
export type {
  AIExtractionActivity,
  AIDiscardedExtraction,
  SocialHistoryConsent,
} from './ai-extraction.js';

// Consumer-reported social history (health v2.4)
// DISTINCT from ClinicalSocialHistoryRecord (EHR-extracted, clinical v1.8)
export type { SocialHistoryRecord } from './social-history.js';

// Advisory application + AI generation provenance, caregiver-proxy (core v3.1–v3.3)
export type {
  AdvisoryApplicationActivity,
  AIGenerationActivity,
  ProxyAgent,
  GenerationTrigger,
} from './advisory-generation.js';

// Pod export manifest (core v3.4)
export type {
  ExportManifest,
  RecordSummary,
  InteractionScenario,
  InteractionSeverity,
} from './export-manifest.js';

// Single-day wellness snapshots (health v2.5)
// DISTINCT from ActivitySnapshot / SleepSnapshot, which are the 7-day
// aggregate forms; both are emitted.
export type {
  DailyActivitySnapshot,
  DailySleepSnapshot,
  SleepQuality,
} from './daily-snapshot.js';

// Pod attachment metadata (core v3.7). A subject with its own IRI, NOT an
// inline sub-node: cascade:HasAttachmentEdgeShape requires sh:nodeKind sh:IRI.
export type { Attachment } from './attachment.js';
