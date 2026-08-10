/**
 * Encounter data model for the Cascade Protocol.
 *
 * Represents a clinical encounter (office visit, consultation, procedure
 * appointment, etc.) sourced from EHR imports.
 *
 * RDF type: `clinical:Encounter`
 * Vocabulary: `https://ns.cascadeprotocol.org/clinical/v1#`
 *
 * @see https://cascadeprotocol.org/docs/cascade-protocol-schemas
 */

import type { CascadeRecord, MultiValue } from './common.js';

/**
 * A clinical encounter record in the Cascade Protocol.
 *
 * Required fields: `encounterType`, `dataProvenance`, `schemaVersion`.
 * All date fields use ISO 8601 string format.
 *
 * Serializes as `clinical:Encounter` in Turtle.
 */
export interface Encounter extends CascadeRecord {
  type: 'Encounter';

  /**
   * Human-readable description of the encounter type
   * (e.g., "Endocrinology office visit", "Ophthalmology consultation").
   * Maps to `clinical:encounterType` in Turtle serialization.
   */
  encounterType: string;

  /**
   * Encounter class code per HL7 ActCode (e.g., "AMB" for ambulatory,
   * "IMP" for inpatient, "EMER" for emergency).
   * Maps to `clinical:encounterClass` in Turtle serialization.
   */
  encounterClass?: string;

  /**
   * Status of the encounter (e.g., "finished", "in-progress", "cancelled").
   * Maps to `clinical:encounterStatus` in Turtle serialization.
   */
  encounterStatus?: string;

  /**
   * Date and time the encounter started (ISO 8601).
   * Maps to `clinical:encounterStart` in Turtle serialization.
   */
  encounterStart?: string;

  /**
   * Date and time the encounter ended (ISO 8601).
   * Maps to `clinical:encounterEnd` in Turtle serialization.
   */
  encounterEnd?: string;

  /**
   * Name and specialty of the provider who conducted the encounter.
   * Maps to `clinical:providerName` in Turtle serialization.
   */
  providerName?: string;

  /**
   * SNOMED CT code URI, or URIs, for the encounter type. Repeatable: FHIR R4
   * `CodeableConcept.coding` is 0..*.
   * Maps to one `clinical:snomedCode` triple per value.
   */
  snomedCode?: MultiValue<string>;
}
