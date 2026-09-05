/**
 * `validate()` for a record type routed on `'validate'`: the shipped shapes,
 * judged by the shipped engine, mapped into the verdict a caller reads.
 *
 * THE GRAPH THE ROUTED WRITER WRITES. The record is converted with
 * `convertToRdf` — the same graph `serialize()` emits for a routed type, and
 * the same graph `tests/support/shacl.ts` hands the oracle — so the judge
 * judges what a pod would hold. A value with no expressible form throws out
 * of the converter and out of here: that is inexpressibility, the writer's
 * refusal, and not a finding about validity (`CLAUDE.md`, "faithful first").
 *
 * THE MAPPING. Each SHACL result becomes one finding: `field` is the JSON key
 * whose term predicate equals the result's path, `message` is the shape's
 * `sh:message` verbatim where it carries one, `severity` follows
 * `sh:Violation` / `sh:Warning` / `sh:Info` to `error` / `warning` / `info`.
 * `ValidationResult` does not change shape (#74).
 *
 * THE REFUSALS ARE ERRORS. A parameter the engine met and did not judge, and
 * a record no shape evaluated at all, each become an `error` finding: the
 * representation that needs no API change and cannot be read as a pass.
 * Whether unevaluated deserves its own channel is #80's open question, left
 * open here.
 *
 * @module validator
 */

import { convertToRdf, termsFor } from '../converter/to-rdf.js';
import type { RecordType } from '../record-types/index.js';
import { evaluate } from '../shacl/evaluate.js';
import type { IndexedShape, ShaclResult } from '../shacl/evaluate.js';
import { specShapes } from '../spec/derived/shapes.generated.js';
import type { Severity } from '../terms/index.js';
import { Parser as N3Parser } from '../vendor/n3/n3.js';
import type { ValidationError } from './validator.js';

const SH = 'http://www.w3.org/ns/shacl#';

/**
 * A SHACL severity as the grade a finding carries.
 *
 * FAIL CLOSED. `sh:Violation` is the default a shape gets when it names no
 * severity, and it is also what any severity this does not recognise maps to:
 * a grade `verdictOf` has no bucket for would throw, and a shape's mistake
 * must not become a record's rejection with no message — but nor may it be
 * waved through as information.
 */
function gradeOf(severity: string): Severity {
  if (severity === `${SH}Warning`) return 'warning';
  if (severity === `${SH}Info`) return 'info';
  return 'error';
}

/**
 * The findings the shipped shapes make about one routed record.
 *
 * `field` for a result with no path — a node-level constraint on the record
 * itself — and for a refusal is `type`: the record's type is what selected
 * the shape, and it is the one key every record has.
 *
 * `shapes` defaults to the index the package ships, parsed on first use so
 * that importing the package does not pay for it. It is a parameter so a
 * test can hand this an index that MUST make the refusal findings speak —
 * every shape spec publishes for the one routed type is evaluated in full,
 * and a detector is proven by making it speak.
 */
export function routedFindings(
  record: Record<string, unknown>,
  recordType: RecordType,
  shapes: readonly IndexedShape[] = specShapes(),
): ValidationError[] {
  const quads = new N3Parser().parse(convertToRdf(record));
  const report = evaluate(quads, shapes);
  const terms = termsFor(recordType.rdfTypeUri);

  /**
   * The JSON key behind a predicate: the record's own key where it wrote one,
   * else the first key the record's term table resolves to that predicate —
   * an absent required field has no key in the record and still needs naming.
   */
  const fieldFor = (path: string): string => {
    const written = Object.keys(record).find((key) => terms[key]?.predicate === path);
    if (written !== undefined) return written;
    const declared = Object.keys(terms).find((key) => terms[key]?.predicate === path);
    return declared ?? path;
  };

  // Every `sh:message` the shape wrote, in its order, as one message: a
  // finding carries one string, and a shape that wrote two sentences meant
  // both to be read.
  const finding = (result: ShaclResult): ValidationError => ({
    field: result.path === null ? 'type' : fieldFor(result.path),
    message: result.messages.length > 0
      ? result.messages.join(' ')
      : `sh:${result.parameter} on ${result.path ?? recordType.rdfTypeUri}`
        + ' is not satisfied (the shape declares no sh:message)',
    severity: gradeOf(result.severity),
  });

  const refusals: ValidationError[] = report.unevaluated.map((parameter) => ({
    field: 'type',
    message: `A shape selected for ${recordType.name} carries ${parameter}, which this validator does `
      + 'not evaluate; the record cannot be judged conformant until it does. Unevaluated is '
      + 'reported rather than skipped, because a verdict that skipped a constraint would read as a pass.',
    severity: 'error',
  }));

  // NOTHING EVALUATED IS A REFUSAL, and which refusal matters: "no shape
  // selected the record" sends a reader after a missing shape, which is the
  // wrong errand when a shape did select it and every parameter it carries
  // was refused above (`selected` is what tells the two apart). The third
  // case — selected, nothing refused, nothing evaluated — is a shape that
  // declares no constraint at all, and still earns an error, because a
  // verdict with nothing evaluated is never a pass.
  if (report.selected === 0) {
    refusals.push({
      field: 'type',
      message: `No shape spec publishes selected ${recordType.rdfTypeUri}, so no constraint was `
        + 'evaluated; a verdict with nothing evaluated is a refusal, never a pass.',
      severity: 'error',
    });
  } else if (report.evaluated === 0 && report.unevaluated.length === 0) {
    refusals.push({
      field: 'type',
      message: `The shapes that selected ${recordType.rdfTypeUri} declare no constraint, so nothing `
        + 'was evaluated; a verdict with nothing evaluated is a refusal, never a pass.',
      severity: 'error',
    });
  }

  return [...report.results.map(finding), ...refusals];
}
