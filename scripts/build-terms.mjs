/**
 * Derive the JSON-key→predicate tables from the shipped contexts and ontologies.
 *
 * PER VOCABULARY, NOT ONE FLAT MAP, and that is forced rather than chosen.
 * Thirty-four JSON keys resolve to DIFFERENT predicates in different contexts —
 * `notes` is `clinical:notes` under `clinical` and `health:notes` under
 * `health`, and `status`, `severity`, `sourceRecordId` and thirty more are the
 * same. A single `key -> predicate` map would have to pick one, silently, and
 * write the wrong predicate for every record of the other class. That is #42's
 * "six JSON keys mean a different predicate depending on the record's class"
 * measured across the whole corpus, and `jayostis/spec#4` is the proposal that
 * would fix it properly with JSON-LD 1.1 type-scoped terms.
 *
 * Until then a record resolves its keys against `core` plus its own class's
 * vocabulary, which is what JSON-LD 1.0 can express and what the thin slice
 * already did — except that the vocabulary now comes from the record's class
 * rather than from a fixture field.
 *
 * RANGES COME FROM THE ONTOLOGY, and they are what the contexts cannot say.
 * `../spec/contexts/v1/health.jsonld` gives `administrationDate` no `@type`, so
 * a converter following the context alone writes an untyped literal and
 * `health:ImmunizationRecordShape` rejects it — `jayostis/spec#46`. The
 * ontology declares `rdfs:range xsd:dateTime` and has all along. Same for
 * `cascade:dataProvenance`, whose bare value `"ClinicalGenerated"` has no
 * resolution rule in any context (`jayostis/spec#47`) and whose range class's
 * subclasses are exactly the permitted values.
 *
 * EMITTED AS A PARSED STRING, not as an object literal. #76 measured tsc
 * inferring 41,029 types for a 351K `as const` module; a single string literal
 * costs one, and `JSON.parse` of 138K is about a millisecond at load.
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = specDataDir(root);
const CONTEXTS = join(DATA, 'contexts');
const ONTOLOGIES = join(DATA, 'ontologies');
const OUT = join(DATA, 'derived/terms.generated.ts');

const SUB_CLASS_OF = 'http://www.w3.org/2000/01/rdf-schema#subClassOf';
const RANGE = 'http://www.w3.org/2000/01/rdf-schema#range';
const DOMAIN = 'http://www.w3.org/2000/01/rdf-schema#domain';
const OWL_CLASS = 'http://www.w3.org/2002/07/owl#Class';
const OWL_NAMED_INDIVIDUAL = 'http://www.w3.org/2002/07/owl#NamedIndividual';
const CASCADE_NAMESPACE = 'https://ns.cascadeprotocol.org/';

import { localNameOf, namespaceOwners } from './lib/iri.mjs';
import {
  contextPrefixes, expandCurie, isPrefixDeclaration, mergedOntologyGraph, specDataDir,
} from './lib/spec-source.mjs';

const contextFiles = readdirSync(CONTEXTS).filter((f) => f.endsWith('.jsonld'));

const prefixes = contextPrefixes(CONTEXTS);

if (prefixes.size === 0) {
  throw new Error(`no prefix declarations in ${CONTEXTS}; every CURIE would resolve to itself.`);
}

const expand = (id) => expandCurie(prefixes, id);

// ── the ontology graph, for ranges and for a range class's members ───────────

const nodes = mergedOntologyGraph(ONTOLOGIES);

const rangeOf = (predicate) => nodes.get(predicate)?.[RANGE]?.[0]?.['@id'];

/**
 * The classes whose fields spec has actually declared — every class named as
 * the `rdfs:domain` of at least one property, anywhere in the corpus.
 *
 * This is NOT the enum-vs-structured test (`jayostis/spec` disagrees with the
 * members test on 39/89 ranges if it were used that way — see #91). It exists
 * for exactly one narrower question, asked only of a range that already
 * failed the members test: does spec consider this class structured at all,
 * or did it publish a class with nothing on it?
 */
const classesWithFields = new Set();
for (const node of nodes.values()) {
  for (const domain of node[DOMAIN] ?? []) {
    if (domain['@id']) classesWithFields.add(domain['@id']);
  }
}

