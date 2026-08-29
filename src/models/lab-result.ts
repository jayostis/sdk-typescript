/**
 * Lab result data model for the Cascade Protocol.
 *
 * Represents a laboratory test result, typically sourced from EHR imports.
 *
 * RDF type: `health:LabResultRecord`
 * Vocabulary: `https://ns.cascadeprotocol.org/health/v1#`
 *
 * @see https://cascadeprotocol.org/docs/cascade-protocol-schemas
 */

import type { CascadeRecord, LabInterpretation, MultiValue } from './common.js';

/**
 * A lab result record in the Cascade Protocol.
 *
 * Required fields: `testName`, `dataProvenance`, `schemaVersion`.
 * All date fields use ISO 8601 string format.
 *
 * Serializes as `health:LabResultRecord` in Turtle.
 */
export interface LabResult extends CascadeRecord {
  type: 'LabResultRecord';

  /**
   * Name of the laboratory test (e.g., `"Hemoglobin A1c"`).
   * Maps to `health:testName` in Turtle serialization.
   */
  testName: string;

  /**
   * Numeric or string result value (e.g., `"7.2"`, `"112"`).
   * Maps to `health:resultValue` in Turtle serialization.
   */
  resultValue?: string;

  /**
   * Unit of the result value (e.g., `"%"`, `"mg/dL"`, `"mEq/L"`).
   * Maps to `health:resultUnit` in Turtle serialization.
   */
  resultUnit?: string;

  /**
   * Reference range for normal values (e.g., `"4.0 - 5.6"`, `"< 100"`).
   * Maps to `health:referenceRange` in Turtle serialization.
   */
  referenceRange?: string;

  /**
   * Clinical interpretation of the result.
   * Maps to `health:interpretation` in Turtle serialization.
   */
  interpretation?: LabInterpretation;

  /**
   * Date and time the test was performed (ISO 8601).
   * Maps to `health:performedDate` in Turtle serialization.
   */
  performedDate?: string;

  /**
   * LOINC code URI, or URIs, for this test. Repeatable: FHIR R4
   * `CodeableConcept.coding` is 0..*, and an `Observation.code` routinely
   * carries more than one coding for the same test.
   * Maps to one `health:testCode` URI-reference triple per value.
   */
  testCode?: MultiValue<string>;

  /**
   * Laboratory category, or categories (e.g., `"Chemistry"`, `"Hematology"`).
   * Repeatable: FHIR R4 `Observation.category` is 0..*, and real exports
   * categorise one result several ways at once.
   * Maps to one `health:labCategory` triple per value.
   */
  labCategory?: MultiValue<string>;

  /**
   * Type of specimen collected (e.g., `"Whole Blood"`, `"Serum"`).
   * Maps to `health:specimenType` in Turtle serialization.
   */
  specimenType?: string;

  /**
   * Date and time the result was reported (ISO 8601).
   * Maps to `health:reportedDate` in Turtle serialization.
   */
  reportedDate?: string;

  /**
   * Name of the clinician who ordered the test.
   * Maps to `health:orderingProvider` in Turtle serialization.
   */
  orderingProvider?: string;

  /**
   * Name of the laboratory that performed the test.
   * Maps to `health:performingLab` in Turtle serialization.
   */
  performingLab?: string;

  /**
   * IRI of the `clinical:Encounter` (visit context) this observation was
   * recorded within. FHIR alignment: `Observation.encounter`.
   * Maps to `clinical:hasEncounter` (clinical v1.10).
   */
  hasEncounter?: string;

  /**
   * The interpretation code the SOURCE wrote, copied verbatim, for the case
   * where it is a member of neither value set `interpretation` is bound to
   * (health v2.7).
   *
   * Deliberately unconstrained in its VALUE: a value set or a pattern here
   * would recreate exactly the loss the property exists to prevent.
   *
   * Repeatable, for the same reason the writer emits a triple per value:
   * `health:LabResultRecordShape` caps this at `sh:maxCount 1`, and a shape can
   * only judge what reached the graph, so a merged record carrying two source
   * codes has to arrive with both for the cap to have anything to report —
   * which is what `lab-013` is the fixture for. The reader returns every triple
   * it finds, so a record that went in with two comes back with two — narrow
   * with {@link asArray} before reaching for a string method.
   *
   * Maps to one `health:interpretationSourceCode` triple per value.
   */
  interpretationSourceCode?: MultiValue<string>;
}
