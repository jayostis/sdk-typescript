/**
 * Turtle text as something you can ask questions of.
 *
 * A plain module, not a `.test.ts`: vitest collects tests per file, so importing
 * a helper out of a test file drags that file's tests into the importer.
 * Measured — a file declaring one test ran five.
 */

import { Readable } from 'stream';

import { Parser } from 'n3';
import env from '@zazuko/env';
import JsonLdParser from '@rdfjs/parser-jsonld';
import { canonize } from 'rdf-canonize';
import type { AnyPointer } from 'clownface';
import type { Quad } from '@rdfjs/types';

import { NAMESPACES } from '../../src/vocabularies/namespaces.js';
import { CONTEXT_URI, getContext } from '../../src/jsonld/context.js';

/**
 * `cascade.dataAbsentReason` rather than a CURIE string or a full IRI.
 *
 * The local name stays hand-written at each call site rather than looked up from
 * `PROPERTY_PREDICATES`: deriving it would make the test agree with the code by
 * construction, and a wrong predicate would become invisible.
 */
export const cascade = env.namespace(NAMESPACES.cascade);

/**
 * The other two namespaces a record's own data lands in, for the same reason
 * and read the same way.
 *
 * Both are needed by one assertion rather than by two: a field whose predicate
 * is re-prefixed per record type — `interpretationSourceCode` under `health:`
 * on a lab result and `clinical:` on a vital sign — is only pinned by asking
 * the graph both questions, since a term that resolved the wrong one writes a
 * triple that is perfectly valid under the other namespace.
 */
export const health = env.namespace(NAMESPACES.health);
export const clinical = env.namespace(NAMESPACES.clinical);

/**
 * `coverage:`, for the same reason twice over.
 *
 * An insurance plan's fields are spelled in TWO vocabularies at once — the
 * fixtures put `providerName` under `coverage:` and `payorName` under
 * `clinical:` on one subject — so asking only one namespace cannot tell a
 * correctly-spelled record from a record spelled entirely in the other.
 */
export const coverage = env.namespace(NAMESPACES.coverage);

/**
 * `rdf:`, for `rdf:type` — the one predicate a typed blank node carries that is
 * not in `NAMESPACES`, which lists the vocabularies this SDK writes data under.
 */
export const rdf = env.namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#');

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

/**
 * Serves THIS BUILD's context for `CONTEXT_URI`, and refuses every other URL.
 *
 * `toJsonLd` writes `"@context": CONTEXT_URI` — a reference, not an inline
 * context — so expanding its output requires resolving that URL. Left to
 * itself the parser FETCHES IT, and doing so would break this suite in three
 * ways at once. It would put live network I/O in a unit test, so the suite
 * fails offline and in a sandboxed CI. It would make the test slow and flaky
 * for reasons that have nothing to do with the SDK. And worst, it would
 * compare `serialize()` against a context served from a WEBSITE rather than
 * against `getContext()` — so a build whose context had drifted from the
 * deployed copy would be judged by the deployed copy, which is the wrong
 * question and looks exactly like the right one.
 *
 * Refusing any other URL is the other half. A silent fallback to the network
 * for an unexpected URL would restore all three problems the moment the SDK
 * changed what it emits; throwing means the test says so.
 */
const CONTEXT_LOADER = {
  load(url: string): Promise<unknown> {
    if (url !== CONTEXT_URI) {
      throw new Error(
        `Refusing to fetch ${url}. Tests resolve exactly one context — ${CONTEXT_URI}, `
        + 'served from getContext() — so that they judge this build rather than a deployed one. '
        + 'A new URL here means the SDK changed what it emits; teach this loader about it.',
      );
    }
    // `getContext()` ALREADY returns `{ "@context": … }` — the whole document,
    // not the bare context map — and `jsonld-context-parser` reads
    // `document['@context']` off what it is handed. Wrapping it again nests a
    // context inside a context, which the parser rejects as a keyword
    // redefinition of `@context`. It is also not the jsonld.js
    // `{ contextUrl, document, documentUrl }` envelope, which this loader
    // rejects as an invalid remote context.
    return Promise.resolve(getContext());
  },
};

