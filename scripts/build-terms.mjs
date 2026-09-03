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

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONTEXTS = join(root, 'src/spec/contexts');
const ONTOLOGIES = join(root, 'src/spec/ontologies');
const OUT = join(root, 'src/spec-data/terms.generated.ts');

const SUB_CLASS_OF = 'http://www.w3.org/2000/01/rdf-schema#subClassOf';
const RANGE = 'http://www.w3.org/2000/01/rdf-schema#range';
const OWL_CLASS = 'http://www.w3.org/2002/07/owl#Class';

const contextFiles = readdirSync(CONTEXTS).filter((f) => f.endsWith('.jsonld'));

/** A term whose value is a namespace IRI is a prefix declaration, not a term. */
const isPrefixDeclaration = (value) =>
  typeof value === 'string' && /^https?:\/\/.*[#/]$/.test(value);

const prefixes = new Map();

for (const file of contextFiles) {
  const document = JSON.parse(readFileSync(join(CONTEXTS, file), 'utf-8'));
  for (const [term, value] of Object.entries(document['@context'] ?? {})) {
    if (isPrefixDeclaration(value)) prefixes.set(term, value);
  }
}

if (prefixes.size === 0) {
  throw new Error(`no prefix declarations in ${CONTEXTS}; every CURIE would resolve to itself.`);
}

function expand(id) {
  const colon = id.indexOf(':');
  if (colon < 0) return id;
  const namespace = prefixes.get(id.slice(0, colon));
  return namespace ? `${namespace}${id.slice(colon + 1)}` : id;
}

// ── the ontology graph, for ranges and for a range class's members ───────────

const nodes = new Map();

for (const file of readdirSync(ONTOLOGIES).filter((f) => f.endsWith('.jsonld'))) {
  for (const node of JSON.parse(readFileSync(join(ONTOLOGIES, file), 'utf-8'))) {
    nodes.set(node['@id'], { ...(nodes.get(node['@id']) ?? {}), ...node });
  }
}

const rangeOf = (predicate) => nodes.get(predicate)?.[RANGE]?.[0]?.['@id'];

/**
 * The classes a range class admits, by local name.
 *
 * `cascade:dataProvenance` has `rdfs:range cascade:DataProvenance`, and the
 * permitted values are that class's subclasses — `cascade:ClinicalGenerated`
 * and the rest, promoted from individuals to classes in core v3.x. So a bare
 * `"ClinicalGenerated"` under `"@type": "@id"` resolves through the range,
 * which is the fact `jayostis/spec#47` asks a context to state and the ontology
 * already carries.
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
    if (!(node['@type'] ?? []).includes(OWL_CLASS)) continue;
    if (!(node[SUB_CLASS_OF] ?? []).some((parent) => parent['@id'] === rangeIri)) continue;
    members[iri.slice(Math.max(iri.lastIndexOf('#'), iri.lastIndexOf('/')) + 1)] = iri;
  }

  return Object.keys(members).length > 0 ? members : undefined;
}

// ── the per-vocabulary term tables ───────────────────────────────────────────

const vocabularies = {};
const valueSets = {};
const conflicts = [];
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
      if (members) valueSets[range] = members;
    }

    terms[term] = entry;

    const previous = seen.get(term);
    if (previous && previous !== predicate) conflicts.push({ term, a: previous, b: predicate });
    else seen.set(term, predicate);
  }

  vocabularies[vocabulary] = terms;
}

const payload = JSON.stringify({
  vocabularies,
  valueSets,
  // The prefixes the contexts declare, carried so a routed writer can render
  // Turtle rather than N-Triples. `serialize()` is documented as returning a
  // Turtle document, and routing a record type must not change the FORMAT of
  // what a caller gets — only which code produced it.
  prefixes: Object.fromEntries([...prefixes].sort()),
});

const source = `/**
 * GENERATED by \`scripts/build-terms.mjs\`. Do not edit.
 *
 * Per-vocabulary JSON-key→predicate tables, read out of the contexts this
 * package ships, plus the \`rdfs:range\` facts the contexts do not carry.
 *
 * PER VOCABULARY because ${conflicts.length} JSON keys resolve to different predicates in
 * different contexts — \`notes\`, \`status\`, \`severity\` and ${conflicts.length - 3} others. One flat
 * map would pick one silently and write the wrong predicate for every record of
 * the other class. See \`jayostis/spec#4\`.
 *
 * A STRING, PARSED AT LOAD. #76 measured tsc inferring 41,029 types for a
 * comparable object literal; this costs one type and about a millisecond.
 *
 * @module spec-data
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

export interface SpecTerms {
  /** \`vocabulary -> JSON key -> definition\`. */
  readonly vocabularies: Readonly<Record<string, Readonly<Record<string, TermDefinition>>>>;
  /** \`range class IRI -> local name -> member IRI\`, for resolving a bare value. */
  readonly valueSets: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** , as the contexts declare them, for rendering Turtle. */
  readonly prefixes: Readonly<Record<string, string>>;
}

export const SPEC_TERMS: SpecTerms = JSON.parse(
  ${JSON.stringify(payload)},
) as SpecTerms;
`;

writeFileSync(OUT, source, 'utf-8');

console.log(
  `build-terms: ${Object.keys(vocabularies).length} vocabularies, `
  + `${Object.values(vocabularies).reduce((n, t) => n + Object.keys(t).length, 0)} terms, `
  + `${Object.keys(valueSets).length} value sets, ${conflicts.length} cross-context conflicts, `
  + `${Math.round(payload.length / 1024)}K -> src/spec-data/terms.generated.ts`,
);
