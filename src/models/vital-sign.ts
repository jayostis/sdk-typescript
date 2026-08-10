/**
 * Vital sign data model for the Cascade Protocol.
 *
 * Represents a single vital sign measurement from clinical encounters
 * or device-generated readings.
 *
 * RDF type: `clinical:VitalSign`
 * Vocabulary: `https://ns.cascadeprotocol.org/clinical/v1#`
 *
 * @see https://cascadeprotocol.org/docs/cascade-protocol-schemas
 */

import type { CascadeRecord, VitalType, VitalInterpretation, MultiValue } from './common.js';

/**
 * A vital sign record in the Cascade Protocol.
 *
 * Required fields: `vitalType`, `value`, `unit`, `dataProvenance`, `schemaVersion`.
 * All date fields use ISO 8601 string format.
 *
 * Serializes as `clinical:VitalSign` in Turtle.
 */
export interface VitalSign extends CascadeRecord {
  type: 'VitalSign';

  /**
   * Enumerated vital sign type identifier.
   * Maps to `clinical:vitalType` in Turtle serialization.
   */
  vitalType: VitalType | string;

  /**
   * Human-readable name for the vital sign type (e.g., `"Systolic Blood Pressure"`).
   * Maps to `clinical:vitalTypeName` in Turtle serialization.
   */
  vitalTypeName?: string;

  /**
   * Numeric value of the measurement.
   * Maps to `clinical:value` in Turtle serialization.
   */
  value: number;

  /**
   * Unit of measurement (e.g., `"mmHg"`, `"bpm"`, `"degF"`, `"%"`).
   * Maps to `clinical:unit` in Turtle serialization.
   */
  unit: string;

  /**
   * Date and time when the measurement was taken (ISO 8601).
   * Maps to `clinical:effectiveDate` in Turtle serialization.
   */
  effectiveDate?: string;

  /**
   * LOINC code URI for this vital sign type.
   * Maps to `clinical:loincCode` in Turtle serialization as a URI reference.
   */
  loincCode?: string;

  /**
   * SNOMED CT code URI, or URIs, for this vital sign type. Repeatable: FHIR R4
   * `CodeableConcept.coding` is 0..*.
   * Maps to one `clinical:snomedCode` URI-reference triple per value.
   */
  snomedCode?: MultiValue<string>;

  /**
   * Lower bound of the normal reference range.
   * Maps to `clinical:referenceRangeLow` in Turtle serialization.
   */
  referenceRangeLow?: number;

  /**
   * Upper bound of the normal reference range.
   * Maps to `clinical:referenceRangeHigh` in Turtle serialization.
   */
  referenceRangeHigh?: number;

  /**
   * Clinical interpretation of the vital sign value.
   *
   * `clinical:VitalSignShape` puts no `sh:in` on this property, so the union is
   * advisory: it documents and autocompletes the ratified HL7 v3
   * ObservationInterpretation codes without rejecting a value the validator
   * accepts. Prefer a code from {@link VitalInterpretation}.
   *
   * Maps to `clinical:interpretation` in Turtle serialization.
   */
  interpretation?: VitalInterpretation | string;
}
