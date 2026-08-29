/**
 * Common types shared across all Cascade Protocol data models.
 *
 * These types map directly to the Cascade Protocol vocabularies:
 * - cascade: https://ns.cascadeprotocol.org/core/v1#
 * - health:  https://ns.cascadeprotocol.org/health/v1#
 * - clinical: https://ns.cascadeprotocol.org/clinical/v1#
 *
 * @see https://cascadeprotocol.org/docs/cascade-protocol-schemas
 */

// ─── Provenance Types ────────────────────────────────────────────────────────

/**
 * Data provenance classification indicating the source of a health record.
 *
 * Maps to `cascade:dataProvenance` in Turtle serialization.
 *
 * - `ClinicalGenerated` -- Data originating from clinical/EHR sources
 * - `DeviceGenerated` -- Data from wearable or medical devices
 * - `SelfReported` -- Patient-entered data
 * - `AIExtracted` -- AI-extracted from existing clinical documents (grounded)
 * - `AIGenerated` -- AI-generated observations, analyses, or recommendations
 * - `AIAsserted` -- Content surfaced by a general-purpose AI assistant in a
 *   patient-directed conversation, NOT grounded in clinical sources. Must never
 *   be confused with `AIExtracted` (grounded extraction) or `EHRVerified`.
 *   Maps to `cascade:AIAsserted` (subClassOf `cascade:ConsumerGenerated`).
 * - `EHRVerified` -- Data verified against electronic health records
 * - `PatientReported` -- The `cascade:PatientReported` individual, defined in
 *   core v3.8. Registered so a value a producer is entitled to write is not
 *   rejected by this SDK's validator.
 *
 *   ITS RELATION TO `SelfReported` IS NOT RESTATED HERE, deliberately. The two
 *   read as near-synonyms and the ontology draws whatever distinction it draws;
 *   inventing one in a doc comment would be a claim the vocabulary did not
 *   make, and a consumer routing on it would then route on this SDK's guess.
 *   Consult `cascade:PatientReported` in core.ttl before choosing between them.
 */
export type ProvenanceType =
  | 'ClinicalGenerated'
  | 'DeviceGenerated'
  | 'SelfReported'
  | 'AIExtracted'
  | 'AIGenerated'
  | 'AIAsserted'
  | 'EHRVerified'
  | 'PatientReported';

/**
 * Provenance class indicating the specific import mechanism or tracking method.
 *
 * Maps to `clinical:provenanceClass` in Turtle serialization.
 */
export type ProvenanceClass =
  | 'healthKitFHIR'
  | 'userTracked'
  | 'manualEntry'
  | 'deviceSync';

// ─── Condition Types ─────────────────────────────────────────────────────────

/**
 * Clinical status of a condition record.
 *
 * Maps to `health:status` in Turtle serialization.
 */
export type ConditionStatus =
  | 'active'
  | 'resolved'
  | 'remission'
  | 'inactive';

// ─── Allergy Types ───────────────────────────────────────────────────────────

/**
 * Severity of an allergic reaction.
 *
 * Maps to `health:allergySeverity` in Turtle serialization.
 */
export type AllergySeverity =
  | 'mild'
  | 'moderate'
  | 'severe'
  | 'life-threatening';

/**
 * Category of allergen substance.
 *
 * Maps to `health:allergyCategory` in Turtle serialization.
 */
export type AllergyCategory =
  | 'medication'
  | 'food'
  | 'environmental'
  | 'biologic';

// ─── Multi-Valued Properties ─────────────────────────────────────────────────

/**
 * A property whose vocabulary cardinality is `0..*`.
 *
 * Cascade accepts, and returns, either a bare value or an array. The arity is
 * preserved on both sides: one value in serializes to one triple and reads back
 * as a bare value; N values in serialize to N repeated-predicate triples and
 * read back as an N-element array. RDF has no notion of a "list of one" for a
 * repeated predicate, so an SDK that always returned an array would be
 * inventing structure the graph does not carry.
 *
 * Use {@link asArray} when the caller wants one shape to iterate over.
 */
