/**
 * Validating a serialized record against the shapes `spec` publishes.
 *
 * Importing this indexes 125 KB of Turtle into a SHACLValidator at module scope
 * — ~350 ms, on top of `graph.ts`'s ~500 ms for the RDF libraries. That is why
 * fixture loading lives in `fixtures.ts`, which imports in 27 ms: a suite that
 * only reads fixtures should not pay either bill. A suite that wants what the
 * shapes DECLARE, and not a verdict, takes `shapesGraph()` from
 * `spec-sources.ts` and pays neither.
 *
 * The shapes are read from a spec checkout, never copied here. Where that
 * checkout is, and what happens when there is none, is `spec-sources.ts`.
 */

import env from '@zazuko/env';
import SHACLValidator from 'rdf-validate-shacl';
import type { ValidationReport } from 'rdf-validate-shacl/src/validation-report.js';

import { serialize } from '../../src/serializer/turtle-serializer.js';
import type { CascadeEntity, CascadeRecord } from '../../src/models/common.js';
import { parseDataset } from './graph.js';
import { shapesGraph, vocabularies, curieOf, namespaceOf, SHACL_NS } from './spec-sources.js';

/**
 * The declared shapes, as one graph.
 *
 * ONE VALIDATOR, SHARED, because constructing one indexes the whole shapes
 * graph. `validate()` awaits only `loadOwlImports()`; `setDataGraph`,
 * `validateAll` and `getReport` all run synchronously after it, so concurrent
 * calls cannot interleave, and `validateAll` calls `initReport()`.
 * `tests/support/shacl.test.ts` pins that against a release that adds an await.
 */
const SHAPES = shapesGraph();

const shacl = new SHACLValidator(SHAPES);

/**
 * `rdf:type` SELECTS a shape rather than being constrained by one, so the whole
 * `rdf:` namespace is exempt from the predicate sweep below — which also covers
 * `rdf:first` / `rdf:rest`, the structure of an RDF collection rather than data
 * any shape declares a path for.
 */
const RDF_NS = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const rdf = env.namespace(RDF_NS);

/**
 * What the loaded shapes actually constrain, read off the shapes graph itself.
 *
 * NOT one namespace per shapes file. The manifest used to carry a `prefix` and
 * coverage meant "the IRI sits in a declared vocabulary's namespace", which is
 * wrong in both directions, because a shapes file constrains neither less nor
 * more than the vocabulary it is named for:
 *
 *   REFUSED what it can judge. `core.shapes.ttl` declares `sh:path dct:title`,
 *   `dct:created` and `dct:description` on `cascade:ExportManifestShape`, and
 *   `dcterms` was not a declared prefix — nor could it become one, having no
 *   shapes file in spec. Every ExportManifest was refused, by a message
 *   insisting nothing constrained triples that three shapes constrain, over a
 *   remedy nobody could carry out.
 *
 *   ACCEPTED what it cannot. `health:notes` sits in a declared namespace and no
 *   shape declares an `sh:path` for it, so a lab result carrying one
 *   earned the vacuous `conforms: true` this helper exists to refuse.
 *
 * A `sh:path` whose object is a blank node is a SHACL property path (sequence,
 * alternative, inverse) and contributes nothing here. The shapes have none; were spec to add one, the predicate it reaches would be reported
 * uncovered — a refusal naming the predicate, which is the safe direction.
 */
const CONSTRAINED_PREDICATES = new Set<string>();
const TARGETED_CLASSES = new Set<string>();
for (const quad of SHAPES) {
  if (quad.object.termType !== 'NamedNode') continue;
  if (quad.predicate.value === `${SHACL_NS}path`) CONSTRAINED_PREDICATES.add(quad.object.value);
  else if (quad.predicate.value === `${SHACL_NS}targetClass`) TARGETED_CLASSES.add(quad.object.value);
}

// Either set empty means the derivation read nothing out of a graph that parsed
// — a shapes file emptied upstream, or a SHACL term spelled differently. Every
// record would then be refused: loud, but by a message blaming the record.
if (CONSTRAINED_PREDICATES.size === 0 || TARGETED_CLASSES.size === 0) {
  throw new Error(
    `the shapes of ${vocabularies().join(', ')} parsed to ${SHAPES.size} quads but yielded `
    + `${TARGETED_CLASSES.size} sh:targetClass and ${CONSTRAINED_PREDICATES.size} sh:path IRIs, `
    + 'so no record could be judged covered.',
  );
}

