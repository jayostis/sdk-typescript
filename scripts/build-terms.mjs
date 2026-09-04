/**
 * Derive the JSON-key→predicate tables from the shipped contexts and ontologies.
 *
 * PER VOCABULARY, NOT ONE FLAT MAP, and that is forced rather than chosen.
 * Dozens of JSON keys resolve to DIFFERENT predicates in different contexts —
 * `notes` is `clinical:notes` under `clinical` and `health:notes` under
 * `health`, and `status`, `severity`, `sourceRecordId` and many more are the
 * same. A single `key -> predicate` map would have to pick one, silently, and
 * write the wrong predicate for every record of the other class. That is #42's
 * "six JSON keys mean a different predicate depending on the record's class"
 * measured across the whole corpus, and `jayostis/spec#4` is the proposal that
 * would fix it properly with JSON-LD 1.1 type-scoped terms. How many keys is
 * not written here — a count in a comment goes stale the way "28 comments" did
 * — it is measured on every build and recorded, key by key, as
 * `term-cross-context-conflict` findings (`docs/spec-diagnostics.md`).
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
 *
 * WHAT IT REPORTS, besides writing the table. Every defect this script finds
 * on the way — a term whose value is prose, a range it cannot classify, a key
 * that conflicts across contexts, and the sweeps at the bottom — goes through
 * `scripts/lib/diagnostics.mjs` as well as being printed. The detectors are
 * `scripts/lib/detectors.mjs` functions over the graph and the term sightings,
 * so a fixture can be handed to them; this script's job is to call them with
 * the real data and attach the prose and the files to open. None of them is a
 * refusal: the table is written whatever they say.
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CASCADE_NAMESPACE, RDFS_RANGE as RANGE, crossContextConflicts, propertiesWithNoRange,
  rangesWithUnrecognizedTypedMembers, termsWithNoTypeInfo, undeclaredPredicates,
} from './lib/detectors.mjs';
import { openFindings } from './lib/diagnostics.mjs';
import { localNameOf, namespaceOwners } from './lib/iri.mjs';
import { readPredicatesModule } from './lib/predicates-module.mjs';
import { specLocations } from './lib/spec-locations.mjs';
import {
  contextPrefixes, expandCurie, isPrefixDeclaration, mergedOntologyGraph, specDataLayout,
} from './lib/spec-source.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { ontologies: ONTOLOGIES, contexts: CONTEXTS, derived: DERIVED, diagnostics: DIAGNOSTICS } = specDataLayout(root);
const OUT = join(DERIVED, 'terms.generated.ts');

const SUB_CLASS_OF = 'http://www.w3.org/2000/01/rdf-schema#subClassOf';
const DOMAIN = 'http://www.w3.org/2000/01/rdf-schema#domain';
const OWL_CLASS = 'http://www.w3.org/2002/07/owl#Class';
const OWL_NAMED_INDIVIDUAL = 'http://www.w3.org/2002/07/owl#NamedIndividual';

/**
 * The SDK's hand-kept predicate table, cross-referenced against the ontology
 * for `declared-predicate-not-in-ontology`. `CASCADE_PREDICATES_FILE` points a
 * test at a stand-in in the same shape; the default is the real file.
 */
const PREDICATES_FILE = process.env.CASCADE_PREDICATES_FILE
  ? resolve(process.env.CASCADE_PREDICATES_FILE)
  : join(root, 'src/vocabularies/namespaces.ts');

// Opened first: a crash anywhere below leaves no findings file rather than
// the previous run's, which is what lets the collector tell the two apart.
const findings = openFindings({ source: 'build-terms', dir: DIAGNOSTICS });
const manifest = JSON.parse(readFileSync(join(root, 'spec-sources.json'), 'utf-8'));

const contextFiles = readdirSync(CONTEXTS).filter((f) => f.endsWith('.jsonld'));

const prefixes = contextPrefixes(CONTEXTS);

if (prefixes.size === 0) {
  throw new Error(`no prefix declarations in ${CONTEXTS}; every CURIE would resolve to itself.`);
}

const expand = (id) => expandCurie(prefixes, id);

// ── the ontology graph, for ranges and for a range class's members ───────────

