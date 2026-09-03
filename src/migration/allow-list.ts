/**
 * Which record types have moved onto the spec-derived engine.
 *
 * ONE LIST, IN ONE PLACE, READ THROUGH ONE MODULE. #69 replaces this SDK's
 * hand-transcribed vocabulary with an engine that reads what `spec` publishes,
 * and that cannot land in one commit for thirty-six record types at once. So
 * each seam asks this: is the type in front of me migrated yet? A type not
 * named here takes the path it takes today, unchanged.
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
 *   depending on which word the caller used. `rdfTypeUri` is one string per
 *   record type and is derived from the ontologies, so it names the record
 *   type rather than a way of spelling it.
 *
 * A `.ts` const rather than a JSON file the way `spec-sources.json` is one:
 * `src/` cannot read a file at runtime — a consumer installs `dist` and every
 * bundler resolves imports statically — and a list the compiler checks is one
 * fewer thing to parse defensively.
 *
 * @module migration
 */

/**
 * The migrated classes, as full IRIs.
 *
 * EMPTY, AND THAT IS THE CURRENT STATE rather than a placeholder. Nothing has
 * been migrated: #90 builds this mechanism and #81 is the first change to add a
 * line to it. An empty list answers "no" to every question, which is exactly
 * what is true today.
 *
 * Add one entry per record type, with the issue that migrated it:
 *
 * ```ts
 * export const MIGRATED_CLASSES: readonly string[] = [
 *   'https://ns.cascadeprotocol.org/health/v1#ImmunizationRecord',  // #81
 * ];
 * ```
 *
 * A deprecated spelling is NOT a separate entry — see {@link migrationStateOf},
 * which refuses one. A record type migrates whole or not at all.
 */
export const MIGRATED_CLASSES: readonly string[] = [];
