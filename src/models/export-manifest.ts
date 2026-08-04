/**
 * Pod export manifest models for the Cascade Protocol core vocabulary
 * (core v3.4).
 *
 * Every term used here is emitted by a conforming pod export. None of them was
 * defined in the core ontology before v3.4, which is what this module closes:
 * a manifest is now describable rather than only parseable.
 *
 * Modelling, and the reasoning, because inventing a term is the expensive
 * default:
 *
 * - `cascade:ExportManifest` is `rdfs:subClassOf dcat:Dataset`. A pod export is
 *   a published dataset with a title, description, creation date and
 *   publisher, which DCAT 3 (a W3C Recommendation) already standardises. The
 *   descriptive fields below are therefore Dublin Core terms, not Cascade
 *   inventions.
 * - `cascade:RecordSummary` is `rdfs:subClassOf void:Dataset`. It is a
 *   statistical description of a dataset subset, which is what VoID is for.
 *   Each count property is `rdfs:subPropertyOf void:entities` and is paired in
 *   the ontology with the `void:class` it counts, so a VoID-aware consumer
 *   reads Cascade record counts with no Cascade-specific code.
 * - `cascade:InteractionScenario` is deliberately novel. No ratified
 *   vocabulary models cross-provenance correlation as a first-class thing.
 *
 * RDF types: `cascade:ExportManifest`, `cascade:RecordSummary`,
 *            `cascade:InteractionScenario`
 * Vocabulary: `https://ns.cascadeprotocol.org/core/v1#`
 *
 * @see https://www.w3.org/TR/vocab-dcat-3/
 * @see https://www.w3.org/TR/void/
 * @see https://cascadeprotocol.org/docs/cascade-protocol-schemas
 */

import type { CascadeEntity, ProvenanceType } from './common.js';

/**
 * Provenance and completeness metadata for a complete pod export: when it was
 * generated, which schema versions it uses, how many records of each kind it
 * contains, and which provenance layers are represented.
 *
 * Consumers should read this before processing individual resources.
 *
 * A `dcat:Dataset`. Serializes as `cascade:ExportManifest` in Turtle.
 */
export interface ExportManifest extends CascadeEntity {
  type: 'ExportManifest';

  /**
   * Human-readable title of the export. Required by
   * `cascade:ExportManifestShape`: an untitled dataset cannot be presented to
   * a user. Maps to `dcterms:title` (DCAT).
   */
  title?: string;

  /**
   * Longer description of what the export contains.
   * Maps to `dcterms:description` (DCAT).
   */
  description?: string;

  /**
   * When the export was generated (ISO 8601 dateTime). Required by
   * `cascade:ExportManifestShape`: without it a consumer cannot tell whether
   * the export is current, which is the manifest's main job.
   * Maps to `dcterms:created` (`xsd:dateTime`).
   */
  created?: string;

  /**
   * The agent that published the export.
   * Maps to `dcterms:publisher` (DCAT).
   */
  publisher?: string;

  /**
   * Version of the patient profile structure used in this export, independent
   * of `schemaVersion`. Maps to `cascade:patientProfileVersion`.
   */
  patientProfileVersion?: string;

  /**
   * The `cascade:DataProvenance` values represented anywhere in this export,
   * as local names (`'DeviceGenerated'`, not the full IRI). Lets a consumer
   * tell, before reading any resource, whether the export contains device
   * data, EHR data, self-reported data, or a mixture.
   * Maps to `cascade:provenanceLayers` (an `rdf:List`).
   */
  provenanceLayers?: ProvenanceType[];

  /**
   * IRI of the {@link RecordSummary} for the clinical partition of this
   * export. Maps to `cascade:clinicalSummary`.
   */
  clinicalSummary?: string;

  /**
   * IRI of the {@link RecordSummary} for the wellness partition of this
   * export. Maps to `cascade:wellnessSummary`.
   */
  wellnessSummary?: string;

  /**
   * IRIs of the devices that contributed data to this export, each a
   * `prov:Agent`. Maps to `cascade:deviceSources` (an `rdf:List`).
   */
  deviceSources?: string[];

  /**
   * IRIs of the {@link InteractionScenario} entries flagged in this export.
   * Maps to `cascade:interactionScenarios` (an `rdf:List`).
   */
  interactionScenarios?: string[];
}

