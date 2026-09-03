/**
 * The flip to `cascade:RecordClass` announces what it drops.
 *
 * `tests/record-types/derivation.test.ts` asserts the rule the checkout in hand
 * supports, and it can only ever assert one of the two — a checkout either
 * carries the marker or it does not. The state that has to be right is the one
 * in between: spec marking some classes and not yet others, which is what a
 * multi-file upstream change actually looks like from here.
 *
 * WHAT WENT WRONG WITHOUT THIS. The rule changes the moment ONE class carries
 * the marker, so every class the PROV bridge reached and the marker does not
 * leaves `DERIVED_CLASSES` in the same build, with no error and no entry in
 * `pending-spec-50.json` to catch it. A class that is simply absent looks
 * exactly like a class spec never declared — the absence that reads as an
 * answer, again. Reproduced against spec branch
 * `fix/50-record-class-derivability`, where `checkup:WellnessProfileReference`
 * is reachable only through the bridge, is unmarked, and is in no pending
 * entry.
 *
 * Driven with synthetic graphs, for the reason `assembleRecordTypes` takes its
 * classes as an argument: the interesting case cannot be produced from the real
 * data, and a detector is proven by making it speak (`tests/README.md`).
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

// @ts-expect-error -- a build script, deliberately plain JavaScript and untyped.
import { recordPopulation, MARKER_RULE, BRIDGE_RULE } from '../../scripts/lib/record-population.mjs';
import { DERIVED_CLASSES } from '../../src/spec/derived/record-types.generated.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ONTOLOGIES = join(repoRoot, 'src/spec/ontologies');

const OWL_CLASS = 'http://www.w3.org/2002/07/owl#Class';
const RECORD_CLASS = 'https://ns.cascadeprotocol.org/core/v1#RecordClass';
const PROV_ENTITY = 'http://www.w3.org/ns/prov#Entity';

type Node = Record<string, unknown> & { '@id': string };

/** A class node, marked or not, with or without the PROV superclass. */
function klass(iri: string, { marked = false, prov = false, deprecated = false } = {}): Node {
  return {
    '@id': iri,
    '@type': marked ? [OWL_CLASS, RECORD_CLASS] : [OWL_CLASS],
    ...(prov ? { 'http://www.w3.org/2000/01/rdf-schema#subClassOf': [{ '@id': PROV_ENTITY }] } : {}),
    ...(deprecated ? { 'http://www.w3.org/2002/07/owl#deprecated': true } : {}),
  };
}

const graphOf = (...nodes: Node[]) => new Map(nodes.map((node) => [node['@id'], node]));

describe('the rule the population is derived by', () => {
  it('is the bridge while no class carries the marker', () => {
    const nodes = graphOf(klass('urn:A', { prov: true }), klass('urn:B'));
    const population = recordPopulation(nodes, new Set(['urn:B']));

    expect(population.rule).toBe(BRIDGE_RULE);
    expect([...population.classes].sort()).toEqual(['urn:A', 'urn:B']);
  });

  it('has nothing to report while the bridge is the population', () => {
    // There is no earlier rule to compare against, so a non-empty list here
    // would be the fallback reporting losses against itself.
    const nodes = graphOf(klass('urn:A', { prov: true }));

    expect(recordPopulation(nodes, new Set()).dropped).toEqual([]);
  });

  it('is the marker the moment one class carries it', () => {
    const nodes = graphOf(klass('urn:A', { marked: true }), klass('urn:B', { prov: true }));

    expect(recordPopulation(nodes, new Set()).rule).toBe(MARKER_RULE);
  });
});

describe('what the flip drops, when a checkout marks only some classes', () => {
  it('names a class the bridge reached and the marker does not', () => {
    // The `checkup:WellnessProfileReference` case, in miniature: a sibling is
    // marked, this one is not yet, and it silently left the population.
    const nodes = graphOf(
      klass('urn:Marked', { marked: true, prov: true }),
      klass('urn:NotYetMarked', { prov: true }),
    );

    const population = recordPopulation(nodes, new Set());

    expect(population.classes.has('urn:NotYetMarked')).toBe(false);
    expect(population.dropped).toEqual(['urn:NotYetMarked']);
  });

  it('names a pending entry the marker does not reach', () => {
    // The pending list is the declared half of the old population. An entry the
    // marker misses is a class this SDK registered yesterday and does not today.
    const nodes = graphOf(klass('urn:Marked', { marked: true }), klass('urn:Pending'));

    expect(recordPopulation(nodes, new Set(['urn:Pending'])).dropped).toEqual(['urn:Pending']);
  });

  it('is silent when the marker reaches everything the bridge did', () => {
    // The other direction, so a report that simply listed the bridge's
    // population would fail here.
    const nodes = graphOf(
      klass('urn:A', { marked: true, prov: true }),
      klass('urn:B', { marked: true, prov: true }),
    );

    expect(recordPopulation(nodes, new Set()).dropped).toEqual([]);
  });

  it('does not report a deprecated class as dropped', () => {
    // A deprecated class is not a record type under either rule — the build
    // filters it out and attaches it to whatever superseded it — so its absence
    // from the marked set is not a loss.
    const nodes = graphOf(
      klass('urn:Marked', { marked: true }),
      klass('urn:Gone', { prov: true, deprecated: true }),
    );

    expect(recordPopulation(nodes, new Set()).dropped).toEqual([]);
  });

  it('reports every dropped class, not the first', () => {
    const nodes = graphOf(
      klass('urn:Marked', { marked: true }),
      klass('urn:LostOne', { prov: true }),
      klass('urn:LostTwo', { prov: true }),
    );

    expect(recordPopulation(nodes, new Set()).dropped).toEqual(['urn:LostOne', 'urn:LostTwo']);
  });
});

describe('against the graph this package actually ships', () => {
  it('produces the population the committed table was built from', () => {
    // The wiring, so the synthetic cases above cannot pass while the build uses
    // something else. Deprecated classes are derived and then filtered out of
    // `DERIVED_CLASSES`, so this compares the live ones.
    const nodes = new Map<string, Node>();

    for (const file of readdirSync(ONTOLOGIES).filter((f) => f.endsWith('.jsonld'))) {
      for (const node of JSON.parse(readFileSync(join(ONTOLOGIES, file), 'utf-8')) as Node[]) {
        nodes.set(node['@id'], { ...(nodes.get(node['@id']) ?? {}), ...node });
      }
    }

    const pending = JSON.parse(
      readFileSync(join(repoRoot, 'src/record-types/pending-spec-50.json'), 'utf-8'),
    ) as { entries: { class: string }[] };

    const population = recordPopulation(nodes, new Set(pending.entries.map((e) => e.class)));
    const derived = new Set(DERIVED_CLASSES.map((entry) => entry.iri));

    expect([...population.classes].filter((iri) => !derived.has(iri) && !nodes.get(iri)?.[
      'http://www.w3.org/2002/07/owl#deprecated'
    ])).toEqual([]);
  });
});