export type MultiValue<T> = T | T[];

/**
 * Normalize a {@link MultiValue} to an array. Absent values yield `[]`, and the
 * returned array is always a fresh copy, never the caller's.
 *
 * @example
 * ```typescript
 * for (const code of asArray(condition.icd10Code)) { ... }
 * ```
 */
export function asArray<T>(value: MultiValue<T> | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value.slice() : [value];
}

// ─── Lab Result Types ────────────────────────────────────────────────────────

/**
 * Every value `health:interpretation` (and the `clinical:interpretation`
 * spelling on a lab result) accepts, in the order the shape file lists them.
 *
 * Three groups, 74 values:
 *
 * 1. The 49 SELECTABLE codes of the HL7 v3 ObservationInterpretation code
 *    system, `http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation`
 *    (version 3.0.0), which is what FHIR R4 binds `Observation.interpretation`
 *    to. Transcribed verbatim and in the code system's own order. The eight
 *    abstract (`notSelectable`) concepts are deliberately absent: they are
 *    hierarchy nodes, not values. Codes the code system marks deprecated
 *    (`Carrier`, `AC`, `QCF`, `TOX`, `MS`, `VS`, `HM`, `OBX`, `H>`, `L<`) ARE
 *    included, because a deprecated code is still a defined code and historical
 *    results carry them.
 * 2. All 15 codes of
 *    `http://terminology.hl7.org/CodeSystem/data-absent-reason`, for a source
 *    Observation whose interpretation element was absent or null-flavoured.
 *    health v2.6 / clinical v1.14 admitted only `"unknown"`, so `NASK`, `ASKU`
 *    and `NAV` were all flattened onto it and three different clinical facts
 *    became one. health v2.7 / clinical v1.15 admit the other 14.
 * 3. The ten lower- and Title-case words of the pre-v2.6 enum, retained so data
 *    written against health v2.5 keeps validating. NOT recommended for new
 *    writes.
 *
 * Note what is NOT here: `"elevated"`. It was a member of this SDK's
 * `LabInterpretation` union through v1.6.1 and was never accepted by any
 * version of the shapes, while `"high"`, accepted by every version, was
 * missing from the union. Both defects are corrected here.
 *
 * The array is the single source of truth and {@link LabInterpretation} is
 * derived from it, so the type and the runtime list cannot drift apart.
 *
 * @see LAB_INTERPRETATION_CHECKSUM for how the list is pinned.
 */
export const LAB_INTERPRETATION_VALUES = [
  // HL7 v3 ObservationInterpretation 3.0.0: 49 selectable codes
  'EX', 'HM', 'OBX', 'CAR', 'Carrier', 'B', 'D', 'U', 'W',
  '<', '>', 'AC', 'IE', 'QCF', 'TOX',
  'A', 'N', 'I', 'MS', 'NCL', 'NS', 'R', 'S', 'VS',
  'AA', 'H', 'L', 'HH', 'LL', 'HX', 'LX', 'H>', 'HU', 'E', 'L<', 'LU',
  'ND', 'IND', 'NEG', 'POS', 'EXP', 'UNE', 'DET',
  'SYN-R', 'NR', 'RR', 'WR', 'SDD', 'SYN-S',
  // data-absent-reason, all 15 codes (health v2.7 / clinical v1.15)
  'unknown', 'asked-unknown', 'temp-unknown', 'not-asked',
  'asked-declined', 'masked', 'not-applicable', 'unsupported',
  'as-text', 'error', 'not-a-number', 'negative-infinity',
  'positive-infinity', 'not-performed', 'not-permitted',
  // retained from the pre-v2.6 enum
  'normal', 'high', 'low', 'abnormal', 'critical',
  'Normal', 'High', 'Low', 'Abnormal', 'Critical',
] as const;

/** How many of {@link LAB_INTERPRETATION_VALUES} come from the code system itself. */
export const OBSERVATION_INTERPRETATION_CODE_COUNT = 49;

