/**
 * The marker is the population, and a graph without it is refused.
 *
 * WHAT THIS USED TO TEST, and why most of it is gone. The rule was in flux:
 * `rdfs:subClassOf prov:Entity` plus `pending-spec-50.json` for the classes that
 * reading missed, flipping to `cascade:RecordClass` on the first marked class
 * it saw. The flip was not atomic, so this file drove the state in between —
 * spec marking some classes and not yet others — which is what a multi-file
 * upstream change looks like from here and which the real data can never be.
 *
 * `conformance/scripts/SPEC_PIN` moved to the revision carrying the marker, the
 * bridge and the pending list were deleted together, and the tests for a flip
 * that can no longer happen went with them. A test whose subject is deleted is
 * deleted; keeping it green against a stub would be the suite lying about what
 * it covers.
 *
 * WHAT REPLACES THEM is the one failure the new rule can still have, and it is
 * worse than anything the old one could: a graph carrying no marker at all
 * yields an EMPTY population, which reads exactly like a spec declaring no
 * record types. Driven with synthetic graphs for the reason
 * `assembleRecordTypes` takes its classes as an argument — a detector is proven
 * by making it speak (`tests/README.md`), and the real data cannot be made to.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

// @ts-expect-error -- a build script, deliberately plain JavaScript and untyped.
import { recordPopulation, MARKER_RULE } from '../../scripts/lib/record-population.mjs';
import { DERIVED_CLASSES } from '../../src/spec/derived/record-types.generated.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ONTOLOGIES = join(repoRoot, 'src/spec/ontologies');

const OWL_CLASS = 'http://www.w3.org/2002/07/owl#Class';
const RECORD_CLASS = 'https://ns.cascadeprotocol.org/core/v1#RecordClass';
const PROV_ENTITY = 'http://www.w3.org/ns/prov#Entity';
const DEPRECATED = 'http://www.w3.org/2002/07/owl#deprecated';

type Node = Record<string, unknown> & { '@id': string };

/** A class node, marked or not, with or without the PROV superclass. */
function klass(iri: string, { marked = false, prov = false } = {}): Node {
  return {
    '@id': iri,
    '@type': marked ? [OWL_CLASS, RECORD_CLASS] : [OWL_CLASS],
    ...(prov ? { 'http://www.w3.org/2000/01/rdf-schema#subClassOf': [{ '@id': PROV_ENTITY }] } : {}),
  };
}

const graphOf = (...nodes: Node[]) => new Map(nodes.map((node) => [node['@id'], node]));

describe('the marker states the population', () => {
  it('takes the classes that carry it and leaves the ones that do not', () => {
    const population = recordPopulation(graphOf(
      klass('urn:Marked', { marked: true }),
      klass('urn:Plain'),
    ));

    expect(population.rule).toBe(MARKER_RULE);
    expect([...population.classes]).toEqual(['urn:Marked']);
  });

  it('does not let a PROV superclass put a class in', () => {
    // The reading `jayostis/spec#34` (ASK-05) ruled out, asserted so that
    // deleting the bridge cannot be quietly undone: `rdfs:subClassOf
    // prov:Entity` is alignment and confers no membership. On spec's main it
    // caught 110 classes of which 96 were alignment axioms.
    const population = recordPopulation(graphOf(
      klass('urn:Marked', { marked: true }),
      klass('urn:AlignedOnly', { prov: true }),
    ));

    expect(population.classes.has('urn:AlignedOnly')).toBe(false);
  });

  it('does not inherit the marker from a marked superclass', () => {
    // A class carries it directly or not at all. Inheritance would let one
    // marked root readmit every alignment axiom under it, which is the defect
    // the marker replaced.
    const child: Node = {
      ...klass('urn:Child'),
      'http://www.w3.org/2000/01/rdf-schema#subClassOf': [{ '@id': 'urn:MarkedParent' }],
    };

    const population = recordPopulation(graphOf(klass('urn:MarkedParent', { marked: true }), child));

    expect(population.classes.has('urn:Child')).toBe(false);
  });
});

describe('a graph that marks nothing', () => {
  it('is refused rather than answered with an empty population', () => {
    // The one hard failure in this pipeline, and the reason it is not reported
    // and worked around like every other spec gap: the permissive answer here
    // is an empty table, indistinguishable from a spec that declares no record
    // types, and every test that counts classes would go green against zero.
    expect(() => recordPopulation(graphOf(klass('urn:A', { prov: true }))))
      .toThrow(/carries https:\/\/ns\.cascadeprotocol\.org\/core\/v1#RecordClass/);
  });

  it('names the likely cause, which is a pin moved backwards', () => {
    expect(() => recordPopulation(graphOf(klass('urn:A')))).toThrow(/SPEC_PIN/);
  });
});

describe('against the graph this package actually ships', () => {
  it('produces the population the generated table was built from', () => {
    // The wiring, so the synthetic cases above cannot pass while the build uses
    // something else. Deprecated classes are derived and then filtered out of
    // `DERIVED_CLASSES`, so this compares the live ones.
    const nodes = new Map<string, Node>();

    for (const file of readdirSync(ONTOLOGIES).filter((f) => f.endsWith('.jsonld'))) {
      for (const node of JSON.parse(readFileSync(join(ONTOLOGIES, file), 'utf-8')) as Node[]) {
        nodes.set(node['@id'], { ...(nodes.get(node['@id']) ?? {}), ...node });
      }
    }

    const population = recordPopulation(nodes);
    const derived = new Set(DERIVED_CLASSES.map((entry) => entry.iri));

    expect([...population.classes].filter((iri) => !derived.has(iri) && !nodes.get(iri)?.[DEPRECATED]))
      .toEqual([]);
  });
});
