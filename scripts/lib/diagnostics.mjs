/**
 * The build diagnostics channel: what a generator records, what the collector
 * checks, and what the renderer reads back.
 *
 * WHY A CHANNEL AND NOT A PRINT. The generators have always found real spec
 * defects — a name two record classes claim, a range that is neither a code
 * list nor a structured class, a JSON key that means a different predicate
 * under a different context — and narrated them to stdout, where they
 * scrolled past and nothing downstream could act on them. A finding recorded
 * here is a row in `src/spec/diagnostics.json` and a line in
 * `src/spec/diagnostics.md`, with a stable id, an owner, and the files to open.
 * Printing stays; the channel is in addition to it.
 *
 * THE SHAPE, and why every field is there:
 *
 *   id        `${code}:${subject}` — deterministic, so the same defect at two
 *             spec revisions compares equal. Checked by EQUALITY, never by
 *             splitting on `:`: `term-value-not-iri:cascade:__comment_core`
 *             has three colons.
 *   code      one of {@link DIAGNOSTIC_CODES}, the key into the answer key
 *             (`docs/spec-diagnostics.md`), where what it means is written once.
 *   severity  what happens if nobody acts — `error` blocks conversion today,
 *             `warning` is silently wrong or silently guessed at runtime,
 *             `info` is hygiene or an open question.
 *   subject   the full IRI, the JSON key or name, or `vocabulary:term` — one
 *             rule per code, unique within the code BY CONSTRUCTION, so the id
 *             never needs a counter.
 *   detail    what is wrong, as prose a reader can act on.
 *   specFix   what to change, as prose pasteable into a spec issue; `null`
 *             where the fix is not spec's.
 *   owner     whose change it is: `spec`, `sdk`, or `reconcile` when a question
 *             has to be answered first. Its own field, because the renderer
 *             groups by it and nothing can group on prose.
 *   source    the generator that emitted it — the stem of the file it lands in.
 *   location  files to open, `<repo>:<path>`, never empty. The repo prefix is
 *             not derivable from `owner`: a `reconcile` row can point at both.
 *   ...       per-code structured extras: `claimants`, `predicates`, `members`,
 *             `reachedBy`, `text`.
 *
 * ONE FILE PER GENERATOR, deleted at start and written at end. The generators
 * are separate processes, so the channel is on disk — and a generator that
 * crashed must leave NOTHING rather than its previous run's file, or the
 * collector would merge stale rows with fresh ones and nobody could tell.
 * That is the vacuous-pass shape `CLAUDE.md` warns about, arriving through
 * the diagnostics themselves.
 *
 * DETERMINISTIC. Sorted by id, no timestamp, so two builds of one spec commit
 * produce byte-identical files and a diff means the input changed.
 *
 * @module scripts/lib/diagnostics
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Every `code` a finding may carry. The answer key has one entry per code. */
export const DIAGNOSTIC_CODES = Object.freeze([
  'record-class-name-collision',
  'unclassifiable-range',
  'term-value-not-iri',
  'term-cross-context-conflict',
  'normative-language-in-comment',
  'term-no-type-info',
  'property-no-range',
  'declared-predicate-not-in-ontology',
  'record-class-no-published-name',
  'deprecated-class-unresolved-successor',
  'range-has-unrecognized-typed-members',
  'target-class-not-in-ontology',
]);

export const SEVERITIES = Object.freeze(['error', 'warning', 'info']);

/**
 * Three values, each assigned by at least one code. A fourth, `none`, was
 * proposed and dropped: no code assigns it, and an unreachable enum value is
 * a permanently empty section in the rendered file.
 */
export const OWNERS = Object.freeze(['spec', 'sdk', 'reconcile']);

/** The generators, in the order `npm run generate` runs them. */
export const SOURCES = Object.freeze(['build-spec-data', 'build-record-types', 'build-terms', 'build-shapes']);

/** The findings file one generator writes, under the diagnostics directory. */
export const findingsFile = (dir, source) => join(dir, `${source}.json`);

const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;

/**
 * Why `row` is not a well-formed finding from `source`, or `null` if it is.
 *
 * Shared by the recorder (so a generator bug fails the generator, naming the
 * row) and the collector (so a file edited or truncated by hand is refused).
 * The message names the thing that is wrong — an id, an owner, a source — so
 * a refusal reads as an instruction.
 *
 * @param {object} row
 * @param {string} source - The generator the row must claim.
 * @returns {string | null}
 */
