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
   * clinical v1.15 binds `clinical:VitalSignShape`'s interpretation to the
   * 74-value set, so this is no longer an open binding and the previous
   * `VitalInterpretation | string` type (which TypeScript collapses to
   * `string`, documenting nothing) is gone.
   *
   * A source code in neither ratified value set does not go here: it goes
   * verbatim on {@link VitalSign.interpretationSourceCode}, with the nearest
   * ratified reading on this property. That pairing is why the type can be
   * narrowed without losing what the source said.
   *
   * Maps to `clinical:interpretation` in Turtle serialization.
   */
  interpretation?: VitalInterpretation;

  /**
   * The interpretation code the SOURCE wrote, copied verbatim, for the case
   * where it is a member of neither value set `interpretation` is bound to
   * (health v2.7 / clinical v1.15).
   *
   * Deliberately unconstrained in its VALUE: a value set or a pattern here
   * would recreate exactly the loss the property exists to prevent.
   *
   * Repeatable, for the same reason the writer emits a triple per value:
   * `clinical:VitalSignShape` caps this at `sh:maxCount 1`, and a shape can
   * only judge what reached the graph, so a merged record carrying two source
   * codes has to arrive with both for the cap to have anything to report. The
   * reader returns every triple it finds, so a record that went in with two
   * comes back with two — narrow with {@link asArray} before reaching for a
   * string method.
   *
   * Maps to one `clinical:interpretationSourceCode` triple per value.
   */
  interpretationSourceCode?: MultiValue<string>;
}
