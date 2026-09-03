/**
 * Every record-type name this SDK accepts, and the class it is written as.
 *
 * DERIVED, NOT TRANSCRIBED. Thirty-three of these thirty-nine rows are what
 * exact local-name lookup against the six stable ontologies produces; the other
 * six are {@link RDF_TYPE_OVERRIDES}, each carrying its reason. Committed
 * because `src/` cannot read `../spec` — a consumer installs `dist` and has no
 * checkout — so the derivation runs at author time and this is its output.
 *
 * `tests/record-types/derivation.test.ts` re-runs it against the checkout and
 * fails naming the row that moved. That is the whole point of the file: the
 * table it replaces was equally hand-written and nothing compared it to
 * anything, which is how `InsurancePlan` spent five releases pointing at
 * `clinical:CoverageRecord` (#26).
 *
 * Measured 2026-09-02 against `spec` at the sibling checkout: 33 derive, 6 need
 * an override, and the result agrees with the outgoing `TYPE_MAPPING` on every
 * one of the 39 rows. Nothing this SDK writes changes; what changes is that a
 * drift in `spec` now has somewhere to be reported.
 *
 * ORDER IS THE OUTGOING TABLE'S, so the two diff against each other by eye
 * while both exist. Nothing may depend on it — the canonical name is declared
 * in `CANONICAL_NAMES`, which is the defect this whole module exists to fix.
 *
 * @module record-types
 */

/** `record-type name -> the class it is written as, as a CURIE`. */
export const RECORD_CLASSES: Readonly<Record<string, string>> = {
  MedicationRecord: 'clinical:Medication',
  Medication: 'clinical:Medication',
  ConditionRecord: 'health:ConditionRecord',
  AllergyRecord: 'health:AllergyRecord',
  LabResultRecord: 'health:LabResultRecord',
  ImmunizationRecord: 'health:ImmunizationRecord',
  VitalSign: 'clinical:VitalSign',
  Supplement: 'clinical:Supplement',
  ProcedureRecord: 'clinical:Procedure',
  Procedure: 'clinical:Procedure',
  Encounter: 'clinical:Encounter',
  FamilyHistoryRecord: 'health:FamilyHistoryRecord',
  InsurancePlan: 'coverage:InsurancePlan',
  CoverageRecord: 'coverage:InsurancePlan',
  MedicationAdministration: 'clinical:MedicationAdministration',
  ImplantedDevice: 'clinical:ImplantedDevice',
  ImagingStudy: 'clinical:ImagingStudy',
  ClaimRecord: 'coverage:ClaimRecord',
  BenefitStatement: 'coverage:BenefitStatement',
  DenialNotice: 'coverage:DenialNotice',
  AppealRecord: 'coverage:AppealRecord',
  PatientProfile: 'cascade:PatientProfile',
  ActivitySnapshot: 'health:ActivitySnapshot',
  SleepSnapshot: 'health:SleepSnapshot',
  ClinicalSocialHistoryRecord: 'clinical:SocialHistoryRecord',
  AIExtractionActivity: 'cascade:AIExtractionActivity',
  AIDiscardedExtraction: 'cascade:AIDiscardedExtraction',
  SocialHistoryConsent: 'cascade:SocialHistoryConsent',
  SocialHistoryRecord: 'health:SocialHistoryRecord',
  AdvisoryApplicationActivity: 'cascade:AdvisoryApplicationActivity',
  AIGenerationActivity: 'cascade:AIGenerationActivity',
  ProxyAgent: 'cascade:ProxyAgent',
  ExportManifest: 'cascade:ExportManifest',
  RecordSummary: 'cascade:RecordSummary',
  InteractionScenario: 'cascade:InteractionScenario',
  DailyActivitySnapshot: 'health:DailyActivitySnapshot',
  DailySleepSnapshot: 'health:DailySleepSnapshot',
  EncounterParticipant: 'clinical:EncounterParticipant',
  Attachment: 'cascade:Attachment',
};
