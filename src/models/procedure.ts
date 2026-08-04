/**
 * Procedure data model for the Cascade Protocol.
 *
 * Represents a clinical procedure record.
 *
 * RDF type: `clinical:Procedure`
 * Vocabulary: `https://ns.cascadeprotocol.org/clinical/v1#`
 *
 * @see https://cascadeprotocol.org/docs/cascade-protocol-schemas
 */

import type { CascadeRecord, ProcedureStatus } from './common.js';

/**
 * A procedure record in the Cascade Protocol.
 *
 * Required fields: `procedureName`, `dataProvenance`, `schemaVersion`.
 * All date fields use ISO 8601 string format.
 *
 * Serializes as `clinical:Procedure` in Turtle.
 */
export interface Procedure extends CascadeRecord {
  type: 'Procedure';

  /**
   * Name of the procedure.
   * Maps to `clinical:procedureName` in Turtle serialization.
   */
  procedureName: string;

  /**
   * CPT procedure code (e.g., "67228" for retinal photocoagulation).
   * Maps to `clinical:cptCode` in Turtle serialization.
   */
  cptCode?: string;

  /**
   * Status of the procedure (e.g., "completed", "in-progress").
   * Maps to `clinical:procedureStatus` in Turtle serialization.
   */
  procedureStatus?: string;

  /**
   * Date and time the procedure was performed (ISO 8601).
   * Maps to `health:performedDate` in Turtle serialization.
   */
  performedDate?: string;

  /**
   * Current status of the procedure.
   * Maps to `health:status` in Turtle serialization.
   */
  status?: ProcedureStatus;

  /**
   * SNOMED CT code URI for this procedure.
   * Maps to `health:snomedCode` in Turtle serialization as a URI reference.
   */
  snomedCode?: string;

  /**
   * Name of the clinician who performed the procedure.
   * Maps to `health:performer` in Turtle serialization.
   */
  performer?: string;

  /**
   * Location where the procedure was performed.
   * Maps to `health:location` in Turtle serialization.
   */
  location?: string;

  /**
   * IRI of the `clinical:Encounter` (visit context) this procedure occurred
   * within. FHIR alignment: `Procedure.encounter`.
   * Maps to `clinical:hasEncounter` (clinical v1.10).
   */
  hasEncounter?: string;

  /**
   * IRIs of the conditions that are the clinical reason for this procedure, as
   * stated by the source. FHIR alignment: `Procedure.reasonReference`, which is
   * why clinical v1.11 dropped the property's original
   * `rdfs:domain clinical:Medication`.
   * Maps to `clinical:indicationReference`.
   */
  indicationReference?: string[];

  /**
   * IRIs of conditions an importer DERIVED by parsing a coded or free-text
   * reason on the record, as distinct from
   * {@link Procedure.indicationReference}. See
   * `Medication.parsedIndicationReference` for the full semantics.
   * Maps to `clinical:parsedIndicationReference` (clinical v1.12).
   */
  parsedIndicationReference?: string[];
}