/**
 * The classes a range class admits, by local name.
 *
 * `cascade:dataProvenance` has `rdfs:range cascade:DataProvenance`, and the
 * permitted values are that class's subclasses — `cascade:ClinicalGenerated`
 * and the rest, promoted from individuals to classes in core v3.x. So a bare
 * `"ClinicalGenerated"` under `"@type": "@id"` resolves through the range,
 * which is the fact `jayostis/spec#47` asks a context to state and the ontology
 * already carries.
 *
 * MEMBERS ARE PUBLISHED TWO WAYS, and both count. `cascade:DataProvenance`
 * declares its three values as SUBCLASSES; `cascade:ConsentScope` and five
 * more (`GenerationTrigger`, `ReconciliationStatus`,
 * `ConflictResolutionStrategy`, `LayerPromotionStatusValue`,
 * `health:SleepQuality`) declare theirs as NAMED INDIVIDUALS — each member
 * typed `owl:NamedIndividual` and typed AGAIN, directly, to the range class,
 * rather than related to it by `rdfs:subClassOf` at all (#91). A rule that
 * only walked `rdfs:subClassOf` was invisible to the second form, so
 * `cascade:consentScope` carrying `"SocialHistoryConsent"` resolved to
 * nothing.
 *
 * `health:WalkingSteadinessLevel` is NOT one of the six: its members
 * (`WalkingSteadinessLow/OK/Unknown/VeryLow`) carry only the range type, with
 * no `owl:NamedIndividual` in their `@type` array, so `isNamedIndividual`
 * evaluates false for all of them below. That is currently latent only
 * because the context's `walkingSteadiness` term resolves to an unrelated
 * `xsd:string` range rather than this enum range — a separate, pre-existing
 * naming mismatch that happens to keep this class from ever being looked up
 * here. If that mismatch is fixed independently, this class would wrongly
 * fall into `unclassifiableRanges` with a `specFix` message asking spec to
 * add members it has already published as plain-typed individuals, not
 * named individuals.
 */
function membersOf(rangeIri) {
  // A PROV root is not a code list. `rdfs:range prov:Entity` says "the value is
  // a record", and enumerating its subclasses would produce a 55-member "value
  // set" containing every record class in the corpus — which a converter would
  // then use to resolve a bare string into whichever class happened to share
  // its local name. The three real code lists are `cascade:DataProvenance` and
  // its kind: a class whose subclasses ARE the permitted values.
  if (rangeIri.startsWith('http://www.w3.org/ns/prov#')) return undefined;

  const members = {};

  for (const [iri, node] of nodes) {
    const types = node['@type'] ?? [];
    const isSubclass =
      types.includes(OWL_CLASS) && (node[SUB_CLASS_OF] ?? []).some((parent) => parent['@id'] === rangeIri);
    const isNamedIndividual = types.includes(OWL_NAMED_INDIVIDUAL) && types.includes(rangeIri);

    if (!isSubclass && !isNamedIndividual) continue;
    members[localNameOf(iri)] = iri;
  }

  return Object.keys(members).length > 0 ? members : undefined;
}

/**
 * Why spec would need to change before this range stops being ambiguous.
 *
 * Reached only for a Cascade-namespace range that failed BOTH tests above: no
 * member (neither a subclass nor a named individual) and no `rdfs:domain`-
 * linked property either. That is neither a code list nor a structured class
 * with anything to write — a class spec declared and never populated, which
 * is `spec`'s gap to close, not this SDK's to guess at. `rdfs:Resource`,
 * `rdf:List`, `prov:Entity`, `prov:Agent` and `xsd:anyURI` fail the same two
 * tests and never reach this function — they are open-by-design references,
 * not Cascade-namespace classes, and the caller filters on the namespace
 * before calling.
 */
function specFixFor(rangeIri) {
  const local = localNameOf(rangeIri);

  return `spec declares ${local} but gives it no rdfs:domain-linked property and no published `
    + `members (subclasses or named individuals), so nothing marks it a structured class or a `
    + `code list. Add fields to spec's ontology for ${local} — or, if it is meant to enumerate a `
    + 'closed set of values, declare its members the way cascade:DataProvenance or '
    + 'cascade:ConsentScope do — before a converter can express a value for it.';
}

// ── the per-vocabulary term tables ───────────────────────────────────────────

const vocabularies = {};
const valueSets = {};
const unclassifiableRanges = {};
const conflicts = [];
const unresolvable = [];
const seen = new Map();

