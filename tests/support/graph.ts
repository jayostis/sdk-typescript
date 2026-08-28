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