/**
 * SHA-256, hex, of `LAB_INTERPRETATION_VALUES.join('\n')` encoded UTF-8, for
 * the list as ratified in **health v2.7 / clinical v1.15**. The health v2.6 /
 * clinical v1.14 digest was
 * `2da0a308329c92456edf7f46d1529c1a2971b79294d0776025328d04773695f2`, over the
 * same list without the 14 data-absent-reason codes added in this release.
 *
 * Why a checksum rather than a test that reads the shape file: this package is
 * published standalone and its CI checks out no `spec` sibling, so a
 * shapes-reading test would either fail on every clean machine or skip itself
 * whenever the sibling is missing, and a test that skips when it cannot find
 * its input proves nothing while reporting green. The checksum moves the pin
 * in-repo: `tests/interpretation-codes.test.ts` recomputes it from the array
 * above and compares against a literal, so any edit to the list fails until
 * someone updates the digest deliberately and names the vocabulary version they
 * are moving to.
 */
export const LAB_INTERPRETATION_CHECKSUM =
  '1ae24bf8ceccfa2a71d870bae21dc91cc7f906d736496ec23ca78b4181ba05b0';

/**
 * Interpretation of a lab result relative to reference ranges.
 *
 * Maps to `health:interpretation` in Turtle serialization. Derived from
 * {@link LAB_INTERPRETATION_VALUES}; see that constant for what the set is and
 * where it comes from.
 */
export type LabInterpretation = typeof LAB_INTERPRETATION_VALUES[number];

// ─── Medication Types ────────────────────────────────────────────────────────

/**
 * Clinical intent for a medication record, indicating how the medication is used.
 *
 * Maps to `clinical:clinicalIntent` in Turtle serialization.
 */
export type MedicationClinicalIntent =
  | 'prescribed'
  | 'otc'
  | 'supplement'
  | 'prn'
  | 'reportedUse';

/**
 * Course of therapy type for a medication.
 *
 * Maps to `clinical:courseOfTherapyType` in Turtle serialization.
 */
export type CourseOfTherapyType =
  | 'continuous'
  | 'acute'
  | 'seasonal';

/**
 * Prescription category for a medication.
 *
 * Maps to `clinical:prescriptionCategory` in Turtle serialization.
 */
export type PrescriptionCategory =
  | 'community'
  | 'inpatient'
  | 'discharge';

/**
 * Source FHIR resource type for EHR-imported records.
 *
 * Maps to `clinical:sourceFhirResourceType` in Turtle serialization.
 */
export type SourceFhirResourceType =
  | 'MedicationRequest'
  | 'MedicationStatement'
  | 'MedicationDispense';

// ─── Vital Sign Types ────────────────────────────────────────────────────────

/**
 * Enumerated vital sign types supported by the Cascade Protocol.
 *
 * Maps to `clinical:vitalType` in Turtle serialization.
 */
export type VitalType =
  | 'heartRate'
  | 'bloodPressureSystolic'
  | 'bloodPressureDiastolic'
  | 'respiratoryRate'
  | 'temperature'
  | 'oxygenSaturation'
  | 'weight'
  | 'height'
  | 'bmi';

/**
 * Interpretation of a vital sign value relative to reference ranges.
 *
 * Maps to `clinical:interpretation` in Turtle serialization, and is the same
 * concept, on the same predicate, as {@link LabInterpretation}, so the
 * recommended values are the same set.
 *
 * clinical v1.15 binds `clinical:VitalSignShape`'s interpretation to this same
 * value set, so the reason the field on {@link VitalSign} was typed
 * `VitalInterpretation | string` (that the vital shape carried no `sh:in`) no
 * longer holds, and that union collapsed to `string`, which documented nothing.
 * The field is now typed `VitalInterpretation`.
 *
 * The binding's SEVERITY is `sh:Warning`, not `sh:Violation`: a vital carrying
 * a value outside the set is REPORTED, not rejected, and is raised to a
 * violation in a later clinical version. That is a rule about VALIDATING data
 * that already exists, which is a different question from what a producer
 * should write. A value in neither ratified set goes verbatim on
 * `interpretationSourceCode`, with the nearest ratified reading here.
 */