/**
 * A JSON-LD document as quads.
 *
 * The parser EXPANDS the document against its context, which is what makes this
 * usable for comparing one writer against another: a context that maps a term
 * to the wrong IRI yields the wrong predicate rather than an error, so the
 * disagreement survives into the graph where it can be seen. A reader that
 * resolved terms some other way would hide exactly the defect worth catching.
 *
 * The context comes from `getContext()`, never the network — see
 * `CONTEXT_LOADER`.
 */
export async function quadsFromJsonLd(doc: object): Promise<Quad[]> {
  // `Stream<Quad>` is RDF/JS's EventEmitter-based interface, and it does not
  // declare `Symbol.asyncIterator` — but every implementation of it, this one
  // included, is a Node `Readable`, which does. The cast asserts the narrower
  // truth about this parser rather than working around a type that is wrong.
  const stream = new JsonLdParser({ documentLoader: CONTEXT_LOADER }).import(
    Readable.from([JSON.stringify(doc)]),
  ) as unknown as AsyncIterable<Quad>;

  const quads: Quad[] = [];
  for await (const quad of stream) quads.push(quad);
  return quads;
}

/**
 * One graph's canonical N-Quads lines, sorted.
 *
 * This is the tool `triples()` says it is not. A blank node compares by its
 * parser-assigned LABEL there, which is stable within one parse and not across
 * two, so `triples()` reads `_:b0_b1` against `_:b0_b3` as a disagreement that
 * is not one. RDFC-1.0 replaces those labels with ones derived from the graph's
 * own shape, so two isomorphic graphs produce identical lines and two that
 * genuinely differ do not.
 *
 * Lines rather than the single canonical string, because a difference is worth
 * reading as a set difference rather than as a wall of text — see
 * `graphDifference`.
 */
export async function canonicalLines(quads: readonly Quad[]): Promise<string[]> {
  const nquads = await canonize(quads, { algorithm: 'RDFC-1.0' });
  return nquads.split('\n').filter((line) => line.trim() !== '').sort();
}

/** What two graphs disagree about, or `null` when they are isomorphic. */
export interface GraphDifference {
  onlyInLeft: string[];
  onlyInRight: string[];
}

/**
 * Two graphs compared as graphs, reporting WHAT differs rather than THAT it does.
 *
 * `null` for isomorphic, which is what a caller asserts on. The populated form
 * exists because the failure message is the whole value of this check: a
 * seventeen-triple graph that disagrees in one predicate produces a diff a
 * reader can act on, where a boolean produces `expected true, got false`.
 *
 * Returned rather than asserted, so it can be called directly with input it
 * MUST report on. A comparison only ever observed staying silent on a passing
 * fixture has not been observed — `tests/README.md`, "A detector is proven by
 * making it speak."
 */
export async function graphDifference(
  left: readonly Quad[],
  right: readonly Quad[],
): Promise<GraphDifference | null> {
  const [a, b] = await Promise.all([canonicalLines(left), canonicalLines(right)]);
  const onlyInLeft = a.filter((line) => !b.includes(line));
  const onlyInRight = b.filter((line) => !a.includes(line));

  return onlyInLeft.length === 0 && onlyInRight.length === 0 ? null : { onlyInLeft, onlyInRight };
}

/**
 * Turtle text as quads, for handing to `graphDifference`.
 *
 * Named alongside `quadsFromJsonLd` rather than left as a spread of
 * `parseDataset`, so the two sides of a cross-format comparison read as the
 * same kind of step and neither looks like the special case.
 */
export function quadsFromTurtle(turtle: string): Quad[] {
  return new Parser().parse(turtle);
}
