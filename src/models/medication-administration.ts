/**
 * MedicationAdministration data model for the Cascade Protocol.
 *
 * Represents a single administration event of a medication given at a
 * specific time by a provider (e.g., IV antibiotics pre-surgery, vaccine
 * injection at visit). Semantically distinct from Medication (ongoing
 * regimens): represents a one-time event, not an ongoing regimen.
 *
 * RDF type: `clinical:MedicationAdministration`
 * Vocabulary: `https://ns.cascadeprotocol.org/clinical/v1#`
 *
 * @see https://cascadeprotocol.org/docs/cascade-protocol-schemas
 */

import type { CascadeRecord, MultiValue } from './common.js';

/**
 * A medication administration event in the Cascade Protocol.
 *
 * Required fields: `medicationName`, `dataProvenance`, `schemaVersion`.
 *
 * Serializes as `clinical:MedicationAdministration` in Turtle.
 */
export interface MedicationAdministration extends CascadeRecord {
  type: 'MedicationAdministration';

  /** Name of the medication administered. Maps to `clinical:drugName`. */
  medicationName: string;

  /** Date and time of administration (ISO 8601). Maps to `clinical:administeredDate`. */
  administeredDate?: string;

  /** Dose administered (e.g., "1g", "500mg"). Maps to `clinical:administeredDose`. */
  administeredDose?: string;

  /** Route of administration: oral, IV, IM, subcutaneous, topical. Maps to `clinical:administeredRoute`. */
  administeredRoute?: string;

  /** Administration status: completed, not-done, in-progress. Maps to `clinical:administrationStatus`. */
  administrationStatus?: string;

  /**
   * SNOMED CT code URI, or URIs, for the medication concept. Repeatable: FHIR R4
   * `CodeableConcept.coding` is 0..*. Maps to one `health:snomedCode` triple per value.
   */
  snomedCode?: MultiValue<string>;

  /**
   * IRI of the `clinical:Encounter` this administration occurred within.
   * Maps to `clinical:hasEncounter` (clinical v1.10).
   */
  hasEncounter?: string;

  /**
   * IRIs of the conditions that are the clinical reason for this
   * administration, as stated by the source. FHIR alignment:
   * `MedicationAdministration.reasonReference`.
   * Maps to `clinical:indicationReference`.
   */
  indicationReference?: string[];

  /**
   * IRIs of conditions an importer DERIVED by parsing a coded or free-text
   * reason on the record. See `Medication.parsedIndicationReference`.
   * Maps to `clinical:parsedIndicationReference` (clinical v1.12).
   */
  parsedIndicationReference?: string[];
}
