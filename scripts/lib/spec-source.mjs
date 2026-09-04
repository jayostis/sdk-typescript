/**
 * Two reads every generator over `src/spec/` needs, written once.
 *
 * `scripts/build-terms.mjs` and `scripts/build-record-types.mjs` each carried
 * their own prefix-map scan over `src/spec/contexts` and their own shallow-merge
 * ontology-graph loader over `src/spec/ontologies` — same rule, same strategy,
 * two independent implementations. `scripts/lib/walk.mjs` and
 * `scripts/lib/iri.mjs` already exist to stop exactly this: a fix to the
 * prefix-detection rule or the node-merge strategy had to be found and applied
 * in two places to stay in sync, and nothing forced the second edit.
 *
 * NOT SHARED WITH `src/`, for the reason `scripts/lib/iri.mjs` gives: nothing
 * under `scripts/` ships, so a runtime import of this would put build tooling
 * on the path `tests/no-runtime-deps.test.ts` exists to keep clear.
 *
 * @module scripts/lib/spec-source
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

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
 * The whole shipped ontology graph, as `@id -> node`, merged across every
 * `.jsonld` file under `ontologiesDir`.
 *
 * MERGED ACROSS FILES rather than kept per-file: a subclass chain crosses
 * vocabularies — `clinical:SocialHistoryRecord`'s parent is in `core` — so a
 * per-file read would report a class as unreachable purely because its parent
 * was declared elsewhere. Later files win a shallow-spread conflict on a
 * shared key, which matches what both callers did before this was shared.
 *
 * @param {string} ontologiesDir - Directory of `.jsonld` ontology files.
 * @returns {Map<string, Record<string, unknown>>}
 */
export function mergedOntologyGraph(ontologiesDir) {
  const nodes = new Map();

  for (const file of readdirSync(ontologiesDir).filter((f) => f.endsWith('.jsonld'))) {
    for (const node of JSON.parse(readFileSync(join(ontologiesDir, file), 'utf-8'))) {
      const existing = nodes.get(node['@id']);
      nodes.set(node['@id'], existing ? { ...existing, ...node } : node);
    }
  }

  return nodes;
}
