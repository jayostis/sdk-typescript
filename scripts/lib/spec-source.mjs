/**
 * Two reads every generator over `src/spec/` needs, written once.
 *
 * `scripts/build-terms.mjs` and `scripts/build-record-types.mjs` each carried
 * their own prefix-map scan over `src/spec/contexts`, their own shallow-merge
 * ontology-graph loader over `src/spec/ontologies`, and their own CURIE-to-IRI
 * expansion over the map the first of those two produces — same rule, same
 * strategy, two (three, counting `expand`) independent implementations.
 * `scripts/lib/walk.mjs` and `scripts/lib/iri.mjs` already exist to stop
 * exactly this: a fix to the prefix-detection rule or the node-merge strategy
 * had to be found and applied in two places to stay in sync, and nothing
 * forced the second edit.
 *
 * NOT SHARED WITH `src/`, for the reason `scripts/lib/iri.mjs` gives: nothing
 * under `scripts/` ships, so a runtime import of this would put build tooling
 * on the path `tests/no-runtime-deps.test.ts` exists to keep clear.
 *
 * @module scripts/lib/spec-source
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** A term whose value is a namespace IRI is a prefix declaration, not a term. */
export function isPrefixDeclaration(value) {
  return typeof value === 'string' && /^https?:\/\/.*[#/]$/.test(value);
}

/**
 * `prefix -> namespace`, read out of every `@context` under `contextsDir`.
 *
 * A JSON-LD context declares its own prefixes as ordinary terms whose value is
 * an IRI — `"clinical": "https://ns.cascadeprotocol.org/clinical/v1#"` — so the
 * map every CURIE in that context needs is published in the same file that uses
 * them, and reading it here is the alternative to transcribing it by hand.
 *
 * Returns an empty map rather than throwing when nothing is found — the two
 * callers want different wording for that failure (one names the empty result
 * as "every CURIE would resolve to itself", the other spells out what an
 * unresolved class IRI does downstream), so raising it is theirs to do.
 *
 * @param {string} contextsDir - Directory of `.jsonld` context files.
 * @returns {Map<string, string>}
 */
export function contextPrefixes(contextsDir) {
  const prefixes = new Map();

  for (const file of readdirSync(contextsDir).filter((f) => f.endsWith('.jsonld'))) {
    const document = JSON.parse(readFileSync(join(contextsDir, file), 'utf-8'));

    for (const [term, value] of Object.entries(document['@context'] ?? {})) {
      if (isPrefixDeclaration(value)) prefixes.set(term, value);
    }
  }

  return prefixes;
}

/**
 * A CURIE resolved against `prefixes`, or itself unchanged if it has no
 * resolvable prefix — no colon at all, a leading colon (an empty prefix
 * nothing declares), or a prefix `prefixes` does not carry.
 *
 * @param {Map<string, string>} prefixes - `prefix -> namespace`, as from
 *   {@link contextPrefixes}.
 * @param {string} id - A CURIE (`clinical:Medication`) or an already-full IRI.
 * @returns {string}
 */
export function expandCurie(prefixes, id) {
  const colon = id.indexOf(':');
  if (colon <= 0) return id;
  const namespace = prefixes.get(id.slice(0, colon));
  return namespace ? `${namespace}${id.slice(colon + 1)}` : id;
}

/**
 * Two nodes for the same `@id`, combined so an array-valued predicate keeps
 * both sides' entries rather than losing one wholesale.
 *
 * A shallow `{ ...existing, ...node }` replaces `existing[key]` outright for
 * any key `node` also carries — correct for a scalar, wrong for an array like
 * `@type`: if the same class `@id` is ever declared across two files, each
 * contributing part of its `@type` array, the file merged second would
 * silently drop whichever markers the first file alone carried, including
 * `cascade:RecordClass`, which record-type population reads off `@type`.
 * Concatenating and deduping keeps both files' entries regardless of which is
 * merged first.
 *
 * @param {Record<string, unknown>} existing
 * @param {Record<string, unknown>} node
 * @returns {Record<string, unknown>}
 */
function mergeNode(existing, node) {
  const merged = { ...existing, ...node };
  for (const key of Object.keys(node)) {
    if (Array.isArray(existing[key]) && Array.isArray(node[key])) {
      merged[key] = [...new Set([...existing[key], ...node[key]])];
    }
  }
  return merged;
}

/**
 * The whole shipped ontology graph, as `@id -> node`, merged across every
 * `.jsonld` file under `ontologiesDir`.
 *
 * MERGED ACROSS FILES rather than kept per-file: a subclass chain crosses
 * vocabularies — `clinical:SocialHistoryRecord`'s parent is in `core` — so a
 * per-file read would report a class as unreachable purely because its parent
 * was declared elsewhere. A shared key's array values are merged via
 * {@link mergeNode} rather than replaced; a shared scalar key still has the
 * later file win, which matches what both callers did before this was shared.
 *
 * @param {string} ontologiesDir - Directory of `.jsonld` ontology files.
 * @returns {Map<string, Record<string, unknown>>}
 */
export function mergedOntologyGraph(ontologiesDir) {
  const nodes = new Map();

  for (const file of readdirSync(ontologiesDir).filter((f) => f.endsWith('.jsonld'))) {
    for (const node of JSON.parse(readFileSync(join(ontologiesDir, file), 'utf-8'))) {
      const existing = nodes.get(node['@id']);
      nodes.set(node['@id'], existing ? mergeNode(existing, node) : node);
    }
  }

  return nodes;
}

/**
 * Where the generated spec data lives: `src/spec/` under `root`, or the
 * directory `CASCADE_SPEC_DATA_DIR` names when it is set.
 *
 * THE OVERRIDE EXISTS FOR TESTS, and for nothing else. A generator that can
 * only read and write the real tree cannot be handed a fixture — and a
 * detector is proven by making it speak (`tests/README.md`), which the pinned
 * spec mostly cannot be made to do. `build-spec-data.mjs` also EMPTIES its
 * output directories before writing, so a generator pointed at the tree from a
 * vitest worker would race every sibling test reading it. Every test that runs
 * a generator therefore sets this, and none of them ever leaves it unset.
 *
 * @param {string} root - The repository root.
 * @returns {string}
 */
export function specDataDir(root) {
  const override = process.env.CASCADE_SPEC_DATA_DIR;
  return override ? resolve(override) : join(root, 'src/spec');
}

/**
 * The layout of the generated data directory, spelled once.
 *
 * THIS SDK'S OWN LAYOUT, NOT SPEC'S. `ontologies/`, `shapes/` and `contexts/`
 * here are where `scripts/build-spec-data.mjs` WRITES its conversion of spec,
 * and the other two are what the later generators derive from that — none of them is
 * a path into a spec checkout, which only `spec-sources.json` names. Spelled
 * in one function so the five scripts that share the directory cannot drift
 * on a segment, and so `tests/spec-single-source.test.ts` — which reports a
 * bare `ontologies` literal as a self-resolved spec path — has one file to
 * spare with the reason written beside it, rather than four.
 *
 * @param {string} root - The repository root.
 * @returns {{ data: string, ontologies: string, shapes: string, contexts: string, derived: string, diagnostics: string }}
 */
export function specDataLayout(root) {
  const data = specDataDir(root);
  return {
    data,
    ontologies: join(data, 'ontologies'),
    shapes: join(data, 'shapes'),
    contexts: join(data, 'contexts'),
    derived: join(data, 'derived'),
    diagnostics: join(data, 'diagnostics'),
  };
}