const nodes = mergedOntologyGraph(ONTOLOGIES);
const locations = specLocations(ONTOLOGIES, manifest);

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
 * A THIRD FORM EXISTS AND IS NOT RECOGNISED HERE: `health:WalkingSteadinessLevel`'s
 * members carry only the range type, with no `owl:NamedIndividual`, so
 * `isNamedIndividual` is false for all of them. It is latent only because the
 * context's `walkingSteadiness` term resolves to an unrelated `xsd:string`
 * range, so this class is never looked up; the day that mismatch is fixed it
 * would fall into `unclassifiableRanges` asking spec for members it has
 * already published. `rangesWithUnrecognizedTypedMembers` sweeps EVERY range
 * for that form — not this function, which only ever sees a reached range —
 * and reports it as `range-has-unrecognized-typed-members`.
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
const unresolvable = [];

/**
 * Every resolved context term, as the detectors see it: which file, which
 * key, which predicate, and whether the context typed it. Kept for the
 * sweeps below, which run after the loop because only then can a namespace
 * be mapped to the file to open.
 */
const sightings = [];

/** range IRI -> the terms (`vocabulary:term`) whose predicate has that range. */
const rangeReachedBy = new Map();
/** range IRI -> the context files those terms were read from. */
const rangeReachedFrom = new Map();

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
    // Not hypothetical. At spec `9b13ae4`, eight terms across three contexts
    // were section headers written as term definitions —
    // `"__comment_core": "=== Core Vocabulary (cascade:) ==="` and seven more.
    // That is `jayostis/spec#48`, fixed upstream in spec PR #49 and gone at the
    // current pin; the pin will move again, so the path stays.
    //
    // SKIPPED AND RECORDED, not refused. The pinned data may legitimately
    // contain them, so failing the build would break CI over something spec
    // has already fixed. Printed on every run, and a `term-value-not-iri`
    // finding per term, which reaches zero on its own when the pin moves.
    if (!/^[A-Za-z][A-Za-z0-9+.-]*:\S*$/.test(predicate)) {
      unresolvable.push({ file, vocabulary, term, id });
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
    if (range) {
      (rangeReachedBy.get(range) ?? rangeReachedBy.set(range, new Set()).get(range)).add(`${vocabulary}:${term}`);
      (rangeReachedFrom.get(range) ?? rangeReachedFrom.set(range, new Set()).get(range)).add(file);
    }
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
    sightings.push({ file, vocabulary, term, predicate, typed: Boolean(entry.type) });
  }

  vocabularies[vocabulary] = terms;
}

// ── the findings ─────────────────────────────────────────────────────────────
//
// After the loop, all of them, because a location is a file to open and the
// map from an IRI to its ontology file is only worth consulting once every
// context has been read. Each detector returns data; the prose, the owner and
// the files are attached here.

for (const { file, vocabulary, term, id } of unresolvable) {
  findings.record({
    code: 'term-value-not-iri',
    severity: 'info',
    owner: 'spec',
    subject: `${vocabulary}:${term}`,
    detail: `${JSON.stringify(term)} in ${file} resolves to ${JSON.stringify(id)}, which is not an IRI; `
      + 'written into a pod it would be a triple whose predicate is a sentence. The build skips it.',
    specFix: `Remove ${JSON.stringify(term)} from contexts/v1/${file}: a context term's value must be `
      + 'an IRI or a term definition (jayostis/spec#48).',
    location: [locations.context(file)],
  });
}