/**
 * Per-domain record counts for one partition of a pod export.
 *
 * A `void:Dataset`. Every count is a single non-negative integer: a negative or
 * repeated count silently corrupts any completeness check built on it.
 *
 * Serializes as `cascade:RecordSummary` in Turtle.
 */
export interface RecordSummary extends CascadeEntity {
  type: 'RecordSummary';

  /**
   * Which partition of the export this summary describes, for example
   * `'clinical'` or `'wellness'`. Required by `cascade:RecordSummaryShape`.
   * Maps to `cascade:domain`.
   */
  domain?: string;

  /**
   * Number of `health:ConditionRecord` instances in this partition.
   * Maps to `cascade:conditionCount` (`rdfs:subPropertyOf void:entities`).
   */
  conditionCount?: number;

  /**
   * Number of `clinical:Medication` instances in this partition.
   * Maps to `cascade:medicationCount` (`rdfs:subPropertyOf void:entities`).
   */
  medicationCount?: number;

  /**
   * Number of `health:AllergyRecord` instances in this partition.
   * Maps to `cascade:allergyCount` (`rdfs:subPropertyOf void:entities`).
   */
  allergyCount?: number;

  /**
   * Number of `health:LabResultRecord` instances in this partition.
   * Maps to `cascade:labResultCount` (`rdfs:subPropertyOf void:entities`).
   */
  labResultCount?: number;

  /**
   * Number of `health:ImmunizationRecord` instances in this partition.
   * Maps to `cascade:immunizationCount` (`rdfs:subPropertyOf void:entities`).
   */
  immunizationCount?: number;

  /**
   * Number of insurance coverage records in this partition.
   * Maps to `cascade:coverageCount` (`rdfs:subPropertyOf void:entities`).
   */
  coverageCount?: number;

  /**
   * Number of `clinical:Supplement` instances in this partition.
   * Maps to `cascade:supplementCount` (`rdfs:subPropertyOf void:entities`).
   */
  supplementCount?: number;

  /**
   * Distinct days covered by vital sign records. A DAY count, not a record
   * count, which is why it is not a `void:entities` subproperty.
   * Maps to `cascade:vitalSignDays`.
   */
  vitalSignDays?: number;

  /**
   * Distinct days covered by heart rate history. A day count, not a record
   * count. Maps to `cascade:heartRateDays`.
   */
  heartRateDays?: number;

  /**
   * Distinct days covered by blood pressure history. A day count, not a record
   * count. Maps to `cascade:bloodPressureDays`.
   */
  bloodPressureDays?: number;

  /**
   * Distinct days covered by activity history. A day count, not a record
   * count. Maps to `cascade:activityDays`.
   */
  activityDays?: number;

  /**
   * Distinct nights covered by sleep history. A night count, not a record
   * count. Maps to `cascade:sleepDays`.
   */
  sleepDays?: number;
}

/**
 * Severity of a flagged interaction.
 *
 * Constrained by `cascade:InteractionScenarioShape` with
 * `sh:in ("low" "moderate" "high" "critical")`.
 */
export type InteractionSeverity = 'low' | 'moderate' | 'high' | 'critical';

/**
 * A clinically significant interaction that can only be detected by
 * correlating resources of differing provenance, for example an EHR-prescribed
 * drug against a self-reported supplement against a lab value.
 *
 * Cascade-specific by design: no ratified vocabulary models cross-provenance
 * correlation as a first-class thing.
 *
 * Serializes as `cascade:InteractionScenario` in Turtle.
 */
export interface InteractionScenario extends CascadeEntity {
  type: 'InteractionScenario';

  /**
   * Human-readable title of the interaction. Required by
   * `cascade:InteractionScenarioShape`. Maps to `dcterms:title`.
   */
  title?: string;

  /** Longer description of the interaction. Maps to `dcterms:description`. */
  description?: string;

  /**
   * IRIs of the pod resources a consumer must read together to detect this
   * interaction. Required by the shape: a scenario that names no resources
   * states a risk exists but gives a consumer nothing to check it against.
   * Maps to `cascade:involvedResources` (an `rdf:List`).
   */
  involvedResources?: string[];

  /** Severity of the flagged interaction. Maps to `cascade:severity`. */
  severity?: InteractionSeverity;

  /**
   * True when detecting this interaction requires correlating resources of
   * different `cascade:dataProvenance`. The distinguishing property of this
   * class: a single-source consumer cannot find it.
   * Maps to `cascade:requiresCrossProvenance` (`xsd:boolean`).
   */
  requiresCrossProvenance?: boolean;
}
