/**
 * Which classes hold record data, by the marker spec carries.
 *
 * ONE RULE, BECAUSE SPEC NOW STATES IT. `cascade:RecordClass` is the marker
 * `jayostis/spec#50` adds — the explicit list `jayostis/spec#34` (ASK-05) called
 * for, put in the ontologies so a consumer derives it from the artifact it
 * already loads rather than from a side file. A class carries it directly;
 * nothing is inherited, so an alignment axiom cannot leak a class in.
 *
 * WHAT THIS REPLACED, and why it is gone rather than kept as a fallback. The
 * rule used to read `rdfs:subClassOf prov:Entity`, with
 * `src/record-types/pending-spec-50.json` listing the classes that reading
 * could not reach. ASK-05 ruled it out — the axiom is PROV-O alignment and
 * confers no membership, "never on `prov:Entity`, which will keep catching
 * alignment axioms" — and measured on spec's main, 110 classes were in that
 * population while 96 of them were alignment axioms. The marker is pinned as of
 * `conformance/scripts/SPEC_PIN` at `e77ba5e`, so the bridge, the pending list
 * and the comparison between the two rules all outlived their cause together
 * and were deleted in one commit. `tests/record-types/derivation.test.ts` said
 * so, in the assertion written to fail on exactly this day.
 *
 * TAKES ITS GRAPH AS AN ARGUMENT, for the reason `assembleRecordTypes` takes
 * its classes: the failure below cannot be produced from the real data.
 * `scripts/build-record-types.mjs` reads a directory and writes a file, so
 * nothing living inside it can be handed a graph that marks nothing.
 *
 * @module scripts/lib/record-population
 */

export const RECORD_CLASS = 'https://ns.cascadeprotocol.org/core/v1#RecordClass';

/** The rule the population was derived by, as the build line and banner say it. */
export const MARKER_RULE = 'cascade:RecordClass';

/**
 * The record-bearing population.
 *
 * REFUSES AN UNMARKED GRAPH, which is the one hard failure in this pipeline and
 * is deliberate. Everywhere else a spec defect is reported and worked around,
 * because the build has to keep running while upstream catches up. This is not
 * that: a checkout carrying no `cascade:RecordClass` at all cannot answer the
 * only question this module asks, and the permissive answer is an EMPTY
 * population — a `DERIVED_CLASSES` with nothing in it, indistinguishable from a
 * spec that declares no record types, which would take every downstream lookup
 * with it while every test that counts classes went green against zero.
 *
 * The realistic cause is a pin moved backwards past the marker, which is a
 * mistake to be told about immediately rather than a gap to file upstream.
 *
 * @param {Map<string, object>} nodes - The merged graph, `iri -> node`.
 * @returns {{ rule: string, classes: Set<string> }}
 */
export function recordPopulation(nodes) {
  const marked = [...nodes]
    .filter(([, node]) => (node['@type'] ?? []).includes(RECORD_CLASS))
    .map(([iri]) => iri);

  if (marked.length === 0) {
    throw new Error(
      `No class in the spec data carries ${RECORD_CLASS}, so the record-bearing population `
      + 'cannot be derived. This is not a spec gap to work around: the answer would be an empty '
      + 'table, which reads exactly like a spec that declares no record types. The likely cause '
      + 'is a spec checkout older than jayostis/spec#50 — check that CASCADE_SPEC_DIR, or the '
      + '../spec sibling, is at the revision conformance/scripts/SPEC_PIN names.',
    );
  }

  return { rule: MARKER_RULE, classes: new Set(marked) };
}
