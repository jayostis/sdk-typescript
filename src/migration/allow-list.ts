/**
 * Which record types have moved onto the spec-derived engine, and on which path.
 *
 * ONE LIST, IN ONE PLACE, READ THROUGH ONE MODULE. #69 replaces this SDK's
 * hand-transcribed vocabulary with an engine that reads what `spec` publishes,
 * and that cannot land in one commit for seventy-nine record types across three
 * paths at once. So each seam asks this: is the type in front of me routed, for
 * the thing I am about to do? A type not named here takes the path it takes
 * today, unchanged.
 *
 * KEYED ON `rdfTypeUri`, NOT ON A TYPE NAME, and not on `TYPE_MAPPING.rdfType`.
 * Two reasons, and both are about what survives:
 *
 * - `TYPE_MAPPING` is hand-written in `src/vocabularies/`, which is the
 *   directory this migration DELETES. Keying the switch on the table the
 *   migration removes is circular.
 * - A name-keyed list can migrate one spelling and not its synonym. Three
 *   record types answer to two names each, so `['Procedure']` would leave
 *   `ProcedureRecord` on the old path — the same record, read two ways,
 *   depending on which word the caller used.
 *
 * AND PER PATH, which #75 is explicit about. Serializing, deserializing and
 * validating are three independent migrations: the writer for a type can be
 * ready while its validator is not, and a switch that could only say "migrated"
 * would force all three to move together or none to move at all. The A/B #81
 * runs is per (type, path) — 79 × 3 pairs, not 79.
 *
 * @module migration
 */

/** The three things this SDK does with a record, migrated independently. */
export type MigrationPath = 'serialize' | 'deserialize' | 'validate';

/** Every path, for callers that report rather than ask. */
export const MIGRATION_PATHS: readonly MigrationPath[] = ['serialize', 'deserialize', 'validate'];

/**
 * `class IRI -> the paths that class is routed on`.
 *
 * ONE ENTRY. `health:ImmunizationRecord` writes through
 * `src/converter/to-rdf.ts`, which reads spec's contexts and ontologies and no
 * table of ours; `tests/converter/to-rdf.test.ts` compares its output to all
 * three `imm-*` fixtures as graphs and finds no difference. It is judged by
 * `src/shacl/evaluate.ts` over the shapes spec publishes, shipped as data;
 * `tests/shacl/imm-agreement.test.ts` hands the engine and `rdf-validate-shacl`
 * one graph each and finds no disagreement (#98).
 *
 * It is routed for `serialize` and `validate`, and NOT `deserialize`,
 * deliberately. There is no generic reader yet — that is #78's
 * `convertFromRdf`. Listing a path with nothing behind it would make the
 * switch lie, and the per-path key exists precisely so that it does not have
 * to.
 */
export const MIGRATED_CLASSES: Readonly<Record<string, readonly MigrationPath[]>> = {
  'https://ns.cascadeprotocol.org/health/v1#ImmunizationRecord': ['serialize', 'validate'],
};
