/**
 * Derive the record-type table from the spec data, and emit it as TypeScript.
 *
 * READS WHAT WE SHIP, not the checkout. `scripts/build-spec-data.mjs` converts
 * `spec` to JSON-LD under `src/spec/`; this reads that. So the artifact is
 * exercised by the build that produces it rather than merely being present, and
 * a conversion that lost something fails here rather than in a consumer.
 *
 * EMITS `.ts`, NOT read at runtime. `src/` cannot open a file — a consumer
 * installs `dist` and every bundler resolves statically — and importing the
 * JSON would make tsc infer a structural type for all 5,029 quads (#76
 * measured 32,502 types for a comparable payload). A generated module costs
 * neither, and `src/spec/` still ships for the engine in #78/#79/#80 to read.
 *
 * THE POPULATION IS SPEC'S RULE, not ours. A class whose `rdfs:subClassOf`
 * chain reaches `prov:Entity` or `prov:Activity` holds record data — the rule
 * `spec/scripts/check-class-coverage.py` enforces, and the only machine-readable
 * statement anywhere that a class carries stored records. Twelve classes this
 * SDK registers are not yet reached by it; they are declared in
 * `src/record-types/pending-spec-50.json` with the issue that deletes them.
 *
 * THE NAME IS THE PUBLISHED CONTEXT TERM, falling back to the local name. A
 * context is a name→IRI mapping and that is the whole of its job, so where spec
 * publishes a name for a class, that name wins. Nine record classes are named
 * by no context (spec#50 gap 3a); their local name is used, and for all nine it
 * is the name this SDK already used.
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ONTOLOGIES = join(root, 'src/spec/ontologies');
const CONTEXTS = join(root, 'src/spec/contexts');
const OUT = join(root, 'src/record-types/generated.ts');

const OWL_CLASS = 'http://www.w3.org/2002/07/owl#Class';
const SUB_CLASS_OF = 'http://www.w3.org/2000/01/rdf-schema#subClassOf';
const SEE_ALSO = 'http://www.w3.org/2000/01/rdf-schema#seeAlso';
const DEPRECATED = 'http://www.w3.org/2002/07/owl#deprecated';
const RECORD_ROOTS = new Set([
  'http://www.w3.org/ns/prov#Entity',
  'http://www.w3.org/ns/prov#Activity',
]);

/**
 * Prefix → namespace, read out of the contexts rather than written here.
 *
 * A JSON-LD context declares its own prefixes as ordinary terms whose value is
 * an IRI — `"clinical": "https://ns.cascadeprotocol.org/clinical/v1#"` — so the
 * map a context's CURIEs need is published in the same file that uses them. A
 * hand-written copy would be one more transcription of a spec fact, in the
 * script whose whole purpose is to stop transcribing them.
 */
