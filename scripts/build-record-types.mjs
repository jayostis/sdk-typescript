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
 * THE POPULATION IS SPEC'S, not ours — but which rule states it changed under
 * this script. It read `rdfs:subClassOf prov:Entity`, and `jayostis/spec#34`
 * (ASK-05) ruled that reading out: the axiom is PROV-O alignment and confers no
 * membership, "never on `prov:Entity`, which will keep catching alignment
 * axioms". Measured on spec's main, 110 classes were in that population and 96
 * of them were alignment axioms.
 *
 * The replacement is `cascade:RecordClass`, a marker carried directly by the
 * classes that hold record data — the explicit list the ruling calls for, put
 * in the ontologies so a consumer derives it from the artifact it already
 * loads. `jayostis/spec#50` adds it and is not yet pinned, so this falls back
 * to the old chain plus `src/record-types/pending-spec-50.json` and says so on
 * every build. See {@link recordClasses}.
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
const RECORD_CLASS = 'https://ns.cascadeprotocol.org/core/v1#RecordClass';

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

const pending = JSON.parse(readFileSync(join(root, 'src/record-types/pending-spec-50.json'), 'utf-8'));
const pendingClasses = new Set(pending.entries.map((entry) => entry.class));
const contextNames = publishedNames();

const nodes = graph();
const parentsOf = (iri) => (nodes.get(iri)?.[SUB_CLASS_OF] ?? []).map((v) => v['@id']).filter(Boolean);

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
 * {@link recordClasses}. A build against a checkout that carries
 * `cascade:RecordClass` never calls this.
 *
 * `seen` is not defensiveness about spec: `owl:equivalentClass` cycles and
 * mutual subclass axioms are expressible, and a walk without it never returns.
 */
function bearsRecords(iri, seen = new Set()) {
  if (seen.has(iri)) return false;
  seen.add(iri);
  return parentsOf(iri).some((parent) => RECORD_ROOTS.has(parent) || bearsRecords(parent, seen));
}

/**
 * Which classes hold record data, by the rule the checkout supports.
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
 */
function recordClasses() {
  const marked = [...nodes]
    .filter(([, node]) => (node['@type'] ?? []).includes(RECORD_CLASS))
    .map(([iri]) => iri);

  if (marked.length > 0) return { rule: 'cascade:RecordClass', classes: new Set(marked) };

  const bridged = [...nodes]
    .filter(([iri, node]) => (node['@type'] ?? []).includes(OWL_CLASS) && bearsRecords(iri))
    .map(([iri]) => iri);

  return {
    rule: 'prov chain + pending-spec-50.json (spec#50 not yet pinned)',
    classes: new Set([...bridged, ...pendingClasses]),
  };
}

const derived = [];
const wrongly = [];

const population = recordClasses();

for (const [iri, node] of nodes) {
  const deprecated = Boolean(node[DEPRECATED]);

  if (!population.classes.has(iri) || deprecated) continue;

  // A pending entry the population now reaches on its own has outlived its
  // cause. Reported rather than silently absorbed, because an exception list
  // that quietly stops being needed is how a workaround becomes permanent.
  if (population.rule === 'cascade:RecordClass' && pendingClasses.has(iri)) wrongly.push(iri);

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
  ` * The population is spec's, by ${population.rule}.`,
  ' *',
  ' * `cascade:RecordClass` is the marker jayostis/spec#50 adds, replacing a',
  ' * reading of `rdfs:subClassOf prov:Entity` that ASK-05 ruled out as PROV-O',
  ' * alignment. Until that is pinned, the old chain plus',
  ' * `src/record-types/pending-spec-50.json` stands in.',
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
  + `by ${population.rule} -> src/record-types/generated.ts`,
);
