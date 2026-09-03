/**
 * Everything about record types that spec does not say, and why.
 *
 * FIVE ROWS. This file held forty-eight before the table was derived — thirty-
 * nine class mappings, six overrides and three canonical names — and every one
 * of those is now read out of `src/spec/`. What is left is the residue: two
 * names spec publishes differently or not at all, two input spellings that are
 * ours alone, and one supersession spec states only in prose.
 *
 * EVERY ROW NAMES THE ISSUE THAT DELETES IT. A row with no issue behind it is a
 * fact about this SDK; a row with one is a workaround with an end date. Four of
 * the five below are the latter.
 *
 * @module record-types
 */

/**
 * The namespaces these five rows name, written out.
 *
 * NOT IMPORTED FROM `src/vocabularies/`, which #87 deletes — a module that
 * survives its own epic cannot import from one that does not. Every other
 * class IRI in this directory is derived from the shipped ontologies; these
 * five are hand-written by definition, since an override is a fact spec does
 * not state, so writing the namespace beside them costs nothing that was not
 * already being paid.
 */
const clinical = 'https://ns.cascadeprotocol.org/clinical/v1#';
const coverage = 'https://ns.cascadeprotocol.org/coverage/v1#';

/**
 * Where the name this SDK returns is not the name spec publishes.
 *
 * `class IRI -> the name a read RETURNS`. The name spec published stays
 * accepted on input — see {@link recordTypeFor} — so an override adds a
 * spelling rather than replacing one.
 */
export const NAME_OVERRIDES: Readonly<Record<string, string>> = {
  // `../spec/contexts/v1/clinical.jsonld:26` publishes `Medication`. This SDK
  // has published `MedicationRecord` since v1.0.0, in `src/models/medication.ts`
  // as a string-literal type and in all eleven `med-*` conformance fixtures.
  //
  // NOT A LEGACY MISTAKE, which is why it is not simply dropped. Spec names
  // record classes `*Record` throughout `health:` — AllergyRecord,
  // ConditionRecord, LabResultRecord, ImmunizationRecord, FamilyHistoryRecord,
  // SocialHistoryRecord — and bare under the older `clinical:`. This SDK
  // applied the dominant convention to a class that does not follow it. Which
  // convention is normative is `jayostis/spec#51`; until that is answered,
  // changing this would break every `med-*` fixture, and those are upstream.
  [`${clinical}Medication`]: 'MedicationRecord',

  // Two vocabularies declare `SocialHistoryRecord` and a context key is unique,
  // so one of the two classes can have no published name however good the data
  // is — `jayostis/spec#50` gap 3c. `health:` is consumer-reported; `clinical:`
  // is EHR-extracted from a C-CDA Social History section, with its own consent
  // scope and its own pod path. They are different records and must not share a
  // name; this SDK invented the disambiguating one.
  [`${clinical}SocialHistoryRecord`]: 'ClinicalSocialHistoryRecord',
};

/**
 * Spellings accepted on input that spec publishes for nothing.
 *
 * `alias -> class IRI`. Never returned. These exist because callers and stored
 * JSON use them, and refusing a name this package has accepted for three major
 * versions would be a breaking change dressed up as tidiness.
 */
export const INPUT_ALIASES: Readonly<Record<string, string>> = {
  // Spec publishes `Procedure` and so does this SDK; `ProcedureRecord` was
  // additionally accepted, and was — until #42 — what a read RETURNED, though
  // `src/models/procedure.ts:23` declares the type as `'Procedure'` alone.
  ProcedureRecord: `${clinical}Procedure`,

  // Settled by #26. Both spellings reach `serialize()` so JSON off disk can
  // name either, and only `InsurancePlan` comes back.
  CoverageRecord: `${coverage}InsurancePlan`,
};

// There is no SUPERSEDES_OVERRIDES table any more, and its absence is the
// point. It held one row — `clinical:CoverageRecord -> coverage:InsurancePlan`
// — because that class's `rdfs:seeAlso` pointed at `fhir:Coverage`, a
// documentation link rather than the superseding class, leaving the
// supersession stated only in an `rdfs:comment` no reader can act on. That was
// `jayostis/spec#50` gap 2. Spec states the triple now, all five deprecated
// classes derive their successor from `rdfs:seeAlso`, and the row was deleted
// when `conformance/scripts/SPEC_PIN` moved to the revision carrying it.
//
// It was found by the test that asserted it was still needed, not by anyone
// remembering to look.