function prefixes() {
  const map = new Map();

  for (const file of readdirSync(CONTEXTS).filter((f) => f.endsWith('.jsonld'))) {
    const document = JSON.parse(readFileSync(join(CONTEXTS, file), 'utf-8'));

    for (const [term, value] of Object.entries(document['@context'] ?? document)) {
      // A prefix declaration is a term whose value is an absolute IRI ending in
      // a delimiter. A term mapping to a full IRI that does NOT end in one is
      // naming a single thing, not a namespace.
      if (typeof value === 'string' && /^https?:\/\/.*[#/]$/.test(value)) map.set(term, value);
    }
  }

  if (map.size === 0) {
    throw new Error(
      `no prefix declarations in ${CONTEXTS}. Every CURIE in every context would then resolve `
      + 'to itself, and a record type whose class IRI is the string "clinical:Medication" '
      + 'matches no rdf:type in any pod — an absence that reads as an answer.',
    );
  }

  return map;
}

const NAMESPACES = prefixes();

/** The whole shipped graph, as `iri -> node`. */
function graph() {
  const nodes = new Map();

  for (const file of readdirSync(ONTOLOGIES).filter((f) => f.endsWith('.jsonld'))) {
    for (const node of JSON.parse(readFileSync(join(ONTOLOGIES, file), 'utf-8'))) {
      // Merged across files rather than kept per-vocabulary: a subclass chain
      // crosses vocabularies — clinical:SocialHistoryRecord's parent is in core
      // — so a per-file walk would report a class as unreachable purely because
      // its parent was declared elsewhere.
      const existing = nodes.get(node['@id']);
      nodes.set(node['@id'], existing ? { ...existing, ...node } : node);
    }
  }

  return nodes;
}

/** `class IRI -> the JSON names the contexts publish for it`. */
function publishedNames() {
  const names = new Map();

  for (const file of readdirSync(CONTEXTS).filter((f) => f.endsWith('.jsonld'))) {
    const document = JSON.parse(readFileSync(join(CONTEXTS, file), 'utf-8'));

    for (const [term, value] of Object.entries(document['@context'] ?? document)) {
      const id = typeof value === 'string' ? value : value?.['@id'];
      if (typeof id !== 'string') continue;

      const colon = id.indexOf(':');
      const namespace = colon > 0 ? NAMESPACES.get(id.slice(0, colon)) : undefined;
      const iri = namespace ? `${namespace}${id.slice(colon + 1)}` : id;

      names.set(iri, [...(names.get(iri) ?? []), term]);
    }
  }

  return names;
}

const nodes = graph();
const parentsOf = (iri) => (nodes.get(iri)?.[SUB_CLASS_OF] ?? []).map((v) => v['@id']).filter(Boolean);

/**
 * Does this class's superclass chain reach a PROV root?
 *
 * `seen` is not defensiveness about spec: `owl:equivalentClass` cycles and
 * mutual subclass axioms are expressible, and a walk without it never returns.
 */
function bearsRecords(iri, seen = new Set()) {
  if (seen.has(iri)) return false;
  seen.add(iri);
  return parentsOf(iri).some((parent) => RECORD_ROOTS.has(parent) || bearsRecords(parent, seen));
}

const pending = JSON.parse(readFileSync(join(root, 'src/record-types/pending-spec-50.json'), 'utf-8'));
const pendingClasses = new Set(pending.entries.map((entry) => entry.class));
const contextNames = publishedNames();

const derived = [];
const wrongly = [];

for (const [iri, node] of nodes) {
  const isClass = (node['@type'] ?? []).includes(OWL_CLASS);
  const deprecated = Boolean(node[DEPRECATED]);
  const pendingHere = pendingClasses.has(iri);

  if (!pendingHere && (!isClass || deprecated || !bearsRecords(iri))) continue;

  // A pending entry that the rule NOW reaches is a spec fix that landed, and
  // the entry has to go. Reported rather than silently absorbed, because an
  // exception list that quietly stops being needed is how a workaround becomes
  // permanent.
  if (pendingHere && isClass && !deprecated && bearsRecords(iri)) wrongly.push(iri);

  const localName = iri.slice(Math.max(iri.lastIndexOf('#'), iri.lastIndexOf('/')) + 1);
  const published = contextNames.get(iri) ?? [];

  derived.push({
    iri,
    // The shortest published term, so `Medication` beats a longer synonym; the
    // local name when spec publishes none.
    name: published.length > 0 ? [...published].sort((a, b) => a.length - b.length || a.localeCompare(b))[0] : localName,
    localName,
    deprecated,
    supersedes: [],
  });
}

// Deprecated classes are not record types — nothing writes one — but they are
// READ, so each is attached to the class that superseded it. Four of the five
// carry a correct `rdfs:seeAlso`; `clinical:CoverageRecord` points at
// `fhir:Coverage` instead, which is spec#50 gap 2 and stays declared in
// `src/record-types/overrides.ts` until spec states it in a triple.
const byIri = new Map(derived.map((entry) => [entry.iri, entry]));

for (const [iri, node] of nodes) {
  if (!node[DEPRECATED]) continue;

  for (const { '@id': target } of node[SEE_ALSO] ?? []) {
    const superseding = target && byIri.get(target);
    if (superseding) superseding.supersedes.push(iri);
  }
}

derived.sort((a, b) => a.name.localeCompare(b.name));

const banner = [
  '/**',
  ' * GENERATED by `scripts/build-record-types.mjs`. Do not edit.',
  ' *',
  ' * Every class spec says holds record data, with the JSON name spec publishes',
  ` * for it. Derived from \`src/spec/\`, which is itself built from the checkout —`,
  ' * so nothing here is transcribed and a change upstream arrives as a build',
  ' * diff rather than as a silent disagreement.',
  ' *',
  ' * The population is spec\'s own rule: an `rdfs:subClassOf` chain reaching',
  ' * `prov:Entity` or `prov:Activity`. The twelve classes it does not yet reach',
  ' * are declared in `src/record-types/pending-spec-50.json` with the issue that',
  ' * deletes them.',
  ' *',
  ' * @module record-types',
  ' */',
  '',
  '/** One class spec declares as holding record data. */',
  'export interface DerivedClass {',
  '  /** The class IRI. */',
  '  readonly iri: string;',
  '  /** The JSON name spec publishes, or the local name where it publishes none. */',
  '  readonly name: string;',
  '  /** The local name, always. */',
  '  readonly localName: string;',
  '  /** Deprecated class IRIs that `rdfs:seeAlso` says this one superseded. */',
  '  readonly supersedes: readonly string[];',
  '}',
  '',
  `export const DERIVED_CLASSES: readonly DerivedClass[] = ${
    JSON.stringify(
      derived.filter((entry) => !entry.deprecated)
        .map(({ iri, name, localName, supersedes }) => ({ iri, name, localName, supersedes: supersedes.sort() })),
      null,
      2,
    )
  } as const;`,
  '',
].join('\n');

writeFileSync(OUT, banner, 'utf-8');

if (wrongly.length > 0) {
  console.warn(
    `\n  NOTE: ${wrongly.length} entr${wrongly.length === 1 ? 'y' : 'ies'} in `
    + 'pending-spec-50.json no longer needed — spec now reaches:\n'
    + wrongly.map((iri) => `    ${iri}`).join('\n')
    + '\n  Delete them; tests/record-types/derivation.test.ts asserts this too.\n',
  );
}

console.log(
  `build-record-types: ${derived.filter((e) => !e.deprecated).length} record classes `
  + `(${pending.entries.length} pending spec#50) -> src/record-types/generated.ts`,
);