export type VitalInterpretation = LabInterpretation;

// ─── Immunization Types ──────────────────────────────────────────────────────

/**
 * Status of an immunization administration.
 *
 * Maps to `health:status` in Turtle serialization.
 */
export type ImmunizationStatus =
  | 'completed'
  | 'entered-in-error'
  | 'not-done';

// ─── Coverage Types ──────────────────────────────────────────────────────────

/**
 * Type of insurance plan.
 *
 * Maps to `clinical:planType` or `coverage:planType` in Turtle serialization.
 */
export type PlanType =
  | 'ppo'
  | 'hmo'
  | 'pos'
  | 'epo'
  | 'hdhp'
  | 'medicare'
  | 'medicaid';

/**
 * Coverage designation (primary or secondary).
 *
 * Maps to `clinical:coverageType` or `coverage:coverageType` in Turtle serialization.
 */
export type CoverageType =
  | 'primary'
  | 'secondary'
  | 'supplemental';

/**
 * Lifecycle state of a coverage record itself: whether the plan is in force,
 * was cancelled, is still a draft, or was entered in error (coverage v1.5).
 *
 * The four codes of FHIR R4 `Coverage.status`, a REQUIRED binding to
 * `http://hl7.org/fhir/ValueSet/fm-status`. Closed rather than
 * `CoverageStatus | string` for the reason clinical v1.15 closed
 * `VitalSign.interpretation`: `coverage:InsurancePlanShape` constrains the
 * VALUE at `sh:Violation`, so the open binding that would justify a union does
 * not exist here. (Contrast {@link CoverageType}, which stays open because FHIR
 * binds `Coverage.type` EXTENSIBLY.)
 *
 * FHIR marks `Coverage.status` a MODIFIER element, which is why this is not a
 * nice-to-have: a cancelled plan read as an active one is a wrong answer to "am
 * I covered", not a missing one.
 *
 * DISTINCT FROM `effectiveStart` / `effectiveEnd`. A date range says when the
 * plan is meant to apply; the status says what the payer currently asserts
 * about the record. A plan whose effective period has not ended can still be
 * cancelled.
 *
 * Maps to `coverage:status` in Turtle serialization.
 */
export type CoverageStatus =
  | 'active'
  | 'cancelled'
  | 'draft'
  | 'entered-in-error';

/**
 * Status of the REFERENCE to a clinical document (clinical v1.16): whether this
 * pod entry is the current pointer to the document, has been replaced by a
 * later one, or was created in error.
 *
 * The three codes of FHIR R4 `DocumentReference.status`, a required binding.
 *
 * DISTINCT FROM the document's own `docStatus` (preliminary | final | amended |
 * entered-in-error), which `clinical:status` carries. FHIR keeps these as two
 * elements because they answer different questions: a document can be a final,
 * unamended clinical note whose reference has since been superseded by a
 * corrected filing. Folding them onto one predicate is not merely lossy, it is
 * ambiguous exactly where ambiguity costs most — `"entered-in-error"` appears
 * in BOTH value sets and means the reference was filed in error in one and that
 * the clinical content is repudiated in the other.
 *
 * Maps to `clinical:documentReferenceStatus` in Turtle serialization.
 */
export type DocumentReferenceStatus =
  | 'current'
  | 'superseded'
  | 'entered-in-error';

/**
 * Subscriber relationship to the plan holder: the full HL7 SubscriberPolicyholder
 * code system (`http://terminology.hl7.org/CodeSystem/subscriber-relationship`)
 * that FHIR R4 binds `Coverage.relationship` to.
 *
 * Coverage v1.4 completed the enum with `common` (common law spouse) and
 * `injured` (injured party); `parent` was in the code system all along and
 * missing here.
 *
 * Maps to `clinical:relationship` or `coverage:subscriberRelationship` in Turtle serialization.
 */
export type SubscriberRelationship =
  | 'child'
  | 'parent'
  | 'spouse'
  | 'common'
  | 'other'
  | 'self'
  | 'injured';

// ─── Patient Profile Types ───────────────────────────────────────────────────

