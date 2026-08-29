/**
 * Turtle text as something you can ask questions of.
 *
 * A plain module, not a `.test.ts`: vitest collects tests per file, so importing
 * a helper out of a test file drags that file's tests into the importer.
 * Measured — a file declaring one test ran five.
 */

import { Parser } from 'n3';
import env from '@zazuko/env';
import type { AnyPointer } from 'clownface';
import type { Quad } from '@rdfjs/types';

import { NAMESPACES } from '../../src/vocabularies/namespaces.js';

/**
 * `cascade.dataAbsentReason` rather than a CURIE string or a full IRI.
 *
 * The local name stays hand-written at each call site rather than looked up from
 * `PROPERTY_PREDICATES`: deriving it would make the test agree with the code by
 * construction, and a wrong predicate would become invisible.
 */
export const cascade = env.namespace(NAMESPACES.cascade);

/**
 * Turtle text as a traversable graph.
 *
 * Takes TEXT, not a record, so the `serialize()` call stays in the test where a
 * reader can see what is under test. A helper that did both would hide it.
 */
export function parseTurtle(turtle: string): AnyPointer {
  return env.clownface({ dataset: parseDataset(turtle) });
}

/** Turtle text as a dataset — what `assertCovered` and the validator take. */
export function parseDataset(turtle: string): ReturnType<typeof env.dataset> {
  return env.dataset(new Parser().parse(turtle));
}

/**
 * One Turtle document's triples, as sorted comparable strings.
 *
 * Assert with this rather than on the Turtle TEXT. The two documents under
 * comparison are usually written by different hands — this SDK's builder and a
 * fixture's `expectedOutput` — and Turtle gives them more than one way to spell
 * the same graph. A repeated predicate (`p "a" ; p "b"`) and an object list
 * (`p "a", "b"`) are the same two triples and different bytes, so a string
 * comparison fails on a difference that is not one, and `toContain` passes on a
 * substring that proves nothing about what else the document says.
 *
 * Sorted, because triple ORDER is not part of a graph either.
 *
 * A blank node compares by its parser-assigned LABEL, which is stable within one
 * parse and not across two. A graph carrying blank nodes therefore needs
 * isomorphism, not this; use it where both sides are ground, and read a
 * `_:b0_x` difference as "this helper is the wrong tool here" rather than as a
 * real disagreement.
 */
export function triples(turtle: string): string[] {
  return [...parseDataset(turtle)]
    .map((quad) => `${termKey(quad.subject)} ${termKey(quad.predicate)} ${termKey(quad.object)}`)
    .sort();
}

/**
 * One RDF term as a string that distinguishes everything a triple can differ by.
 *
 * A literal carries its datatype, so `"1"` and `"1"^^xsd:integer` do not compare
 * equal — that difference is exactly the kind of serializer bug this is used to
 * catch — and its language tag, so `"red"@en` and `"red"@fr` do not either.
 */
function termKey(term: Quad['subject'] | Quad['predicate'] | Quad['object']): string {
  if (term.termType === 'Literal') {
    return term.language
      ? `"${term.value}"@${term.language}`
      : `"${term.value}"^^<${term.datatype.value}>`;
  }
  if (term.termType === 'BlankNode') return `_:${term.value}`;
  return `<${term.value}>`;
}