for (const file of contextFiles) {
  const vocabulary = file.replace(/\.jsonld$/, '');
  const document = JSON.parse(readFileSync(join(CONTEXTS, file), 'utf-8'));
  const terms = {};

  for (const [term, value] of Object.entries(document['@context'] ?? {})) {
    if (term.startsWith('@') || isPrefixDeclaration(value)) continue;

    const id = typeof value === 'string' ? value : value?.['@id'];
    if (typeof id !== 'string') continue;

    const predicate = expand(id);

    // A PREDICATE THAT IS NOT AN IRI IS NOT A PREDICATE. `expand` returns its
    // argument unchanged when no prefix matches, so a term whose value is prose
    // arrives here as prose — and written into a pod it becomes a triple whose
    // predicate is a sentence, which no shape can judge and no reader can
    // resolve.
    //
    // Not hypothetical. At the revision `conformance/scripts/SPEC_PIN` names,
    // eight terms across three contexts are section headers written as term
    // definitions — `"__comment_core": "=== Core Vocabulary (cascade:) ==="` and
    // seven more. That is `jayostis/spec#48`, fixed upstream in spec PR #49 and
    // not yet pinned, so a build here still meets them.
    //
    // SKIPPED AND COUNTED, not refused. The pinned data legitimately contains
    // them and the fix is already upstream, so failing the build would break CI
    // over something no longer wrong at spec's HEAD. The count is printed on
    // every run instead, and reaches zero on its own when the pin moves.
    if (!/^[A-Za-z][A-Za-z0-9+.-]*:\S*$/.test(predicate)) {
      unresolvable.push(`${vocabulary}: ${JSON.stringify(term)} -> ${JSON.stringify(id)}`);
      continue;
    }

    const entry = { predicate };

    if (typeof value === 'object') {
      if (value['@type']) entry.type = value['@type'] === '@id' ? '@id' : expand(value['@type']);
      if (value['@container']) entry.container = value['@container'];
    }

    // The ontology's answer, carried only where the context has none. The
    // context is the authority on what a key MEANS; the ontology is the only
    // statement of what its values look like.
    const range = rangeOf(predicate);
    // Carried ALONGSIDE the context type, never instead of it. A term marked
    // `"@type": "@id"` still needs its range to resolve a bare token: the range
    // class's subclasses ARE the permitted values, and without it
    // `"ClinicalGenerated"` has nowhere to resolve against.
    if (range) entry.range = range;
    if (range && !valueSets[range]) {
      const members = membersOf(range);
      if (members) {
        valueSets[range] = members;
      } else if (range.startsWith(CASCADE_NAMESPACE) && !classesWithFields.has(range)) {
        // Neither a code list nor a structured class with anything declared —
        // spec's gap, not a value to guess at. Scoped to the Cascade namespace
        // ONLY: `rdfs:Resource`, `rdf:List`, `prov:Entity`, `prov:Agent` and
        // `xsd:anyURI` fail these same two tests and are open-by-design
        // references, never a spec-row worklist entry (#91).
        unclassifiableRanges[range] = { specFix: specFixFor(range) };
      }
    }

    terms[term] = entry;

    // Compared against the MOST RECENT predicate seen for this term, not the
    // first: `seen` used to be written only in the non-conflicting branch, so
    // once a term had one conflict on record it was never compared again — a
    // term redefined across three or more contexts (A, then B, then C) missed
    // the B/C transition entirely, and a later repeat of B would be re-flagged
    // against A as if it were new. Updating `seen` unconditionally makes each
    // visit compare against what actually preceded it.
    const previous = seen.get(term);
    if (previous && previous !== predicate) conflicts.push({ term, a: previous, b: predicate });
    seen.set(term, predicate);
  }

  vocabularies[vocabulary] = terms;
}

const payload = JSON.stringify({
  vocabularies,
  valueSets,
  // The worklist: ranges neither test could classify, and why. Present ONLY
  // for the Cascade-namespace classes spec declares and never populates —
  // absent for every other range, including the five open-by-design
  // references (#91).
  unclassifiableRanges,
  // Which context owns each namespace, DERIVED from the terms rather than
  // parsed out of a class IRI. See `scripts/lib/iri.mjs` for the rule and for
  // what it replaced.
  namespaceOwners: namespaceOwners(vocabularies),
  // The prefixes the contexts declare, carried so a routed writer can render
  // Turtle rather than N-Triples. `serialize()` is documented as returning a
  // Turtle document, and routing a record type must not change the FORMAT of
  // what a caller gets — only which code produced it.
  prefixes: Object.fromEntries([...prefixes].sort()),
});

// Distinct KEYS, not conflict transitions: a term redefined across three or
// more contexts now records one entry per transition (see the fix above), so
// `conflicts.length` can exceed the number of JSON keys actually affected.
// The docblock below states a key count and names examples, so it is built
// from the deduplicated set — and the "and N others" clause is only appended
// when there IS an "others", so a corpus with two or fewer conflicting keys
// renders a plain list instead of a negative count.
const conflictedKeys = [...new Set(conflicts.map((c) => c.term))].sort();
const exampleKeys = conflictedKeys.slice(0, 3);
const remainingKeys = conflictedKeys.length - exampleKeys.length;
const conflictedKeysPhrase = exampleKeys.length === 0
  ? 'zero JSON keys'
  : `\`${exampleKeys.join('\`, \`')}\`${remainingKeys > 0 ? ` and ${remainingKeys} others` : ''}`;

