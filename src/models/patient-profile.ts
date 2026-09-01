/**
 * Patient profile data model for the Cascade Protocol.
 *
 * Represents the core demographic and identification data for a patient,
 * including optional nested structures for emergency contact, address,
 * and preferred pharmacy.
 *
 * RDF type: `cascade:PatientProfile`
 * Vocabulary: `https://ns.cascadeprotocol.org/core/v1#`
 *
 * @see https://cascadeprotocol.org/docs/cascade-protocol-schemas
 */

import type {
  CascadeRecord,
  BiologicalSex,
  AgeGroup,
  BloodType,
  MultiValue,
} from './common.js';

/**
 * Emergency contact information for a patient.
 *
 * Serializes as a blank node of type `cascade:EmergencyContact` in Turtle.
 */
export interface EmergencyContact {
  /**
   * Name of the emergency contact.
   * Maps to `cascade:contactName` in Turtle serialization.
   */
  contactName: string;

  /**
   * Relationship of the contact to the patient (e.g., `"spouse"`, `"parent"`).
   * Maps to `cascade:contactRelationship` in Turtle serialization.
   */
  contactRelationship?: string;

  /**
   * Phone number of the emergency contact.
   * Maps to `cascade:contactPhone` in Turtle serialization.
   */
  contactPhone?: string;
}

/**
 * Postal address for a patient.
 *
 * Serializes as a blank node of type `cascade:Address` in Turtle.
 */
export interface Address {
  /**
   * Street address line.
   * Maps to `cascade:addressLine` in Turtle serialization.
   */
  addressLine?: string;

  /**
   * City name.
   * Maps to `cascade:addressCity` in Turtle serialization.
   */
  addressCity?: string;

  /**
   * State or province code.
   * Maps to `cascade:addressState` in Turtle serialization.
   */
  addressState?: string;

  /**
   * Postal / ZIP code.
   * Maps to `cascade:addressPostalCode` in Turtle serialization.
   */
  addressPostalCode?: string;

  /**
   * Country code (e.g., `"US"`).
   * Maps to `cascade:addressCountry` in Turtle serialization.
   */
  addressCountry?: string;

  /**
   * Address use type (e.g., `"home"`, `"work"`).
   * Maps to `cascade:addressUse` in Turtle serialization.
   */
  addressUse?: string;

  /**
   * Address classification: `"postal"`, `"physical"` or `"both"`, constrained
   * by `sh:in` on `cascade:AddressShape`.
   * Maps to `cascade:addressType` in Turtle serialization.
   */
  addressType?: string;
}

/**
 * Preferred pharmacy information for a patient.
 *
 * Serializes as a blank node of type `cascade:PharmacyInfo` in Turtle.
 */
export interface PharmacyInfo {
  /**
   * Name of the pharmacy.
   * Maps to `cascade:pharmacyName` in Turtle serialization.
   */
  pharmacyName: string;

  /**
   * Full address of the pharmacy.
   * Maps to `cascade:pharmacyAddress` in Turtle serialization.
   */
  pharmacyAddress?: string;

  /**
   * Phone number of the pharmacy.
   * Maps to `cascade:pharmacyPhone` in Turtle serialization.
   */
  pharmacyPhone?: string;
}

/**
 * A patient profile record in the Cascade Protocol.
 *
 * Required fields: `dateOfBirth`, `biologicalSex`, `dataProvenance`, `schemaVersion`.
 * Date of birth uses ISO 8601 date format (YYYY-MM-DD).
 *
 * Serializes as `cascade:PatientProfile` in Turtle.
 */
export interface PatientProfile extends CascadeRecord {
  type: 'PatientProfile';

  /**
   * Date of birth (ISO 8601 date: `YYYY-MM-DD`).
   * Maps to `cascade:dateOfBirth` in Turtle serialization.
   */
  dateOfBirth: string;

  /**
   * Biological sex for clinical calculations.
   * Maps to `cascade:biologicalSex` in Turtle serialization.
   */
  biologicalSex: BiologicalSex;

  /**
   * Computed age in years based on date of birth.
   * Maps to `cascade:computedAge` in Turtle serialization.
   */
  computedAge?: number;

  /**
   * Age group classification.
   * Maps to `cascade:ageGroup` in Turtle serialization.
   */
  ageGroup?: AgeGroup;

  /**
   * Full display name of the patient.
   * Maps to `foaf:name` in Turtle serialization.
   */
  name?: string;

  /**
   * Given (first) name of the patient.
   * Maps to `foaf:givenName` in Turtle serialization.
   */
  givenName?: string;

  /**
   * Family (last) name of the patient.
   * Maps to `foaf:familyName` in Turtle serialization.
   */
  familyName?: string;

  /**
   * Blood type classification.
   * Maps to `health:bloodType` in Turtle serialization.
   */
  bloodType?: BloodType;

  /**
   * Gender identity as self-reported by the patient.
   * Maps to `cascade:genderIdentity` in Turtle serialization.
   */
  genderIdentity?: string;

  /**
   * Unique profile identifier (typically a UUID).
   * Maps to `cascade:profileId` in Turtle serialization.
   */
  profileId?: string;

  /**
   * Emergency contact information.
   * Maps to `cascade:emergencyContact` as a blank node in Turtle serialization.
   *
   * ZERO OR MORE, unlike `address` and `preferredPharmacy` beside it:
   * `cascade:PatientProfileShape` declares an `sh:maxCount 1` for those two and
   * none for this one, because a patient may name more than one person to call.
   * One contact in writes one blank node and reads back as a bare object; N
   * write N and read back as an N-element array.
   */
  emergencyContact?: MultiValue<EmergencyContact>;

  /**
   * Patient address.
   * Maps to `cascade:address` as a blank node in Turtle serialization.
   */
  address?: Address;

  /**
   * Preferred pharmacy information.
   * Maps to `cascade:preferredPharmacy` as a blank node in Turtle serialization.
   */
  preferredPharmacy?: PharmacyInfo;
}