// THE ONE CODE THAT BLOCKS CONVERSION: `src/converter/to-rdf.ts` refuses a
// value for a property whose range is here, so `error`.
//
// LOCATED BY THE ONTOLOGY WHERE THERE IS ONE, BY THE CONTEXT OTHERWISE. A
// range with no node is placed by its namespace, and that has an answer only
// where spec ships an `owl:Ontology` for it — a range under `evidence:`,
// `workbench:` or a vocabulary not yet pinned has none. The context that
// reached it is always known and is a file to open; without the fallback the
// row would carry no location, `record()` would refuse it, and a spec defect
// would become a generator that exits 1 with neither file written.
for (const [range, { specFix }] of Object.entries(unclassifiableRanges)) {
  const reachedBy = [...rangeReachedBy.get(range) ?? []].sort();
  const ontologies = locations.ontologyOf(range);
  findings.record({
    code: 'unclassifiable-range',
    severity: 'error',
    owner: 'spec',
    subject: range,
    detail: `${range} is the rdfs:range of the property behind ${reachedBy.join(', ')}, and is neither `
      + 'a code list (no subclasses, no named individuals) nor a structured class (no rdfs:domain-linked '
      + 'property), so a converter cannot express a value for it and refuses rather than guess.',
    specFix,
    reachedBy,
    location: ontologies.length > 0
      ? ontologies
      : [...rangeReachedFrom.get(range) ?? []].map((file) => locations.context(file)),
  });
}

// ONE ROW PER KEY, with every predicate it resolved to. Everything but a key
// whose every IRI is a live record class: `SocialHistoryRecord` is
// `record-class-name-collision`'s row already, and nothing else is anyone's.
const conflicts = crossContextConflicts(nodes, sightings);
for (const { term, predicates, files } of conflicts) {
  findings.record({
    code: 'term-cross-context-conflict',
    severity: 'warning',
    owner: 'spec',
    subject: term,
    detail: `"${term}" resolves to ${predicates.length} different predicates across ${files.length} contexts `
      + `(${predicates.join(', ')}); a flat key-to-predicate map would pick one silently and write the `
      + 'wrong predicate for every record of the other class.',
    specFix: `Publish one meaning per key — JSON-LD 1.1 type-scoped terms (jayostis/spec#4) — or rename `
      + `one side of "${term}".`,
    predicates,
    location: files.map((file) => locations.context(file)),
  });
}

// `warning`, not `error`: `src/converter/to-rdf.ts` infers a datatype from the
// runtime value for exactly this case and SUCCEEDS, with nothing in spec
// behind the choice — a silent approximation, not a blocked conversion.
for (const { predicate, reachedBy, files } of termsWithNoTypeInfo(nodes, sightings)) {
  findings.record({
    code: 'term-no-type-info',
    severity: 'warning',
    owner: 'spec',
    subject: predicate,
    detail: `${predicate} (reached by ${reachedBy.join(', ')}) has no @type in any context that publishes `
      + 'it and no rdfs:range in the ontology, so nothing says what shape its value takes; a converter '
      + 'infers a datatype from the runtime value.',
    specFix: `Add rdfs:range to ${predicate} in the ontology, or an explicit @type to its term in `
      + `${files.join(' and ')}.`,
    reachedBy,
    location: [...locations.ontologyOf(predicate), ...files.map((file) => locations.context(file))],
  });
}

// Spec debt worth surfacing, not a blocker. `reachedBy` is rendered empty or
// not: neither "nothing uses it yet" nor "used by X" is a safe sentence.
for (const { iri, types, reachedBy } of propertiesWithNoRange(nodes, sightings)) {
  findings.record({
    code: 'property-no-range',
    severity: 'info',
    owner: 'spec',
    subject: iri,
    detail: `${iri} is declared ${types.map(localNameOf).join(' and ')} with no rdfs:range, so no writer `
      + `can type its values and no shape can judge them; ${reachedBy.length === 0
        ? 'no context term reaches it'
        : `reached by ${reachedBy.join(', ')}`}.`,
    specFix: `Add rdfs:range to ${iri}.`,
    reachedBy,
    location: locations.ontologyOf(iri),
  });
}

// A tooling regression-guard through the same channel as everything else.
for (const { range, members } of rangesWithUnrecognizedTypedMembers(nodes)) {
  findings.record({
    code: 'range-has-unrecognized-typed-members',
    severity: 'info',
    owner: 'reconcile',
    subject: range,
    detail: `${members.length} node(s) are typed directly to ${range} without owl:NamedIndividual and `
      + 'without rdfs:subClassOf — a third way of publishing a code list that membersOf() in '
      + 'scripts/build-terms.mjs does not recognise, so the range reads as having no members.',
    specFix: 'Not owed to spec outright: confirm whether these members were meant to carry '
      + 'owl:NamedIndividual the way cascade:ConsentScope\'s do. If so, add it in the ontology; if not, '
      + 'membersOf() should learn this form and this check be updated to match.',
    members,
    location: [...locations.ontologyOf(range), 'sdk:scripts/build-terms.mjs'],
  });
}

