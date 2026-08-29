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
 * One participation in an encounter (clinical v1.16): a named person together
 * with the role they played in that visit, and their specialty where the source
 * states it.
 *
 * Mirrors the FHIR R4 `Encounter.participant` BackboneElement. US Core marks
 * `participant`, `participant.type` and `participant.individual` all Must
 * Support.
 *
 * ## Why a structured node rather than role-qualified predicates
 *
 * The rejected alternative was a family of flat predicates on the Encounter
 * itself (an attending name, a referrer name, and so on). It fails on both axes
 * of the real data: the role vocabulary is EXTENSIBLE, so any fixed family of
 * predicates silently drops the local roles a server is entitled to send; and a
 * visit routinely carries several participants in the SAME role, which
 * one-predicate-per-role cannot represent.
 *
 * ## Why a blank node
 *
 * `clinical:EncounterParticipantShape` deliberately does NOT declare
 * `sh:nodeKind sh:IRI`: "nothing points at a participation from another file,
 * so requiring an IRI would forbid the blank node a serializer may reasonably
 * write for a structural sub-node." This SDK writes it inline, the same way an
 * export manifest carries its `cascade:RecordSummary` sub-nodes.
 *
 * Every field is optional, matching the shape, which asserts no `sh:minCount`
 * on any of them because FHIR makes every sub-element of `Encounter.participant`
 * optional.
 *
 * Serializes as an inline `clinical:EncounterParticipant` blank node.
 *
 * @see https://hl7.org/fhir/R4/encounter-definitions.html#Encounter.participant
 */
export interface EncounterParticipant {
  /**
   * Display name of the person who participated, verbatim from
   * `Encounter.participant.individual.display`.
   *
   * A display name, NOT a resolvable reference: this vocabulary defines no
   * practitioner class, and inventing one to hold a display string would be a
   * larger claim than the source supports.
   *
   * Maps to `clinical:participantName`. `sh:maxCount 1`, matching FHIR
   * `Encounter.participant.individual` 0..1.
   */
  participantName?: string;

  /**
   * Human-readable role this participant played, from
   * `Encounter.participant.type` `CodeableConcept.text` or the first coding's
   * display: `"attender"`, `"referrer"`, `"consultant"`.
   *
   * The label is what makes a stored name interpretable; a name recorded with
   * no role is indistinguishable from a treating clinician's.
   *
   * Maps to `clinical:participantRole`. `sh:maxCount 1`.
   */
  participantRole?: string;

  /**
   * Coded role from `Encounter.participant.type`, verbatim. REPEATABLE (0..*),
   * because the source element is.
   *
   * NOT typed as a union: FHIR R4 binds this element EXTENSIBLY to
   * `encounter-participant-type`, so a server may send a local role code and
   * remain conformant, and rejecting one would discard the participant along
   * with it. The shape binds no `sh:in` for the same reason.
   *
   * Maps to one `clinical:participantRoleCode` triple per value.
   */
  participantRoleCode?: MultiValue<string>;

  /**
   * The clinical specialty this participant acted in during the encounter, as a
   * display string: `"Dermatology"`, `"Sleep Medicine"`.
   *
   * Recorded on the participation rather than on a practitioner because
   * specialty in FHIR is a property of the ROLE, not of the person: the same
   * clinician has different specialties in different roles, and it is the one
   * they acted in on this visit that describes the visit. Semantics mirror
   * `PractitionerRole.specialty`; servers commonly convey it on
   * `Encounter.participant` as an extension rather than by resolving a
   * PractitionerRole, which is why it is a string and not an edge.
   *
   * Maps to `clinical:participantSpecialty`. `sh:maxCount 1`.
   */
  participantSpecialty?: string;
}

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
   * Human-readable display of `Encounter.class`, verbatim from
   * `Coding.display` (clinical v1.16).
   *
   * Carried ALONGSIDE, never instead of, {@link Encounter.encounterClass}. The
   * code stays because it is what a round-trip export must restore and what a
   * code-system lookup keys on; the display is stored because
   * `Encounter.class` is bound only extensibly, so the code often comes from a
   * local system and is unreadable on its own.
   *
   * Maps to `clinical:encounterClassDisplay` in Turtle serialization.
   */
  encounterClassDisplay?: string;

  /**
   * The code system `Encounter.class`'s code is drawn from, verbatim from
   * `Coding.system` (clinical v1.16). Typically
   * `http://terminology.hl7.org/CodeSystem/v3-ActCode`, or a `urn:oid:` URI
   * where the source used a local system.
   *
   * This is the only thing that distinguishes a ratified ActEncounterCode from
   * a locally-numbered category that happens to look like one; without it a
   * consumer cannot tell whether a stored class code is safe to map.
   *
   * Written as a plain string literal. The vocabulary ranges it `xsd:anyURI`,
   * and `clinical:EncounterShape` accepts `xsd:anyURI` OR `xsd:string` via
   * `sh:or` precisely "because serializers differ on which of the two they
   * write for a URI-valued literal".
   *
   * Maps to `clinical:encounterClassSystem` in Turtle serialization.
   */
  encounterClassSystem?: string;

  /**
   * Why the visit happened, in the chart's own words: `Encounter.reasonCode`
   * `CodeableConcept.text`, or the first coding's display (clinical v1.16).
   * US Core Must Support. REPEATABLE, 0..*, because the source element is.
   *
   * NOT typed as a union and bound to no value set. The FHIR binding is
   * PREFERRED — the weakest binding that still names a value set — and real
   * exports carry local, free-text and SNOMED CT reasons in the same field, so
   * an enum here would reject conformant data.
   *
   * Where a coded reason resolves to a record already in the pod,
   * `indicationReference` / `parsedIndicationReference` carry the traversable
   * edge; this property carries what the source said.
   *
   * Maps to one `clinical:encounterReason` triple per value.
   */
  encounterReason?: MultiValue<string>;

  /**
   * Where the patient came from before this encounter:
   * `Encounter.hospitalization.admitSource` `CodeableConcept.text` or the first
   * coding's display, verbatim (clinical v1.16).
   *
   * Presence of an `Encounter.hospitalization` element is itself the structured
   * signal that an encounter was an admission rather than an office visit, and
   * through clinical v1.15 this vocabulary had nowhere to put it, so that
   * distinction was unrecoverable from the pod. No value set is bound: the FHIR
   * binding is preferred, not required.
   *
   * Maps to `clinical:admitSource` in Turtle serialization.
   */
  admitSource?: string;

  /**
   * Where the patient went after this encounter:
   * `Encounter.hospitalization.dischargeDisposition` `CodeableConcept.text` or
   * the first coding's display, verbatim (clinical v1.16). US Core Must
   * Support. For example `"Home or Self Care"`.
   *
   * No value set is bound: the R4 base binding is EXAMPLE strength, which is
   * the clearest possible case for not binding one.
   *
   * Maps to `clinical:dischargeDisposition` in Turtle serialization.
   */
  dischargeDisposition?: string;

  /**
   * The participations in this encounter (clinical v1.16). REPEATABLE, 0..*,
   * matching FHIR R4 `Encounter.participant`.
   *
   * An encounter commonly carries an attender, a referrer and an authorizing
   * physician at once, and which of them actually saw the patient is only
   * answerable if all of them are kept with their roles attached.
   *
   * Each element serializes as an inline `clinical:EncounterParticipant` blank
   * node under `clinical:hasParticipant`.
   */
  hasParticipant?: EncounterParticipant[];

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
