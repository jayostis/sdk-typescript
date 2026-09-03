/**
 * Which classes hold record data, by the rule the checkout supports — and what
 * the winning rule loses relative to the rule it replaced.
 *
 * TAKES ITS GRAPH AS AN ARGUMENT, for the reason `assembleRecordTypes` takes
 * its classes: the interesting case cannot be produced from the real data. A
 * checkout either carries `cascade:RecordClass` or does not, and the state that
 * matters is the one in between — a spec branch that has marked some classes
 * and not yet others. `scripts/build-record-types.mjs` reads a directory and
 * writes a file, so nothing that lives inside it can be handed that state.
 *
 * THE FLIP IS NOT ATOMIC, which is what this module exists to say. The rule
 * changes the moment ONE class carries the marker, and every class the old rule
 * reached and the new one does not leaves the population in the same build —
 * silently, because a class that is simply absent from `DERIVED_CLASSES` looks
 * exactly like a class spec never declared. Reproduced against spec branch
 * `fix/50-record-class-derivability`: `checkup:WellnessProfileReference` is
 * reachable only through the PROV bridge, is not marked, and is not in
 * `pending-spec-50.json` either, so nothing at all would have reported its loss.
 *
 * REPORTED, NOT GATED. Most of what the flip drops is a correction rather than
 * a loss — measured against spec `main` at the marker merge, 13 classes leave
 * and 12 of them should: `cascade:DataProvenance` with its ten members, which
 * are values rather than records, and `cascade:SocialHistoryConsent`, which
 * `pending-spec-50.json` already says is on its way out. A build that failed on
 * those would be failing on the marker working. So `dropped` is a list for a
 * human to read once, and the one entry that is a real question is the one they
 * have to see.
 *
 * @module scripts/lib/record-population
 */

export const OWL_CLASS = 'http://www.w3.org/2002/07/owl#Class';
export const SUB_CLASS_OF = 'http://www.w3.org/2000/01/rdf-schema#subClassOf';
export const DEPRECATED = 'http://www.w3.org/2002/07/owl#deprecated';
export const RECORD_CLASS = 'https://ns.cascadeprotocol.org/core/v1#RecordClass';

export const RECORD_ROOTS = new Set([
  'http://www.w3.org/ns/prov#Entity',
  'http://www.w3.org/ns/prov#Activity',
]);

/** The rule each population was derived by, as the build line and banner say it. */
export const MARKER_RULE = 'cascade:RecordClass';
export const BRIDGE_RULE = 'prov chain + pending-spec-50.json (spec#50 not yet pinned)';

const parentsOf = (nodes, iri) =>
  (nodes.get(iri)?.[SUB_CLASS_OF] ?? []).map((value) => value['@id']).filter(Boolean);

/**
 * Does this class's superclass chain reach a PROV root?
 *
 * THE BRIDGE, AND A READING SPEC HAS SINCE RULED OUT. `jayostis/spec#34`
 * (ASK-05) settled it: *"The reading 'subClassOf prov:Entity means instances
 * are stored record data' is not the intent. The axiom is PROV-O alignment …
 * never on `prov:Entity`, which will keep catching alignment axioms."* Measured
 * on spec's `main`: 110 classes are in that population and 96 of them are
 * alignment axioms.
 *
 * It is still used, and only while the marker is absent — see
 * {@link recordPopulation}. A build against a checkout that carries
 * `cascade:RecordClass` uses it for the comparison and not for the population.
 *
 * `seen` is not defensiveness about spec: `owl:equivalentClass` cycles and
 * mutual subclass axioms are expressible, and a walk without it never returns.
 */
export function bearsRecords(nodes, iri, seen = new Set()) {
  if (seen.has(iri)) return false;
  seen.add(iri);
  return parentsOf(nodes, iri)
    .some((parent) => RECORD_ROOTS.has(parent) || bearsRecords(nodes, parent, seen));
}

/**
 * The record-bearing population, the rule that produced it, and what that rule
 * dropped.
 *
 * `cascade:RecordClass` is the marker `jayostis/spec#50` adds — the explicit
 * list ASK-05's ruling calls for, put in the ontologies so a consumer derives
 * it from the artifact it already loads rather than from a side file. A class
 * carries it directly; nothing is inherited, so an alignment axiom cannot leak
 * a class in.
 *
 * FLIPS ON ITS OWN. The marker does not exist at the pinned revision, so this
 * falls back to the PROV chain plus `pending-spec-50.json` and says so on every
 * build. The moment a checkout carries one marked class, the marker is the
 * population and the fallback is not consulted — no edit here, no flag, and the
 * build line changes to say which rule ran.
 *
 * `dropped` IS THE PRICE OF THAT. It is every live class the superseded rule
 * reached that the marker does not, so the flip announces its own losses rather
 * than leaving them to be noticed. Empty while the fallback is the population,
 * because then there is no earlier rule to compare against.
 *
 * @param {Map<string, object>} nodes - The merged graph, `iri -> node`.
 * @param {Set<string>} pendingClasses - `pending-spec-50.json`'s classes.
 * @returns {{ rule: string, classes: Set<string>, dropped: string[] }}
 */
export function recordPopulation(nodes, pendingClasses) {
  const marked = [...nodes]
    .filter(([, node]) => (node['@type'] ?? []).includes(RECORD_CLASS))
    .map(([iri]) => iri);

  const bridged = [...nodes]
    .filter(([iri, node]) => (node['@type'] ?? []).includes(OWL_CLASS) && bearsRecords(nodes, iri))
    .map(([iri]) => iri);

  const superseded = new Set([...bridged, ...pendingClasses]);

  if (marked.length === 0) return { rule: BRIDGE_RULE, classes: superseded, dropped: [] };

  const classes = new Set(marked);

  // A deprecated class is not a record type under either rule — the build
  // filters them out and attaches them to whatever superseded them — so its
  // absence from the marked set is not a loss to report.
  const dropped = [...superseded]
    .filter((iri) => !classes.has(iri) && !nodes.get(iri)?.[DEPRECATED])
    .sort();

  return { rule: MARKER_RULE, classes, dropped };
}