/**
 * Biological sex as used for clinical calculations.
 *
 * Maps to `cascade:biologicalSex` in Turtle serialization.
 */
export type BiologicalSex =
  | 'male'
  | 'female'
  | 'intersex';

/**
 * Age group classification.
 *
 * Maps to `cascade:ageGroup` in Turtle serialization.
 */
export type AgeGroup =
  | 'infant'
  | 'child'
  | 'adolescent'
  | 'young_adult'
  | 'adult'
  | 'senior';

/**
 * Blood type classification.
 *
 * Maps to `health:bloodType` in Turtle serialization.
 */
export type BloodType =
  | 'aPositive'
  | 'aNegative'
  | 'bPositive'
  | 'bNegative'
  | 'abPositive'
  | 'abNegative'
  | 'oPositive'
  | 'oNegative';

// ─── Procedure Types ─────────────────────────────────────────────────────────

/**
 * Status of a clinical procedure.
 */
export type ProcedureStatus =
  | 'completed'
  | 'in-progress'
  | 'not-done'
  | 'preparation'
  | 'stopped';

// ─── Base Record Interface ───────────────────────────────────────────────────

/**
 * Base fields shared by every Cascade Protocol subject, whether or not it is a
 * health record.
 *
 * `dataProvenance` and `schemaVersion` are optional here because not every
 * Cascade class is a `cascade:HealthRecord`. A `cascade:ExportManifest` or
 * `cascade:RecordSummary` describes an export rather than reporting an
 * observation, so its SHACL shape does not require a provenance value; a
 * `cascade:RecordSummary` may carry one but need not.
 *
 * Health records use {@link CascadeRecord}, which requires both.
 *
 * - `id` maps to the RDF subject URI (e.g., `urn:uuid:...`)
 * - `type` maps to `rdf:type` (e.g., `clinical:Medication`)
 */
export interface CascadeEntity {
  /** Unique identifier for this subject (URN UUID format: `urn:uuid:...`). */
  id: string;

  /** RDF type of this subject (e.g., `MedicationRecord`, `ExportManifest`). */
  type: string;

  /**
   * Data provenance classification indicating the source of this subject.
   * Maps to `cascade:dataProvenance` in Turtle serialization.
   */
  dataProvenance?: ProvenanceType;

  /**
   * Schema version in major.minor format (e.g., `"1.3"`).
   * Maps to `cascade:schemaVersion` in Turtle serialization.
   */
  schemaVersion?: string;

  /**
   * Identifier linking back to the source record in the originating system.
   * Maps to `health:sourceRecordId` in Turtle serialization.
   */
  sourceRecordId?: string;

  /**
   * ORIGIN AXIS (core v3.5). The canonical, transport-independent identity of
   * the organization this record came from: a FHIR export and a C-CDA document
   * of the SAME health system carry the same value here. That is what makes it
   * usable as a reconciliation key, which the two neighbouring properties are
   * not. A display label is worded however the source worded it, and an
   * ingestion batch describes how and when data arrived, not where from.
   *
   * The value is a scheme-prefixed token, so a consumer can always tell how much
   * the producer actually knew:
   *
   * - `org:{slug}`: an organization was derivable (`org:meridian`).
   * - `ns:{namespace}`: no organization was derivable, but the identifiers have
   *   an assigning authority: the FHIR server base URL, or the C-CDA `<id>` root
   *   OID. Records agree on origin only if they agree on the namespace.
   * - `transport:{label}`: LAST RESORT. Nothing named or located an
   *   organization. Two `transport:` values mean "origin unknown", never
   *   "shared source".
   *
   * This SDK stores and round-trips the value and deliberately does NOT validate
   * or derive it: minting a slug requires the source document, which only the
   * importer has. See the `cascade:sourceIdentity` definition in the core
   * ontology for the normalization both transports must implement identically.
   *
   * Maps to `cascade:sourceIdentity` in Turtle serialization.
   */
  sourceIdentity?: string;