// The SDK's claim about spec, checked against spec. `sdk` when no context
// carries the IRI either (every hit at this pin); `reconcile` when one does,
// since then spec disagrees with itself. Scoped to the namespaces the graph
// declares an `owl:Ontology` for — the draft vocabularies this SDK registers
// so Turtle round-trips (`evidence:`, `workbench:`) have none and are out of
// scope by that fact, not by a list kept here.
const predicatesModule = readPredicatesModule(PREDICATES_FILE);
const predicatesPath = `sdk:${relative(root, PREDICATES_FILE).split('\\').join('/')}`;
const undeclared = undeclaredPredicates(nodes, predicatesModule.expanded, sightings);
for (const { iri, keys, inContexts } of undeclared) {
  const inContext = inContexts.length > 0;
  findings.record({
    code: 'declared-predicate-not-in-ontology',
    severity: 'warning',
    owner: inContext ? 'reconcile' : 'sdk',
    subject: iri,
    detail: `${predicatesPath.slice(4)} registers ${keys.join(', ')}, and no spec ontology declares ${iri} as `
      + `a property${inContext
        ? `, although ${inContexts.join(' and ')} carr${inContexts.length === 1 ? 'ies' : 'y'} it — spec disagrees with itself`
        : ', and no spec context carries it either — spec has never heard of it'}.`,
    specFix: inContext
      ? `Settle which half of spec is right: declare ${iri} in the ontology, or drop it from `
        + `${inContexts.join(' and ')}.`
      : `Stop registering ${iri} in this SDK (and remove the model field that writes it), or take the `
        + 'property to spec.',
    location: [
      predicatesPath,
      ...locations.ontologyOf(iri),
      ...inContexts.map((file) => locations.context(file)),
    ],
  });
}

const recorded = findings.close();

// ── the generated module ─────────────────────────────────────────────────────

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

// Distinct KEYS, from the detector — one entry per conflicted property key,
// so this count is the count the docblock states. The "and N others" clause
// is only appended when there IS an "others", so a corpus with two or fewer
// conflicting keys renders a plain list instead of a negative count.
const conflictedKeys = conflicts.map((c) => c.term);
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

// ── what a person watching the build sees ────────────────────────────────────
//
// Printing stays: every finding above is also in the findings file, but a
// build that went quiet would be one nobody reads.

if (unresolvable.length > 0) {
  console.log(
    `  NOTE: ${unresolvable.length} term(s) skipped, whose value is not an IRI — jayostis/spec#48 `
    + '(term-value-not-iri):\n'
    + unresolvable.map(({ vocabulary, term, id }) => `    ${vocabulary}: ${JSON.stringify(term)} -> ${JSON.stringify(id)}`).join('\n'),
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
    + 'class with any field spec has declared (unclassifiable-range):\n'
    + unclassifiableEntries.map(([range, { specFix }]) => `    ${range}\n      ${specFix}`).join('\n')
    + '\n',
  );
}

if (undeclared.length > 0) {
  console.warn(
    `  NOTE: ${undeclared.length} predicate(s) registered in ${predicatesPath.slice(4)} that no spec `
    + 'ontology declares (declared-predicate-not-in-ontology):\n'
    + undeclared.map(({ iri, inContexts }) => `    ${iri}${inContexts.length > 0 ? ` (in ${inContexts.join(', ')})` : ''}`).join('\n'),
  );
}

console.log(
  `build-terms: ${Object.keys(vocabularies).length} vocabularies, `
  + `${Object.values(vocabularies).reduce((n, t) => n + Object.keys(t).length, 0)} terms, `
  + `${Object.keys(valueSets).length} value sets, ${unclassifiableEntries.length} unclassifiable `
  + `ranges, ${conflictedKeys.length} cross-context conflicts, `
  + `${Math.round(payload.length / 1024)}K -> src/spec/derived/terms.generated.ts; `
  + `${recorded} finding(s) -> src/spec/diagnostics/build-terms.json`,
);