const source = `/**
 * GENERATED by \`scripts/build-terms.mjs\`. Do not edit.
 *
 * Per-vocabulary JSON-key→predicate tables, read out of the contexts this
 * package ships, plus the \`rdfs:range\` facts the contexts do not carry.
 *
 * PER VOCABULARY because ${conflictedKeys.length} JSON keys resolve to different predicates in
 * different contexts — ${conflictedKeysPhrase}. One flat
 * map would pick one silently and write the wrong predicate for every record of
 * the other class. See \`jayostis/spec#4\`.
 *
 * A STRING, PARSED AT LOAD. #76 measured tsc inferring 41,029 types for a
 * comparable object literal; this costs one type and about a millisecond.
 *
 * @module spec/derived
 */

/** One JSON key, as the context and the ontology together describe it. */
export interface TermDefinition {
  /** The predicate IRI, expanded. */
  readonly predicate: string;
  /** The context's \`@type\`: \`'@id'\`, or a datatype IRI. */
  readonly type?: string;
  /** The context's \`@container\`: \`'@set'\` or \`'@list'\`. */
  readonly container?: string;
  /** \`rdfs:range\` from the ontology, carried only where the context is silent. */
  readonly range?: string;
}

/**
 * Why a range is neither a code list nor a structured class with anything on
 * it — spec's gap, named so a converter can point at it instead of guessing.
 */
export interface UnclassifiableRange {
  /** What spec would need to add before a value for this range is expressible. */
  readonly specFix: string;
}

export interface SpecTerms {
  /** \`vocabulary -> JSON key -> definition\`. */
  readonly vocabularies: Readonly<Record<string, Readonly<Record<string, TermDefinition>>>>;
  /** \`range class IRI -> local name -> member IRI\`, for resolving a bare value. */
  readonly valueSets: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /**
   * \`range class IRI -> why\`. Present ONLY for a Cascade-namespace class spec
   * declares and gives neither members nor fields — absent for every other
   * range, including the five open-by-design references (\`rdfs:Resource\`,
   * \`rdf:List\`, \`prov:Entity\`, \`prov:Agent\`, \`xsd:anyURI\`), which are
   * correctly open rather than a gap.
   */
  readonly unclassifiableRanges: Readonly<Record<string, UnclassifiableRange>>;
  /**
   * \`namespace -> the context that owns it\`, derived from the terms themselves.
   *
   * Which vocabulary a record resolves against used to be read out of its class
   * IRI with a regex — spec's URI shape as an assumption in code, silently
   * defaulting to \`core\` on any IRI it did not match. This is the same fact
   * taken from spec: each per-vocabulary context has 100% of its terms in one
   * namespace, while \`cascade.jsonld\` never exceeds 34% of any, so the owner is
   * the context with the largest share. See \`scripts/lib/iri.mjs\`.
   */
  readonly namespaceOwners: Readonly<Record<string, string>>;
  /** Prefixes, as the contexts declare them, for rendering Turtle. */
  readonly prefixes: Readonly<Record<string, string>>;
}

export const SPEC_TERMS: SpecTerms = JSON.parse(
  ${JSON.stringify(payload)},
) as SpecTerms;
`;

// The directory is not in git: everything under src/spec/ is generated and
// ignored, and git does not track an empty directory. A clean clone therefore
// has no src/spec/derived/ at all, which CI found and a local test that deleted
// only the FILE did not.
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, source, 'utf-8');

if (unresolvable.length > 0) {
  console.log(
    `  NOTE: ${unresolvable.length} term(s) skipped, whose value is not an IRI — jayostis/spec#48,`
    + ` fixed upstream and not yet pinned:
`
    + unresolvable.map((line) => `    ${line}`).join(`
`),
  );
}

// A HOTSPOT, NOT A BUILD FAILURE. Each of these ranges is a class spec
// declares and gives neither members nor fields — not this SDK's to invent,
// so the build still succeeds and `unclassifiableRanges` carries the same
// reasoning into `convertToRdf`, which refuses per VALUE rather than
// blanket-refusing the type (#91).
const unclassifiableEntries = Object.entries(unclassifiableRanges);
if (unclassifiableEntries.length > 0) {
  console.warn(
    `\n  NOTE: ${unclassifiableEntries.length} range(s) are neither a code list nor a structured `
    + 'class with any field spec has declared:\n'
    + unclassifiableEntries.map(([range, { specFix }]) => `    ${range}\n      ${specFix}`).join('\n')
    + '\n',
  );
}

console.log(
  `build-terms: ${Object.keys(vocabularies).length} vocabularies, `
  + `${Object.values(vocabularies).reduce((n, t) => n + Object.keys(t).length, 0)} terms, `
  + `${Object.keys(valueSets).length} value sets, ${unclassifiableEntries.length} unclassifiable `
  + `ranges, ${conflicts.length} cross-context conflicts, `
  + `${Math.round(payload.length / 1024)}K -> src/spec/derived/terms.generated.ts`,
);
