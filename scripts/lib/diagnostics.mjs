/**
 * The build diagnostics surface: what a generator records, and what the
 * collector and renderer read back.
 *
 * STUB. Every export here is the smallest thing that lets `tests/diagnostics/`
 * fail on its assertions rather than on a missing symbol; none of them does
 * anything yet. The signatures are the contract those tests were written to,
 * and the implementation is expected to keep them:
 *
 * - `DIAGNOSTIC_CODES` — every `code` a finding may carry, as a readonly array.
 * - `withFindings({ source, dir }, run)` — one generator's write cycle. Deletes
 *   `<dir>/<source>.json` FIRST, hands `run` a recorder whose `record(finding)`
 *   takes `{ code, severity, subject, owner, location, ...details }` and
 *   assigns `id` (`` `${code}:${subject}` ``) and `source`, then writes the
 *   array at the end. A throw from `run` propagates and writes nothing.
 * - `renderMarkdown(diagnostics, templatePath)` — the merged `diagnostics.json`
 *   document as markdown, headed by the template file's text. Owner groups
 *   (heading text beginning with the owner) come before severity; each code
 *   section's heading carries the code and links `docs/spec-diagnostics.md#<code>`;
 *   each row names its code, subject and every `location` path.
 * - `answerKeyDrift(codes, markdown)` — `{ undocumented, unknown }`: the codes
 *   with no `` ### `<code>` `` anchor in `markdown`, and the anchors naming no
 *   code.
 *
 * @module scripts/lib/diagnostics
 */

/** @type {readonly string[]} */
export const DIAGNOSTIC_CODES = Object.freeze([]);

/**
 * @template T
 * @param {{ source: string, dir: string }} cycle
 * @param {(findings: { record(finding: object): void }) => T} run
 * @returns {T}
 */
export function withFindings(cycle, run) {
  return run({ record() {} });
}

/**
 * @param {{ commit: string | null, findings: object[] }} diagnostics
 * @param {string} templatePath
 * @returns {string}
 */
export function renderMarkdown(diagnostics, templatePath) {
  return '';
}

/**
 * @param {Iterable<string>} codes
 * @param {string} markdown
 * @returns {{ undocumented: string[], unknown: string[] }}
 */
export function answerKeyDrift(codes, markdown) {
  return { undocumented: [], unknown: [] };
}
