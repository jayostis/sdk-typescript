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

import { NAMESPACES } from '../vocabularies/namespaces.js';

const clinical = NAMESPACES.clinical;
const coverage = NAMESPACES.coverage;

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

/**
 * Deprecated classes whose successor spec does not state in a triple.
 *
 * `deprecated class IRI -> the class that superseded it`. Four of the five
 * deprecated classes carry a correct `rdfs:seeAlso` and are derived from it;
 * this is the fifth.
 *
 * `clinical:CoverageRecord`'s `rdfs:seeAlso` points at `fhir:Coverage` — a
 * documentation link, not the superseding class — so the supersession exists
 * only in its `rdfs:comment`. It is the one deprecation whose replacement lives
 * in a different vocabulary, which is the case a consumer is least able to
 * guess. `jayostis/spec#50` gap 2 asks for the triple; this row goes when it
 * lands.
 */
export const SUPERSEDES_OVERRIDES: Readonly<Record<string, string>> = {
  [`${clinical}CoverageRecord`]: `${coverage}InsurancePlan`,
};