export function findingProblem(row, source) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return 'a finding must be an object';

  for (const field of ['id', 'code', 'severity', 'subject', 'owner', 'source']) {
    if (!isNonEmptyString(row[field])) return `"${field}" is missing or empty on ${JSON.stringify(row.id ?? row)}`;
  }
  if (!DIAGNOSTIC_CODES.includes(row.code)) {
    return `code "${row.code}" is not one of ${DIAGNOSTIC_CODES.join(', ')} (on ${row.id})`;
  }
  if (!SEVERITIES.includes(row.severity)) {
    return `severity "${row.severity}" is not one of ${SEVERITIES.join(', ')} (on ${row.id})`;
  }
  if (!OWNERS.includes(row.owner)) {
    return `owner "${row.owner}" is not one of ${OWNERS.join(', ')} (on ${row.id})`;
  }
  // By equality: a subject may itself contain `:`.
  if (row.id !== `${row.code}:${row.subject}`) {
    return `id "${row.id}" is not \`\${code}:\${subject}\` — expected "${row.code}:${row.subject}"`;
  }
  if (row.source !== source) {
    return `row ${row.id} claims source "${row.source}" but sits in ${source}'s file`;
  }
  if (!Array.isArray(row.location) || row.location.length === 0 || !row.location.every(isNonEmptyString)) {
    return `location on ${row.id} must be a non-empty array of "<repo>:<path>" strings`;
  }
  if (row.detail !== undefined && typeof row.detail !== 'string') return `detail on ${row.id} must be a string`;
  if (row.specFix !== undefined && row.specFix !== null && typeof row.specFix !== 'string') {
    return `specFix on ${row.id} must be a string or null`;
  }

  return null;
}

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * One generator's findings file, opened for a run.
 *
 * DELETES THE PREVIOUS FILE FIRST. Everything between here and `close()` is
 * a window in which the file does not exist — and a generator that throws in
 * that window leaves nothing, which is what lets the collector treat a
 * missing file as "this generator did not finish" rather than as empty.
 *
 * `record()` assigns `id` and `source`, refuses a malformed row and refuses a
 * repeated id: every rule is designed so its subject is unique within its
 * code, and a second row with the same id is a detector that broke that
 * promise, not two findings.
 *
 * @param {{ source: string, dir: string }} cycle
 * @returns {{ record(finding: object): object, close(): number }}
 */
export function openFindings({ source, dir }) {
  if (!SOURCES.includes(source)) {
    throw new Error(`"${source}" is not a generator: expected one of ${SOURCES.join(', ')}`);
  }

  const file = findingsFile(dir, source);
  rmSync(file, { force: true });

  const rows = new Map();

  return {
    record(finding) {
      const { code, subject, location, ...rest } = finding;
      const row = {
        id: `${code}:${subject}`,
        code,
        severity: finding.severity,
        subject,
        owner: finding.owner,
        source,
        location: [...new Set(location ?? [])].sort(),
        ...(finding.detail !== undefined ? { detail: finding.detail } : {}),
        specFix: finding.specFix ?? null,
      };
      // The per-code extras, after the shared fields, in the order given.
      for (const [key, value] of Object.entries(rest)) {
        if (!(key in row)) row[key] = value;
      }

      const problem = findingProblem(row, source);
      if (problem) throw new Error(`${source} recorded a malformed finding: ${problem}`);
      if (rows.has(row.id)) {
        throw new Error(
          `${source} recorded "${row.id}" twice. A subject must be unique within its code by `
          + 'construction; a detector that emits it twice needs deduping at the source, not a counter.',
        );
      }

      rows.set(row.id, row);
      return row;
    },

    close() {
      const sorted = [...rows.values()].sort(byId);
      mkdirSync(dir, { recursive: true });
      writeFileSync(file, `${JSON.stringify(sorted, null, 2)}\n`, 'utf-8');
      return sorted.length;
    },
  };
}

/**
 * The findings a generator wrote, validated against the source it claims.
 *
 * Throws naming the reason on a missing file, a file that is not a JSON array,
 * or any malformed row. An empty array is a valid file — a generator that
 * found nothing — and is not a missing one.
 *
 * @param {string} dir
 * @param {string} source
 * @returns {object[]}
 */
export function readFindings(dir, source) {
  const file = findingsFile(dir, source);
  let text;

  try {
    text = readFileSync(file, 'utf-8');
  } catch {
    throw new Error(
      `${source} left no findings file at ${file}. Each generator deletes its own file at start and `
      + 'writes it at the end, so a missing one means that generator did not finish — an empty run '
      + 'writes `[]`. Rerun `npm run generate` rather than merging what the others wrote.',
    );
  }

  let rows;
  try {
    rows = JSON.parse(text);
  } catch (error) {
    // Named like its siblings: a bare parser message says neither which file
    // nor which generator, and the likely cause is a write that never finished.
    throw new Error(
      `${file} is not valid JSON (${error.message}); ${source} may have been interrupted mid-write. `
      + 'Rerun `npm run generate`.',
    );
  }
  if (!Array.isArray(rows)) throw new Error(`${file} is not a JSON array of findings`);

  for (const row of rows) {
    const problem = findingProblem(row, source);
    if (problem) throw new Error(`${file}: ${problem}`);
  }

  return rows;
}

// ── rendering ────────────────────────────────────────────────────────────────

/** Where the rendered file points for a code's explanation, relative to `src/spec/`. */
const ANSWER_KEY = '../../docs/spec-diagnostics.md';

