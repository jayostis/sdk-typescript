/**
 * `indexShapes` resolves what an engine needs resolved, and keeps the rest.
 *
 * A hand-written shapes graph, because the pinned spec cannot be made to say
 * most of this: it has no parameter nobody understands and no shape targeting
 * a class no ontology declares. A detector is proven by making it speak
 * (`tests/README.md`), so each case hands the function input it MUST report.
 *
 * WHY THE INDEX KEEPS WHAT IT DOES NOT UNDERSTAND. The engine reports a
 * parameter it cannot judge as unevaluated — `tests/shacl/unevaluated.test.ts`
 * — and it can only report what reached it. An index that dropped an unknown
 * `sh:*` key would turn "reported, not skipped" back into "skipped", one
 * layer down where no test of the engine could see it.
 */

import { describe, it, expect } from 'vitest';

// @ts-expect-error -- a build script, deliberately plain JavaScript and untyped.
import { indexShapes } from '../../scripts/build-shapes.mjs';
import { quadsFromTurtle } from '../support/graph.js';

const SH = 'http://www.w3.org/ns/shacl#';
const XSD = 'http://www.w3.org/2001/XMLSchema#';
const EX = 'http://example.org/';

const CODE = 'target-class-not-in-ontology';

const GRAPH = `@prefix sh: <${SH}> .
@prefix xsd: <${XSD}> .
@prefix ex: <${EX}> .

ex:S a sh:NodeShape ;
    sh:targetClass ex:Thing ;
    sh:property [
        sh:path ex:status ;
        sh:in ("a" "b") ;
        sh:frobnicate 3
    ] ;
    sh:property [
        sh:path ex:when ;
        sh:or ( [ sh:datatype xsd:date ] [ sh:datatype xsd:dateTime ] )
    ] .

ex:T a sh:NodeShape ;
    sh:targetClass ex:Ghost .
`;

interface Shape { id?: string; [parameter: string]: unknown }
interface Indexed { shapes: Shape[]; findings: { code: string; subject: string }[] }

const index = (declared: Iterable<string> = [`${EX}Thing`]): Indexed =>
  indexShapes(quadsFromTurtle(GRAPH), new Set(declared)) as Indexed;

/** The property shape under `shape` whose `sh:path` is `path`. */
function propertyFor(shape: Shape | undefined, path: string): Shape | undefined {
  const properties = (shape?.['property'] ?? []) as Shape[];
  return properties.find((p) => (p['path'] as { '@id': string }[] | undefined)?.[0]?.['@id'] === path);
}

describe('indexShapes', () => {
  it('indexes every named shape, and only the named ones', () => {
    // The blank property shapes and the blank `sh:or` members are inlined
    // under their parents; a root entry for each would make the engine visit
    // them twice.
    expect(index().shapes.map((s) => s.id).sort()).toEqual([`${EX}S`, `${EX}T`]);
  });

  it('resolves sh:in to its members, as an @list', () => {
    const status = propertyFor(index().shapes.find((s) => s.id === `${EX}S`), `${EX}status`);

    expect(status?.['in']).toEqual([{ '@list': [{ '@value': 'a' }, { '@value': 'b' }] }]);
  });

  it('resolves sh:or to its member shapes, inlined, as an @list', () => {
    const when = propertyFor(index().shapes.find((s) => s.id === `${EX}S`), `${EX}when`);

    expect(when).toMatchObject({
      or: [{ '@list': [
        { datatype: [{ '@id': `${XSD}date` }] },
        { datatype: [{ '@id': `${XSD}dateTime` }] },
      ] }],
    });
  });

  it('keeps a made-up sh:* parameter it cannot understand', () => {
    const status = propertyFor(index().shapes.find((s) => s.id === `${EX}S`), `${EX}status`);

    expect(status?.['frobnicate']).toEqual([{ '@value': '3', '@type': `${XSD}integer` }]);
  });

  it(`reports ${CODE} for a shape targeting a class no ontology declares, naming the class`, () => {
    expect(index().findings).toMatchObject([{ code: CODE, subject: `${EX}Ghost` }]);
  });

  it('is silent when every target is declared', () => {
    expect(index([`${EX}Thing`, `${EX}Ghost`]).findings).toEqual([]);
  });
});
