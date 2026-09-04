/**
 * The detectors: pure functions over the spec graph and the context terms,
 * each answering one question the build used to answer in a print statement
 * or not at all.
 *
 * FUNCTIONS OVER `(nodes, terms)`, NOT SWEEPS INLINED IN THE GENERATORS. The
 * generators hard-code `src/spec/` (or `CASCADE_SPEC_DATA_DIR`) for input and
 * output, and `build-spec-data.mjs` empties that directory before writing —
 * so a detector that only existed inside a generator could only ever be run
 * against the real data, and the real data cannot be made to say most of
 * what these exist to say (no dangling successor, no key declared across
 * three contexts twice). `scripts/lib/record-population.mjs` states the
 * pattern: take the graph as an argument, so a fixture can be handed in.
 * The generator's job is to call these with the real graph and hand the
 * result to the findings channel.
 *
 * EACH RETURNS DATA, NEVER A FINDING. Severity, owner, prose and location are
 * the generator's to attach, at write time — `build-terms.mjs` can only map a
 * namespace to its ontology file after it has read every context, which is
 * after the loop that spots most of these.
 *
 * "IS THIS TERM A PROPERTY?" — the one filter two detectors share. A context
 * term names a class (`"PatientProfile": "cascade:PatientProfile"`) as
 * readily as a property, and class terms have no `@type` and no `rdfs:range`
 * by nature and collide across contexts the way property terms do. A term is
 * a property term when its IRI's node is typed `rdf:Property` or one of the
 * three OWL property kinds — annotation properties INCLUDED, since every real
 * `term-no-type-info` hit is one — OR when the IRI has no node at all: a
 * context term the ontology never declares is written to `terms.generated.ts`
 * as a bare predicate and converted by guessing, the exact case the check
 * exists for, and "typed as a property" would skip it. Zero such terms exist
 * at the current pin; this is a tripwire, stated so nobody narrows the filter
 * later and calls it a cleanup.
 *
 * @module scripts/lib/detectors
 */

const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const OWL = 'http://www.w3.org/2002/07/owl#';

export const RDFS_RANGE = `${RDFS}range`;
export const RDFS_SEE_ALSO = `${RDFS}seeAlso`;
export const OWL_DEPRECATED = `${OWL}deprecated`;
const OWL_NAMED_INDIVIDUAL = `${OWL}NamedIndividual`;

export const CASCADE_NAMESPACE = 'https://ns.cascadeprotocol.org/';

/** The four types under which spec declares a property. */
export const PROPERTY_TYPES = Object.freeze([
  `${RDF}Property`,
  `${OWL}ObjectProperty`,
  `${OWL}DatatypeProperty`,
  `${OWL}AnnotationProperty`,
]);

const typesOf = (nodes, iri) => nodes.get(iri)?.['@type'] ?? [];

/** Whether `iri` has a node typed as a property. */
export const isDeclaredProperty = (nodes, iri) =>
  typesOf(nodes, iri).some((type) => PROPERTY_TYPES.includes(type));

/** The shared filter: typed as a property, or not in the graph at all. */
export const isPropertyTerm = (nodes, iri) => !nodes.has(iri) || isDeclaredProperty(nodes, iri);

const isDeprecated = (node) => Boolean(node[OWL_DEPRECATED]);

/**
 * A context term as the generator saw it: which file, which key, which
 * predicate it expanded to, and whether the context typed it.
 *
 * @typedef {{ file: string, vocabulary: string, term: string, predicate: string, typed: boolean }} TermSighting
 */

const groupBy = (items, keyOf) => {
  const groups = new Map();
  for (const item of items) {
    const key = keyOf(item);
    (groups.get(key) ?? groups.set(key, []).get(key)).push(item);
  }
  return groups;
};

const sortedUnique = (values) => [...new Set(values)].sort();

/**
 * Every JSON key that resolves to more than one predicate across the
 * contexts, one entry per KEY with every predicate it resolved to.
 *
 * PER KEY, NOT PER TRANSITION. `sourceBundleId` is declared in three contexts
 * — `core:`, then `clinical:`, then `core:` again — which is two transitions
 * in a loop and one contested key with two predicates. Restricted to property
 * terms: `SocialHistoryRecord` names two record classes in two contexts, and
 * that is `record-class-name-collision`'s row already.
 *
 * @param {Map<string, object>} nodes
 * @param {TermSighting[]} sightings
 * @returns {{ term: string, predicates: string[], files: string[] }[]}
 */
