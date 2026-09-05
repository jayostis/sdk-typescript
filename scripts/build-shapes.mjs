/**
 * Index the shapes `spec` publishes into the form the SHACL evaluator reads.
 *
 * THE SEAM, NOT THE GENERATOR. `indexShapes` is the pure function
 * `tests/spec-data/build-shapes.test.ts` and `tests/shacl/` are written
 * against; the script around it — reading `src/spec/shapes/`, writing
 * `src/spec/derived/shapes.generated.ts`, recording findings — is not here yet.
 * Everything below is a stub that indexes nothing, so every assertion over its
 * output fails as an assertion rather than as a missing import.
 *
 * WHAT THE INDEX IS. One entry per NAMED shape, keyed `id`. Every other key is
 * a parameter: the local name for a `sh:` predicate, the full IRI for anything
 * else. Every value is an ARRAY of expanded-JSON-LD terms — `{ '@id' }`,
 * `{ '@value', '@type'?, '@language'? }` — with an RDF list resolved to
 * `{ '@list': [...] }` and a blank shape inlined as a nested object. Arrays
 * whatever the cardinality, because the index keeps every parameter it meets,
 * understood or not, and cannot know the cardinality of one it does not.
 *
 * WHAT IT REPORTS. A shape whose `sh:targetClass` names a class no ontology
 * declares is a `target-class-not-in-ontology` finding, one per class.
 *
 * @module scripts/build-shapes
 */

/**
 * @param {readonly import('../src/vendor/n3/n3.js').Quad[]} quads - A shapes graph.
 * @param {Iterable<string>} [declaredClasses] - Every class IRI the ontologies declare;
 *   omitted, no target is checked and no finding is recorded.
 * @returns {{ shapes: object[], findings: { code: string, subject: string }[] }}
 */
export function indexShapes(quads, declaredClasses) {
  void quads;
  void declaredClasses;
  return { shapes: [], findings: [] };
}
