/**
 * The two judges side by side, over the same graph.
 *
 * A helper, not a test. `evaluate` is the engine under test;
 * `rdf-validate-shacl` is the oracle every SHACL suite here already trusts.
 * Both are handed the SAME quads so that a disagreement is about judgement
 * and never about what was written.
 *
 * The engine reads the index `scripts/build-shapes.mjs` produces — over the
 * spec checkout for the corpus suites, over hand-written Turtle for the
 * component suites — and never a shapes graph directly. That is the seam the
 * shipped package will use, and testing the engine through any other door
 * would prove something the package does not do.
 */

import env from '@zazuko/env';
import SHACLValidator from 'rdf-validate-shacl';
import type { ValidationReport } from 'rdf-validate-shacl/src/validation-report.js';
import type { Quad } from '@rdfjs/types';

// @ts-expect-error -- a build script, deliberately plain JavaScript and untyped.
import { indexShapes } from '../../scripts/build-shapes.mjs';
import { evaluate } from '../../src/shacl/evaluate.js';
import type { IndexedShape, ShaclReport } from '../../src/shacl/evaluate.js';
import { parseDataset, quadsFromTurtle } from '../support/graph.js';
import { shapesGraph, SHACL_NS } from '../support/spec-sources.js';

export const SH = SHACL_NS;
export const XSD = 'http://www.w3.org/2001/XMLSchema#';
export const EX = 'http://example.org/';
export const CASCADE = 'https://ns.cascadeprotocol.org/core/v1#';
export const HEALTH = 'https://ns.cascadeprotocol.org/health/v1#';

/** The prefixes every hand-written graph below may use. */
export const PREFIXES = `@prefix sh: <${SH}> .
@prefix xsd: <${XSD}> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix ex: <${EX}> .
@prefix cascade: <${CASCADE}> .
@prefix health: <${HEALTH}> .
`;

/** Hand-written Turtle as the quads both judges take. */
export const quadsOf = (turtle: string): Quad[] => quadsFromTurtle(PREFIXES + turtle);

/** Hand-written shapes, indexed the way the generator indexes spec's. */
export function shapesOf(turtle: string): IndexedShape[] {
  return (indexShapes(quadsOf(turtle)) as { shapes: IndexedShape[] }).shapes;
}

let spec: IndexedShape[] | undefined;

/** The shapes spec publishes, indexed once. */
export function specShapes(): IndexedShape[] {
  spec ??= (indexShapes([...shapesGraph()]) as { shapes: IndexedShape[] }).shapes;
  return spec;
}

/** The engine over hand-written shapes and hand-written data. */
export function engineOver(shapes: string, data: string): ShaclReport {
  return evaluate(quadsOf(data), shapesOf(shapes));
}

/** The engine over spec's shapes. */
export function engineOverSpec(data: readonly Quad[]): ShaclReport {
  return evaluate(data, specShapes());
}

/** The oracle over hand-written shapes and hand-written data. */
export async function oracleOver(shapes: string, data: string): Promise<ValidationReport> {
  return new SHACLValidator(parseDataset(PREFIXES + shapes)).validate(parseDataset(PREFIXES + data));
}

let oracle: SHACLValidator | undefined;

/** The oracle over spec's shapes. Built once: indexing the shapes graph is the expensive part. */
export async function oracleOverSpec(data: readonly Quad[]): Promise<ValidationReport> {
  oracle ??= new SHACLValidator(shapesGraph());
  return oracle.validate(env.dataset([...data]));
}

/**
 * `(focusNode, path, sourceConstraintComponent)` tuples, sorted.
 *
 * SETS, NOT COUNTS. Two reports with three results each can name different
 * constraints; the comparison worth making is which violations were found.
 */
export function tuplesOf(report: ShaclReport): string[] {
  return [...new Set(report.results.map((r) => `${r.focusNode} ${r.path ?? '-'} ${r.sourceConstraintComponent}`))].sort();
}

export function oracleTuplesOf(report: ValidationReport): string[] {
  return [...new Set(report.results.map(
    (r) => `${r.focusNode?.value ?? '?'} ${r.path?.value ?? '-'} ${r.sourceConstraintComponent?.value ?? '?'}`,
  ))].sort();
}