export function crossContextConflicts(nodes, sightings) {
  const conflicts = [];

  for (const [term, seen] of groupBy(sightings, (s) => s.term)) {
    const predicates = sortedUnique(seen.map((s) => s.predicate));
    if (predicates.length < 2) continue;
    if (!predicates.some((predicate) => isPropertyTerm(nodes, predicate))) continue;

    conflicts.push({ term, predicates, files: sortedUnique(seen.map((s) => s.file)) });
  }

  return conflicts.sort((a, b) => a.term.localeCompare(b.term));
}

/**
 * Every property term the contexts leave untyped AND the ontology leaves
 * unranged — nothing anywhere says what shape its value takes — deduped by
 * predicate, since most are declared once in their own vocabulary's context
 * and again in `cascade.jsonld`.
 *
 * @param {Map<string, object>} nodes
 * @param {TermSighting[]} sightings
 * @returns {{ predicate: string, reachedBy: string[], files: string[] }[]}
 */
export function termsWithNoTypeInfo(nodes, sightings) {
  const untyped = sightings.filter((s) =>
    !s.typed && !nodes.get(s.predicate)?.[RDFS_RANGE]?.[0]?.['@id'] && isPropertyTerm(nodes, s.predicate));

  return [...groupBy(untyped, (s) => s.predicate)]
    .map(([predicate, seen]) => ({
      predicate,
      reachedBy: sortedUnique(seen.map((s) => `${s.vocabulary}:${s.term}`)),
      files: sortedUnique(seen.map((s) => s.file)),
    }))
    .sort((a, b) => a.predicate.localeCompare(b.predicate));
}

/**
 * Every live property in the ontology with no `rdfs:range`, with the context
 * terms that reach it — empty when none does, which is an answer, not an
 * omission.
 *
 * DEPRECATED PROPERTIES EXCLUDED: spec debt on a thing spec has already
 * retired is noise, the same reason `build-record-types.mjs` drops deprecated
 * classes from the live table.
 *
 * @param {Map<string, object>} nodes
 * @param {TermSighting[]} sightings
 * @returns {{ iri: string, types: string[], reachedBy: string[] }[]}
 */
export function propertiesWithNoRange(nodes, sightings) {
  const reached = groupBy(sightings, (s) => s.predicate);
  const found = [];

  for (const [iri, node] of nodes) {
    if (!isDeclaredProperty(nodes, iri) || isDeprecated(node)) continue;
    if (node[RDFS_RANGE]?.some((range) => range['@id'])) continue;

    found.push({
      iri,
      types: (node['@type'] ?? []).filter((type) => PROPERTY_TYPES.includes(type)).sort(),
      reachedBy: sortedUnique((reached.get(iri) ?? []).map((s) => `${s.vocabulary}:${s.term}`)),
    });
  }

  return found.sort((a, b) => a.iri.localeCompare(b.iri));
}

/**
 * Every Cascade-namespace range class with member nodes typed directly to it
 * and to nothing that `membersOf()` in `build-terms.mjs` recognises — no
 * `owl:NamedIndividual` (the `cascade:ConsentScope` form; subclasses, the
 * `cascade:DataProvenance` form, are not typed to the range at all and never
 * reach this).
 *
 * A SWEEP OVER EVERY RANGE, NOT A HOOK IN `membersOf()`. That function runs
 * only for a range some context term reaches, and the one real case —
 * `health:WalkingSteadinessLevel` — is reached by none, so a hook there would
 * reproduce the blind spot this exists to close.
 *
 * @param {Map<string, object>} nodes
 * @returns {{ range: string, members: string[] }[]}
 */
export function rangesWithUnrecognizedTypedMembers(nodes) {
  const ranges = new Set();
  for (const node of nodes.values()) {
    for (const range of node[RDFS_RANGE] ?? []) {
      if (range['@id']?.startsWith(CASCADE_NAMESPACE)) ranges.add(range['@id']);
    }
  }

  const found = [];
  for (const range of [...ranges].sort()) {
    const members = [];
    for (const [iri, node] of nodes) {
      const types = node['@type'] ?? [];
      if (types.includes(range) && !types.includes(OWL_NAMED_INDIVIDUAL)) members.push(iri);
    }
    if (members.length > 0) found.push({ range, members: members.sort() });
  }

  return found;
}

