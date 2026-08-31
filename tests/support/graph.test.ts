/**
 * `graphDifference` — two graphs compared as graphs.
 *
 * This is the tool `triples()` documents itself as NOT being. `triples()`
 * compares a blank node by its parser-assigned label, stable within one parse
 * and not across two, so it reads two isomorphic graphs as disagreeing; that is
 * why `tests/conformance/profile.test.ts` reaches its blank nodes by traversal
 * and cannot compare a whole profile graph at all. The cases below pin the two
 * halves that matter: silent where the difference is only a spelling, and
 * SPEAKING where there is a real one.
 *
 * The detector is pointed at input it must report on before it is pointed at a
 * fixture that should pass — `tests/README.md`, "A detector is proven by making
 * it speak." A comparison only ever observed staying quiet has not been
 * observed.
 */

import { describe, it, expect } from 'vitest';

import { serialize } from '../../src/serializer/turtle-serializer.js';
import { toJsonLd } from '../../src/jsonld/index.js';
import { loadFixture } from './fixtures.js';
import { graphDifference, quadsFromJsonLd, quadsFromTurtle } from './graph.js';

const PREFIX = '@prefix ex: <http://example.org/> .';

describe('graphDifference', () => {
  it('is silent for one graph written two ways', async () => {
    // An object list and a repeated predicate are the same two triples and
    // different bytes. A text comparison fails here on a difference that is
    // not one.
    const objectList = `${PREFIX} ex:s ex:p "a", "b" .`;
    const repeated = `${PREFIX} ex:s ex:p "a" . ex:s ex:p "b" .`;

    expect(await graphDifference(quadsFromTurtle(objectList), quadsFromTurtle(repeated))).toBeNull();
  });

  it('is silent for isomorphic graphs whose blank node labels differ', async () => {
    // THE CASE `triples()` CANNOT JUDGE, and the reason this helper exists.
    // Both documents describe one anonymous node carrying one property; the
    // parser names it `_:b0_x` on one side and something else on the other,
    // and only canonicalization makes the two comparable.
    const left = `${PREFIX} ex:s ex:child [ ex:name "inner" ] .`;
    const right = `${PREFIX} _:other ex:name "inner" . ex:s ex:child _:other .`;

    expect(await graphDifference(quadsFromTurtle(left), quadsFromTurtle(right))).toBeNull();
  });

  it('names the triple only one side carries', async () => {
    const left = `${PREFIX} ex:s ex:p "a" . ex:s ex:q "b" .`;
    const right = `${PREFIX} ex:s ex:p "a" .`;

    const difference = await graphDifference(quadsFromTurtle(left), quadsFromTurtle(right));

    expect(difference?.onlyInRight).toEqual([]);
    expect(difference?.onlyInLeft).toHaveLength(1);
    expect(difference?.onlyInLeft[0]).toContain('http://example.org/q');
  });

  it('treats a datatype as part of the triple, not as a spelling of it', async () => {
    // `"1"` and `"1"^^xsd:integer` are different objects. A serializer that
    // typed a date as `xsd:dateTime` where the vocabulary says `xsd:date` is
    // exactly this difference, and a comparison that normalised it away would
    // be silent on the defect it is most needed for.
    const plain = `${PREFIX} ex:s ex:p "1" .`;
    const typed = `${PREFIX} ex:s ex:p "1"^^<http://www.w3.org/2001/XMLSchema#integer> .`;

    const difference = await graphDifference(quadsFromTurtle(plain), quadsFromTurtle(typed));

    expect(difference?.onlyInLeft).toHaveLength(1);
    expect(difference?.onlyInRight).toHaveLength(1);
  });

  it('names a real disagreement between this SDK’s two writers', async () => {
    // Pointed at ourselves, where it MUST speak. `serialize()` writes
    // `cond-001`'s `monitoredVitalSigns` as an RDF list — `rdf:first` /
    // `rdf:rest` over a blank-node chain — and `toJsonLd()` writes the same
    // field as two plain literals hanging off the record. Same field, same
    // values, structurally different graphs. If this returned null, every use
    // of the helper in `fixture-contract.ts` would be vacuous and nothing
    // would say so.
    //
    // The blank-node chain is also why this case needs THIS helper: `triples()`
    // could not compare these two graphs at all.
    const cond001 = loadFixture('cond-001');

    const difference = await graphDifference(
      await quadsFromJsonLd(toJsonLd(cond001.input)),
      quadsFromTurtle(serialize(cond001.input)),
    );

    expect(difference).not.toBeNull();
    // The list cells exist on the Turtle side and nowhere on the JSON-LD side.
    expect(difference?.onlyInRight.join('\n')).toContain('22-rdf-syntax-ns#first');
    // ...and the values arrive as bare literals on the JSON-LD side instead.
    expect(difference?.onlyInLeft.join('\n')).toContain('#monitoredVitalSigns');
  });
});
