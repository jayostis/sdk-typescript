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

import type { CascadeRecord, LabInterpretation } from './common.js';

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
   * LOINC code URI for this test.
   * Maps to `health:testCode` in Turtle serialization as a URI reference.
   */
  testCode?: string;

  /**
   * Laboratory category (e.g., `"Chemistry"`, `"Hematology"`).
   * Maps to `health:labCategory` in Turtle serialization.
   */
  labCategory?: string;

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
}
