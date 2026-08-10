/**
 * Condition data model for the Cascade Protocol.
 *
 * Represents a clinical condition or diagnosis, sourced from EHR imports
 * or self-reported by the patient.
 *
 * RDF type: `health:ConditionRecord`
 * Vocabulary: `https://ns.cascadeprotocol.org/health/v1#`
 *
 * @see https://cascadeprotocol.org/docs/cascade-protocol-schemas
 */

import type { CascadeRecord, ConditionStatus, MultiValue } from './common.js';

/**
 * A condition record in the Cascade Protocol.
 *
 * Required fields: `conditionName`, `status`, `dataProvenance`, `schemaVersion`.
 * All date fields use ISO 8601 string format.
 *
 * Serializes as `health:ConditionRecord` in Turtle.
 */
export interface Condition extends CascadeRecord {
  type: 'ConditionRecord';

  /**
   * Name of the condition or diagnosis.
   * Maps to `health:conditionName` in Turtle serialization.
   */
  conditionName: string;

  /**
   * Clinical status of the condition.
   * Maps to `health:status` in Turtle serialization.
   */
  status: ConditionStatus;

  /**
   * Date of condition onset (ISO 8601).
   * Maps to `health:onsetDate` in Turtle serialization.
   */
  onsetDate?: string;

  /**
   * ICD-10-CM code URI, or URIs, for this condition. Repeatable: FHIR R4
   * `CodeableConcept.coding` is 0..*, and dual-coded problem-list entries are
   * ordinary EHR output.
   * Maps to one `health:icd10Code` URI-reference triple per value.
   */
  icd10Code?: MultiValue<string>;

  /**
   * SNOMED CT code URI, or URIs, for this condition. Repeatable for the same
   * reason as {@link Condition.icd10Code}.
   * Maps to one `health:snomedCode` URI-reference triple per value.
   */
  snomedCode?: MultiValue<string>;

  /**
   * Clinical classification of the condition (e.g., `"cardiovascular"`, `"endocrine"`, `"respiratory"`).
   * Maps to `health:conditionClass` in Turtle serialization.
   */
  conditionClass?: string;

  /**
   * List of vital sign types that should be monitored for this condition.
   * Maps to `health:monitoredVitalSigns` as an RDF list in Turtle serialization.
   */
  monitoredVitalSigns?: string[];

  /**
   * IRI of the `clinical:Encounter` (visit context) this condition was recorded
   * within. FHIR alignment: `Condition.encounter`.
   * Maps to `clinical:hasEncounter` (clinical v1.10).
   */
  hasEncounter?: string;

  /**
   * IRIs of related conditions, for example a complication and its root
   * condition. The traversable RDF replacement for
   * {@link Condition.linkedConditionIds}.
   * Maps to `clinical:linkedCondition` (clinical v1.10).
   */
  linkedCondition?: string[];

  /**
   * @deprecated Clinical v1.10 deprecated `clinical:linkedConditionIds`: it
   * packed related-condition UUIDs into one space-separated literal that no
   * graph query can traverse. Use {@link Condition.linkedCondition} instead.
   * Retained so existing data still round-trips; not emitted for new data.
   *
   * Maps to `clinical:linkedConditionIds`.
   */
  linkedConditionIds?: string;
}