/**
 * Every predicate this SDK registers in a Cascade namespace that the ontology
 * does not declare as a property, and whether any context carries it.
 *
 * NARROW ON PURPOSE. Naively (every prefix, spec's own prefix map) the
 * cross-reference returns ~35 and most are noise: draft vocabularies this SDK
 * itself excludes from its generated context, and borrowed vocabulary
 * (`foaf:`, `dcterms:`) Cascade's ontology was never going to declare. So:
 * expanded with the SDK's own prefix table, kept only under the Cascade
 * namespace root, minus the draft-excluded prefixes, and "present as a
 * property" rather than "present as a node" — `health:snomedCode` is present
 * only as `owl:AnnotationProperty`, and that counts as declared.
 *
 * @param {Map<string, object>} nodes
 * @param {{ key: string, curie: string, prefix: string | null, iri: string }[]} registered -
 *   `readPredicatesModule().expanded`.
 * @param {Set<string>} excludedPrefixes - The draft prefixes to ignore.
 * @param {TermSighting[]} sightings - Every context term, for the `reconcile` test.
 * @returns {{ iri: string, keys: string[], inContexts: string[] }[]}
 */
export function undeclaredPredicates(nodes, registered, excludedPrefixes, sightings) {
  const carriedBy = groupBy(sightings, (s) => s.predicate);
  const found = [];

  for (const [iri, entries] of groupBy(registered, (r) => r.iri)) {
    if (!iri.startsWith(CASCADE_NAMESPACE)) continue;
    if (entries.some((entry) => entry.prefix && excludedPrefixes.has(entry.prefix))) continue;
    if (isDeclaredProperty(nodes, iri)) continue;

    found.push({
      iri,
      keys: sortedUnique(entries.map((entry) => `${entry.key}: '${entry.curie}'`)),
      inContexts: sortedUnique((carriedBy.get(iri) ?? []).map((s) => s.file)),
    });
  }

  return found.sort((a, b) => a.iri.localeCompare(b.iri));
}

/**
 * Every deprecated record class whose `rdfs:seeAlso` resolves to no live
 * record class — including the class with no `rdfs:seeAlso` at all.
 *
 * PER CLASS, NOT PER TARGET. `clinical:CoverageRecord` names both
 * `coverage:InsurancePlan`, which resolves, and `http://hl7.org/fhir/Coverage`,
 * which never will; one live successor is enough. RECORD POPULATION ONLY: the
 * deprecated nodes include nine properties with no `rdfs:seeAlso`, and a
 * property has no successor to resolve.
 *
 * @param {Map<string, object>} nodes
 * @param {Set<string>} population - Every IRI carrying `cascade:RecordClass`.
 * @param {Set<string>} live - The live record classes a target may resolve to.
 * @returns {{ iri: string, targets: string[] }[]}
 */
export function unresolvedSuccessors(nodes, population, live) {
  const found = [];

  for (const [iri, node] of nodes) {
    if (!population.has(iri) || !isDeprecated(node)) continue;

    const targets = (node[RDFS_SEE_ALSO] ?? []).map((target) => target['@id']).filter(Boolean);
    if (targets.some((target) => live.has(target))) continue;

    found.push({ iri, targets: [...targets].sort() });
  }

  return found.sort((a, b) => a.iri.localeCompare(b.iri));
}

/**
 * The RFC 2119 keywords, UPPERCASE ONLY, plus spec's own "VALUE FORM". A
 * case-insensitive match quadruples the hits with ordinary prose ("Readers
 * must continue to accept both" on the deprecated classes).
 */
export const NORMATIVE_LANGUAGE = /\b(?:MUST|SHOULD|SHALL|REQUIRED|RECOMMENDED|MAY|OPTIONAL)\b|VALUE FORM/;

const RDFS_COMMENT = `${RDFS}comment`;

/**
 * Every IRI-identified subject whose `rdfs:comment` states a rule in RFC 2119
 * language, with the matching comments folded into one entry per subject.
 *
 * Over raw quads rather than the JSON-LD, because `build-spec-data.mjs` drops
 * `rdfs:comment` before it writes — this runs where the predicate is still
 * in hand. Blank-node subjects are skipped: `_:b3` is not a stable subject
 * and nothing a reader could look up.
 *
 * @param {Iterable<{ subject: { termType: string, value: string }, predicate: { value: string }, object: { termType: string, value: string } }>} quads
 * @param {Map<string, { comments: string[] }>} [into] - An accumulator, so
 *   several vocabularies' quads fold into one map keyed by subject.
 * @returns {Map<string, { comments: string[] }>}
 */
export function normativeLanguageInComments(quads, into = new Map()) {
  for (const quad of quads) {
    if (quad.predicate.value !== RDFS_COMMENT) continue;
    if (quad.subject.termType !== 'NamedNode' || quad.object.termType !== 'Literal') continue;
    if (!NORMATIVE_LANGUAGE.test(quad.object.value)) continue;

    const entry = into.get(quad.subject.value) ?? into.set(quad.subject.value, { comments: [] }).get(quad.subject.value);
    entry.comments.push(quad.object.value);
  }

  return into;
}