  /**
   * Identifier(s) the source system PUBLISHES for the real-world thing this
   * record describes, as opposed to the server row it happens to live in
   * (clinical v1.16). On an encounter this is `Encounter.identifier`, US Core
   * Must Support; a visit or contact serial number is the ordinary value.
   *
   * Typed on `CascadeEntity` because the vocabulary deliberately declares NO
   * `rdfs:domain`: the `.identifier` element exists on every FHIR resource, so
   * restricting it to encounters would be false.
   *
   * REPEATABLE, 0..*. A resource that publishes three identifiers has three,
   * and keeping only one discards the very value another transport may key on.
   *
   * VALUE FORM. Where the source states an `Identifier.system`, the value is
   * the FHIR token form `"{system}|{value}"`, which is the ratified way to
   * write a system-qualified identifier as one string and is what makes two
   * identifiers comparable across transports without a side table. Where the
   * source states no system, the bare value is written. An implementation MUST
   * NOT invent a system. This SDK stores and round-trips the string and does
   * NOT parse, split or validate the token form.
   *
   * DISTINCT FROM {@link CascadeEntity.sourceRecordId}, which holds the
   * server-assigned LOGICAL id (FHIR `Resource.id`). The two id spaces do not
   * join: the same string in each means nothing in common. A converter that
   * has been writing a business identifier to `sourceRecordId` must move it.
   *
   * Maps to one `clinical:businessIdentifier` triple per value.
   */
  businessIdentifier?: MultiValue<string>;

  /**
   * Binary renderings of this record, referenced BY IRI (core v3.7): the PDF a
   * DiagnosticReport was issued as, the scanned page behind a
   * DocumentReference. Each value is the `id` of a `cascade:Attachment`.
   *
   * REPEATABLE, because both source elements
   * (`DiagnosticReport.presentedForm`, `DocumentReference.content.attachment`)
   * are: one report legitimately has a PDF and an HTML rendering of the same
   * content.
   *
   * Typed on `CascadeEntity` because the vocabulary leaves the domain
   * unrestricted — "any record that can be rendered as a document" — and
   * constrains it by SHACL instead, matching `clinical:hasEncounter` and the
   * other cross-class edges.
   *
   * Never a blank node: `cascade:HasAttachmentEdgeShape` declares
   * `sh:nodeKind sh:IRI` so that the record and the attachment can live in
   * different files.
   *
   * Maps to one `cascade:hasAttachment` triple per IRI.
   */
  hasAttachment?: MultiValue<string>;

  /**
   * Free-text notes associated with this subject.
   * Maps to `health:notes` in Turtle serialization (or `cascade:notes` on the
   * core v3.4 export-manifest classes).
   */
  notes?: string;
}

/**
 * Base fields shared by all Cascade Protocol health records.
 *
 * Every health record in the Cascade Protocol must include an `id`, `type`,
 * `dataProvenance`, and `schemaVersion`. Additional optional metadata
 * fields are available for traceability.
 *
 * - `id` maps to the RDF subject URI (e.g., `urn:uuid:...`)
 * - `type` maps to `rdf:type` (e.g., `clinical:Medication`)
 * - `dataProvenance` maps to `cascade:dataProvenance`
 * - `schemaVersion` maps to `cascade:schemaVersion`
 */
export interface CascadeRecord extends CascadeEntity {
  /** Unique identifier for this record (URN UUID format: `urn:uuid:...`). */
  id: string;

  /** RDF type of this record (e.g., `MedicationRecord`, `ConditionRecord`). */
  type: string;

  /**
   * Data provenance classification indicating the source of this record.
   * Maps to `cascade:dataProvenance` in Turtle serialization.
   */
  dataProvenance: ProvenanceType;

  /**
   * Schema version in major.minor format (e.g., `"1.3"`).
   * Maps to `cascade:schemaVersion` in Turtle serialization.
   */
  schemaVersion: string;

  /**
   * Identifier linking back to the source record in the originating system.
   * Maps to `health:sourceRecordId` in Turtle serialization.
   */
  sourceRecordId?: string;

  /**
   * Free-text notes associated with this record.
   * Maps to `health:notes` in Turtle serialization.
   */
  notes?: string;
}