/**
 * Refuse a record the shapes cannot actually judge.
 *
 * A graph they hold nothing for validates to `conforms: true` — indistinguishable
 * from one that satisfies every constraint. A thrown error is the only outcome a
 * test cannot mistake for a pass.
 *
 * Of the three cases below, the untyped one is latent: `serialize()` emits
 * `a <type>` for everything in TYPE_MAPPING and throws otherwise, and `n3`
 * leaves a relative IRI unresolved, so even `pod-001`'s empty `id` round-trips
 * to a subject `namedNode(record.id)` addresses. The uncovered-predicate one is
 * live twice over — `serialize(absent-001)` writes `clinical:loincCode` and
 * `serialize(lab-001)` writes `health:notes`, and no shape declares an
 * `sh:path` for either.
 *
 * The predicate sweep covers the whole dataset, not just the record subject,
 * because a blank-node sub-structure's predicates are validated too.
 */
export function assertCovered(dataset: ReturnType<typeof env.dataset>, record: CascadeEntity): void {
  const types = env.clownface({ dataset }).namedNode(record.id).out(rdf.type).values;
  if (types.length === 0) {
    throw new Error(
      `shaclCheck found no rdf:type on <${record.id}> in the serialized graph, so it cannot tell `
      + 'whether any shape targets it; the verdict would be a vacuous conforms:true.',
    );
  }

  refuse('judge', 'sh:targetClass', types.filter((iri) => !TARGETED_CLASSES.has(iri)));

  const predicates = new Set<string>();
  for (const quad of dataset) predicates.add(quad.predicate.value);
  refuse(
    'judge the triples on',
    'sh:path',
    [...predicates].filter((iri) => namespaceOf(iri) !== RDF_NS && !CONSTRAINED_PREDICATES.has(iri)),
  );
}

/**
 * Throw naming what the shapes declare nothing for, or return if nothing is.
 *
 * The message names the missing DECLARATION — `sh:targetClass`, `sh:path` — and
 * not which vocabularies were read. Which vocabulary a shape came from is the
 * wrong question: `dct:title` is constrained by `core.shapes.ttl` and belongs to
 * no declared vocabulary, and `health:notes` is the reverse.
 *
 * The remedy it offers is the one that exists. Nothing is copied here, so
 * "vendor a shapes file" is no longer an action anybody can take; what a reader
 * can do is declare the vocabulary in the manifest, or accept that spec
 * constrains nothing for that predicate yet and assert on the graph instead.
 */
function refuse(verb: string, declaration: string, uncovered: string[]): void {
  if (uncovered.length === 0) return;
  const them = uncovered.length === 1 ? 'it' : 'them';
  throw new Error(
    `shaclCheck cannot ${verb} ${uncovered.map(curieOf).join(', ')}: no shape of `
    + `${vocabularies().join(', ')} declares ${declaration} for ${them}, so the shapes graph `
    + `does not constrain ${them} and the verdict would be a vacuous conforms:true. If spec `
    + 'publishes shapes that do declare it, add that vocabulary to spec-sources.json; otherwise '
    + 'spec constrains it nowhere yet — assert on the graph with parseTurtle instead.',
  );
}

/**
 * The SHACL vocabulary, for naming the constraint a result came from.
 *
 * Assert on `sourceConstraintComponent` rather than `message`: the message is
 * prose `spec` owns, so a reword breaks a text assertion with no behaviour
 * change, and a different constraint mentioning the property would satisfy one.
 */
export const sh = env.namespace(SHACL_NS);

/**
 * Serialize a record and validate the result against the declared shapes.
 *
 * Returns the library's own ValidationReport unchanged — flattening its terms to
 * strings would throw away the constraint identity, which is the thing worth
 * asserting on. Throws rather than returning a verdict when the shapes cannot
 * judge the record; see `assertCovered`.
 */
export async function shaclCheck(record: CascadeRecord): Promise<ValidationReport> {
  const dataset = parseDataset(serialize(record));
  assertCovered(dataset, record);
  return shacl.validate(dataset);
}
