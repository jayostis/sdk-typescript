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
 * loads. `jayostis/spec#50` added it and `conformance/scripts/SPEC_PIN` names
 * that revision, so the marker is now the only rule: the PROV bridge, the
 * `pending-spec-50.json` list that patched its blind spots, and the comparison
 * between the two rules were deleted together once the pin moved.
 *
 * THE RULE LIVES IN `scripts/lib/record-population.mjs`, which refuses a graph
 * that marks nothing rather than emitting an empty table.
 *
 * THE NAME IS THE PUBLISHED CONTEXT TERM, falling back to the local name. A
 * context is a name→IRI mapping and that is the whole of its job, so where spec
 * publishes a name for a class, that name wins. Nine record classes are named
 * by no context (spec#50 gap 3a); their local name is used, and for all nine it
 * is the name this SDK already used.
 *
 * A NAME TWO CLASSES CLAIM IS WRITTEN OUT, NOT REFUSED. Spec publishes
 * `SocialHistoryRecord` for a `clinical:` class and a `health:` one, and a
 * context key is unique, so one of the two can have no published name however
 * good the data is (spec#50 gap 3c). This warns and emits the collision as
 * `NAME_COLLISIONS` rather than declining to write the table: refusing would
 * stop every uncontested class over one contested name, which is the same
 * objection as taking the whole package down at import and one stage earlier
 * (#89). `src/record-types/index.ts` settles what it can from
 * `overrides.ts` and defers the rest to `recordTypeFor`, which throws on the
 * ambiguous name alone.
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { duplicateNamesAmong } from './lib/duplicate-names.mjs';
import { localNameOf } from './lib/iri.mjs';
import { recordPopulation } from './lib/record-population.mjs';
import { contextPrefixes, mergedOntologyGraph } from './lib/spec-source.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ONTOLOGIES = join(root, 'src/spec/ontologies');
const CONTEXTS = join(root, 'src/spec/contexts');
const OUT = join(root, 'src/spec/derived/record-types.generated.ts');

const SEE_ALSO = 'http://www.w3.org/2000/01/rdf-schema#seeAlso';
const DEPRECATED = 'http://www.w3.org/2002/07/owl#deprecated';

// Prefix -> namespace, read out of the contexts rather than written here, and
// shared with `scripts/build-terms.mjs` via `scripts/lib/spec-source.mjs` —
// the two scripts used to carry independent copies of this scan.
const NAMESPACES = contextPrefixes(CONTEXTS);

if (NAMESPACES.size === 0) {
  throw new Error(
    `no prefix declarations in ${CONTEXTS}. Every CURIE in every context would then resolve `
    + 'to itself, and a record type whose class IRI is the string "clinical:Medication" '
    + 'matches no rdf:type in any pod — an absence that reads as an answer.',
  );
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

const contextNames = publishedNames();

const nodes = mergedOntologyGraph(ONTOLOGIES);

const derived = [];

const population = recordPopulation(nodes);

for (const [iri, node] of nodes) {
  const deprecated = Boolean(node[DEPRECATED]);

  if (!population.classes.has(iri) || deprecated) continue;

  const localName = localNameOf(iri);
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
// READ, so each is attached to the class that superseded it. All five carry a
// correct `rdfs:seeAlso` as of the pinned revision: `clinical:CoverageRecord`
// used to point at `fhir:Coverage` alone, which is why
// `src/record-types/overrides.ts` declared that one link by hand, and
// `jayostis/spec#50` gap 2 states it in a triple now. The override went with
// the pin.
const byIri = new Map(derived.map((entry) => [entry.iri, entry]));

for (const [iri, node] of nodes) {
  if (!node[DEPRECATED]) continue;

  for (const { '@id': target } of node[SEE_ALSO] ?? []) {
    const superseding = target && byIri.get(target);
    if (superseding) superseding.supersedes.push(iri);
  }
}

derived.sort((a, b) => a.name.localeCompare(b.name));

// The rows the table will carry, named once. The collision check below and the
// emit below that must see exactly the same set: a check run over rows the
// table does not ship would report a collision nothing can hit, and — worse —
// a row shipped without being checked is a contested name reaching
// `recordTypeFor` with nothing having said so.
const live = derived.filter((entry) => !entry.deprecated);

// CHECKED HERE AS WELL AS AT ASSEMBLY, and the two answer different questions.
// This one is about spec: which names spec publishes for more than one class,
// before this SDK's overrides have said anything. `assembleRecordTypes` asks
// which names are STILL contested once `src/record-types/overrides.ts` has
// spoken, and that is the one a lookup obeys. Emitting this one is what lets a
// worklist see the upstream defect at all — an override that resolves a
// collision also hides it, and a gap nothing reports is a gap nobody fixes.
const collisions = duplicateNamesAmong(live, (entry) => entry.name, (entry) => entry.iri);

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
  ' * `cascade:RecordClass` is the marker jayostis/spec#50 added, replacing a',
  ' * reading of `rdfs:subClassOf prov:Entity` that ASK-05 ruled out as PROV-O',
  ' * alignment. It is the only rule: the bridge and its pending list went when',
  ' * conformance/scripts/SPEC_PIN moved to the revision carrying the marker.',
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
      live.map(({ iri, name, localName, supersedes }) => ({ iri, name, localName, supersedes: supersedes.sort() })),
      null,
      2,
    )
  } as const;`,
  '',
  '/** One JSON name that more than one class above claims. */',
  'export interface NameCollision {',
  '  /** The contested name. */',
  '  readonly name: string;',
  '  /** The class IRIs that claim it, in the order the table lists them. */',
  '  readonly claimants: readonly string[];',
  '}',
  '',
  '/**',
  ' * Every name spec publishes for more than one record class.',
  ' *',
  " * WHAT SPEC SAYS, NOT WHAT THIS SDK RESOLVES. A JSON-LD context key is",
  ' * unique, so two classes wanting one name is a gap upstream rather than a',
  ' * choice anything here can make well. `src/record-types/overrides.ts` names',
  ' * which spelling each such class returns, and once it has, the name is not',
  ' * contested any more — which is exactly why this list is emitted: an override',
  ' * that settles a collision also conceals it, and a worklist that cannot see',
  ' * the upstream defect never gets it fixed.',
  ' *',
  ' * A name left here with no override is not silently picked. It resolves to',
  ' * nothing, `recordTypeFor` throws naming both classes, and every other record',
  ' * type is unaffected.',
  ' */',
  `export const NAME_COLLISIONS: readonly NameCollision[] = ${
    JSON.stringify(collisions, null, 2)
  } as const;`,
  '',
].join('\n');

// The directory is not in git: everything under `src/spec/` is generated and
// ignored, and git does not track an empty directory, so a clean clone has no
// `src/spec/derived/` to write into.
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, banner, 'utf-8');

// WRITTEN ANYWAY, AND SAID OUT LOUD. A refusal here would stop every
// uncontested class over one ambiguous name — the same cost as throwing at
// import, paid one stage earlier — so the table ships with the collision in it
// as `NAME_COLLISIONS`. What must not happen is the collision passing
// unremarked: an override that resolves one also hides it, and a build that
// printed nothing would let a name spec publishes twice look settled.
if (collisions.length > 0) {
  console.warn(
    `\n  NOTE: spec publishes ${collisions.length} name(s) for more than one record class:\n`
    + collisions.map(({ name, claimants }) => `    "${name}" by ${claimants.join(' and ')}`).join('\n')
    + '\n  The table carries them as NAME_COLLISIONS. Each needs a NAME_OVERRIDES entry in '
    + 'src/record-types/overrides.ts saying which spelling each class returns; until one has, '
    + 'recordTypeFor("<name>") throws naming both classes rather than picking, and every other '
    + 'record type resolves normally. A context key is unique upstream too, so a collision that '
    + 'is not ours to settle is a spec issue — see jayostis/spec#50 gap 3c.\n',
  );
}

console.log(
  `build-record-types: ${live.length} record classes by ${population.rule}, `
  + `${collisions.length} contested name(s) -> src/spec/derived/record-types.generated.ts`,
);
