/**
 * Which file to open for an IRI, as a `<repo>:<path>` string.
 *
 * WHY. Every finding carries a `location`, and the test each row has to pass
 * is "a spec maintainer receives this pasted into an issue with no other
 * context — do they know which file to open?" The information is available
 * at emission time: `src/spec/ontologies/<vocabulary>.jsonld` is built from
 * the Turtle file `spec-sources.json` names for that vocabulary, and a node
 * came from one of those files. This maps the one to the other.
 *
 * DERIVED FROM THE DATA, not from the shape of the IRI. An IRI with no node
 * — a predicate this SDK registers and spec never declared — is placed by
 * its namespace, and the namespace-to-file map comes from the `owl:Ontology`
 * node every vocabulary declares for its own namespace, not from a regex over
 * `/<vocab>/v1#` (the assumption `scripts/lib/iri.mjs` replaced).
 *
 * @module scripts/lib/spec-locations
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { namespaceOf } from './iri.mjs';

const OWL_ONTOLOGY = 'http://www.w3.org/2002/07/owl#Ontology';

/** The repository root, for `sdk:` paths relative to it. */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * A locator over the ontology files under `ontologiesDir`.
 *
 * @param {string} ontologiesDir - Directory of `<vocabulary>.jsonld` files.
 * @param {Record<string, { ontology: string, shapes?: string }>} manifest -
 *   `spec-sources.json`, for the Turtle path each vocabulary was built from.
 * @returns {{
 *   ontologyOf(iri: string): string[],
 *   shapesOf(iri: string): string[],
 *   vocabulariesOf(iri: string): string[],
 *   context(file: string): string,
 * }}
 */
export function specLocations(ontologiesDir, manifest) {
  /** @type {Map<string, Set<string>>} iri -> the vocabularies whose file declares it */
  const declaredIn = new Map();
  /** @type {Map<string, string>} namespace -> the vocabulary declaring it as owl:Ontology */
  const namespaceVocabulary = new Map();

  for (const file of readdirSync(ontologiesDir).filter((f) => f.endsWith('.jsonld')).sort()) {
    const vocabulary = file.replace(/\.jsonld$/, '');

    for (const node of JSON.parse(readFileSync(join(ontologiesDir, file), 'utf-8'))) {
      (declaredIn.get(node['@id']) ?? declaredIn.set(node['@id'], new Set()).get(node['@id'])).add(vocabulary);
      if ((node['@type'] ?? []).includes(OWL_ONTOLOGY)) namespaceVocabulary.set(node['@id'], vocabulary);
    }
  }

  const vocabulariesOf = (iri) => {
    const direct = declaredIn.get(iri);
    if (direct) return [...direct].sort();
    const byNamespace = namespaceVocabulary.get(namespaceOf(iri));
    return byNamespace ? [byNamespace] : [];
  };

  // The Turtle the artifact was built from, where the manifest names it; the
  // artifact that was actually read otherwise — a vocabulary the manifest
  // does not know is a fixture, and the file it came from is the honest answer.
  const ontologyPath = (vocabulary) =>
    (manifest[vocabulary]?.ontology
      ? `spec:${manifest[vocabulary].ontology}`
      : `sdk:${relative(root, join(ontologiesDir, `${vocabulary}.jsonld`)).split(sep).join('/')}`);

  return {
    vocabulariesOf,
    ontologyOf: (iri) => vocabulariesOf(iri).map(ontologyPath),
    shapesOf: (iri) => vocabulariesOf(iri)
      .filter((vocabulary) => manifest[vocabulary]?.shapes)
      .map((vocabulary) => `spec:${manifest[vocabulary].shapes}`),
    context: (file) => `spec:contexts/v1/${file.endsWith('.jsonld') ? file : `${file}.jsonld`}`,
  };
}