const code = (text) => `\`${text}\``;
const oneLine = (text) => String(text).replace(/\s+/g, ' ').trim();

/** The per-code extras rendered on a row, in this order, when present. */
const EXTRAS = ['claimants', 'predicates', 'members', 'reachedBy'];

/** One finding as one markdown line: code, subject, detail, fix, extras, locations. */
function renderRow(finding) {
  const parts = [`- ${code(finding.code)} ${code(finding.subject)}`];

  if (finding.detail) parts.push(`— ${oneLine(finding.detail)}`);
  if (finding.specFix) parts.push(`**Fix:** ${oneLine(finding.specFix)}`);
  for (const extra of EXTRAS) {
    const values = finding[extra];
    if (!Array.isArray(values)) continue;
    parts.push(`*${extra}:* ${values.length === 0 ? '(none)' : values.map(code).join(', ')}`);
  }
  parts.push(`📄 ${finding.location.map(code).join(', ')}`);

  return parts.join(' ');
}

/**
 * `diagnostics.json` as markdown, headed by the template file's text.
 *
 * GROUPED BY OWNER FIRST, severity second, then source and code. The reader is
 * one party about to go fix things — in spec, in this SDK, or by asking — and
 * the first thing they need is whether a row is theirs at all. Severity does
 * not track one consistent thing across the twelve codes, so it is the second
 * cut, not the first. Every row and every code heading carries the code, and
 * the heading links the answer key, so a reader who does not know what
 * `unclassifiable-range` means is one click from the explanation and a row
 * pasted into a spec issue carries the code with it.
 *
 * THE TEMPLATE IS A FILE, not a string in here: a build input lives with the
 * build scripts. Its text is the preamble; `{{commit}}` and `{{count}}` in it
 * are replaced, and a template without them is used as it is. Empty groups
 * are not rendered — an owner with no rows gets no heading.
 *
 * @param {{ commit: string | null, findings: object[] }} diagnostics
 * @param {string} templatePath
 * @returns {string}
 */
export function renderMarkdown({ commit, findings }, templatePath) {
  const preamble = readFileSync(templatePath, 'utf-8')
    .replace(/\{\{commit\}\}/g, commit ?? 'unknown — not built from a git checkout')
    .replace(/\{\{count\}\}/g, String(findings.length));

  const sorted = [...findings].sort((a, b) =>
    OWNERS.indexOf(a.owner) - OWNERS.indexOf(b.owner)
    || SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity)
    || SOURCES.indexOf(a.source) - SOURCES.indexOf(b.source)
    || DIAGNOSTIC_CODES.indexOf(a.code) - DIAGNOSTIC_CODES.indexOf(b.code)
    || byId(a, b));

  const lines = [preamble.replace(/\s+$/, ''), ''];
  const plural = (n) => `${n} finding${n === 1 ? '' : 's'}`;

  if (sorted.length === 0) lines.push('Nothing to report: the build recorded no findings.', '');

  let owner;
  let severity;
  let section;

  for (const finding of sorted) {
    if (finding.owner !== owner) {
      owner = finding.owner;
      severity = undefined;
      const count = sorted.filter((f) => f.owner === owner).length;
      lines.push(`## ${owner} — ${plural(count)}`, '');
    }
    if (finding.severity !== severity) {
      severity = finding.severity;
      section = undefined;
      const count = sorted.filter((f) => f.owner === owner && f.severity === severity).length;
      lines.push(`### ${severity} — ${plural(count)}`, '');
    }
    const key = `${finding.source}/${finding.code}`;
    if (key !== section) {
      section = key;
      lines.push(
        `#### ${code(finding.code)} (${finding.source}) — [what this means](${ANSWER_KEY}#${finding.code})`,
        '',
      );
    }
    lines.push(renderRow(finding));
    // A blank line after the last row of a section, before the next heading.
    const next = sorted[sorted.indexOf(finding) + 1];
    if (!next || `${next.source}/${next.code}` !== key || next.owner !== owner || next.severity !== severity) {
      lines.push('');
    }
  }

  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
}

// ── the answer key ───────────────────────────────────────────────────────────

/**
 * Which codes the answer key fails to document, and which of its entries name
 * no code.
 *
 * COMPARED BOTH WAYS. A code with no entry is a row the reader cannot act on;
 * an entry for no code is documentation of something the build never says.
 * An entry is a `### \`<code>\`` heading, the anchor the rendered file links.
 *
 * @param {Iterable<string>} codes
 * @param {string} markdown
 * @returns {{ undocumented: string[], unknown: string[] }}
 */
export function answerKeyDrift(codes, markdown) {
  const declared = new Set(codes);
  const anchors = new Set([...markdown.matchAll(/^###\s+`([^`]+)`\s*$/gm)].map((match) => match[1]));

  return {
    undocumented: [...declared].filter((c) => !anchors.has(c)).sort(),
    unknown: [...anchors].filter((anchor) => !declared.has(anchor)).sort(),
  };
}
