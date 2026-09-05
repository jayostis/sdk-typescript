/**
 * What one property shape DECLARES, read off the shapes graph at test time.
 *
 * A helper, not a test. Exists so a suite can assert that a message or a
 * severity reached a report UNALTERED — compared against the value spec
 * publishes rather than against a string literal retyped here, which would
 * pass on a paraphrase and fail on a reword that changed nothing.
 *
 * Reads `shapesGraph()` and pays its parse once; nothing here validates.
 */

import { shapesGraph, SHACL_NS } from './spec-sources.js';

const SH_PROPERTY = `${SHACL_NS}property`;
const SH_PATH = `${SHACL_NS}path`;
const SH_MESSAGE = `${SHACL_NS}message`;
const SH_SEVERITY = `${SHACL_NS}severity`;

export interface DeclaredProperty {
  /** The `sh:message` lexical form, or `undefined` where the shape carries none. */
  readonly message?: string;
  /** The `sh:severity` IRI, or `undefined` where the shape carries none. */
  readonly severity?: string;
}

/**
 * The `sh:message` and `sh:severity` on the property shape `shape` declares
 * for `path`.
 *
 * `shape` may be a node shape carrying `sh:property` blank nodes, or a root
 * `sh:PropertyShape` that carries `sh:path` itself. Where a node shape
 * declares the same path twice — `cascade:ConsentScopeShape` does — the first
 * in graph order is returned, which is enough for every caller today.
 *
 * Throws when nothing declares the path, so a test cannot compare a report
 * against `undefined` and pass.
 */
export function declaredProperty(shape: string, path: string): DeclaredProperty {
  const graph = [...shapesGraph()];

  const holdsPath = (subject: string): boolean =>
    graph.some((q) => q.subject.value === subject
      && q.predicate.value === SH_PATH && q.object.value === path);

  const candidates = [
    ...(holdsPath(shape) ? [shape] : []),
    ...graph
      .filter((q) => q.subject.value === shape && q.predicate.value === SH_PROPERTY)
      .map((q) => q.object.value)
      .filter(holdsPath),
  ];

  const propertyShape = candidates[0];
  if (propertyShape === undefined) {
    throw new Error(`no property shape under <${shape}> declares sh:path <${path}>`);
  }

  const objectOf = (predicate: string): string | undefined =>
    graph.find((q) => q.subject.value === propertyShape && q.predicate.value === predicate)
      ?.object.value;

  return { message: objectOf(SH_MESSAGE), severity: objectOf(SH_SEVERITY) };
}
