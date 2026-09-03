/**
 * A Cascade record to RDF, from spec's published data and nothing else.
 *
 * NO MODELS, NO TERM MODULES, NO PREDICATE TABLE. Every fact this reads comes
 * from `src/spec-data/terms.generated.ts` and `src/record-types/generated.ts`,
 * both built from the contexts and ontologies this package ships. It is the
 * generic writer #69 exists to build, at the size #80 predicted, and it is
 * routed to one record type at a time through `src/migration/`.
 *
 * WHAT IT IS NOT. `src/serializer/turtle-serializer.ts` stays exactly as it is
 * and remains the path for every unrouted type. This is a REPLACEMENT for the
 * types on the list, never a supplement — running both would write every triple
 * twice.
 *
 * THREE SOURCES, IN ORDER, and the order is the whole design:
 *
 * 1. **The context's `@type`.** Spec's published statement of what a key's
 *    value is. Authoritative where present.
 * 2. **The ontology's `rdfs:range`**, where the context is silent. This is what
 *    makes the slice correct rather than nearly correct:
 *    `../spec/contexts/v1/health.jsonld` gives `administrationDate` no `@type`,
 *    so a converter reading the context alone writes an untyped literal and
 *    `health:ImmunizationRecordShape` rejects it — with a message that
 *    anticipates it word for word. The ontology has said `xsd:dateTime` all
 *    along. That gap is `jayostis/spec#46`; reading the ontology does not
 *    excuse it, it routes around it.
 * 3. **The JavaScript value**, last. A number is an integer or a double, a
 *    boolean is a boolean, everything else is a plain literal.
 *
 * @module converter
 */

import { createRequire } from 'node:module';

import { recordTypeFor } from '../record-types/index.js';
import { SPEC_TERMS } from '../spec-data/terms.generated.js';
import type { TermDefinition } from '../spec-data/terms.generated.js';

const require = createRequire(import.meta.url);

/* eslint-disable @typescript-eslint/no-explicit-any */
const N3Parser = require('../vendor/n3/N3Parser.js').default as new () => {
  parse(input: string): any[];
};
const N3Writer = require('../vendor/n3/N3Writer.js').default as new (options: {
  prefixes: Record<string, string>;
}) => { addQuad(quad: unknown): void; end(callback: (error: unknown, result: string) => void): void };

const XSD = 'http://www.w3.org/2001/XMLSchema#';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

/** Keys that name the record rather than describing it. */
const STRUCTURAL = new Set(['id', 'type']);

/**
 * Which context stack a record's keys resolve against.
 *
 * `core` plus the vocabulary that declares the record's class. Thirty-four JSON
 * keys mean different predicates in different contexts — `notes` is
 * `clinical:notes` under `clinical` and `health:notes` under `health` — so
 * resolving against a merged context would silently write one of them for both.
 *
 * The vocabulary comes from the CLASS, not from a parameter. The thin slice
 * took it as an argument and read it off the fixture, which meant the converter
 * could not be called with a record alone. `recordTypeFor` answers it now, and
 * a namespace is what a class IRI already carries.
 */
function vocabularyOf(classIri: string): string {
  const match = /\/([a-z]+)\/v\d+#/.exec(classIri);
  const vocabulary = match?.[1];

  // `core`'s namespace segment is `core` and its context is published under
  // both `core.jsonld` and `cascade.jsonld`; `core` is the narrower of the two
  // and the one whose terms are core's own.
  return vocabulary && vocabulary in SPEC_TERMS.vocabularies ? vocabulary : 'core';
}

const TERMS_BY_VOCABULARY = new Map<string, Record<string, TermDefinition>>();

/**
 * The definitions a record of this class resolves its keys against.
 *
 * MEMOISED PER VOCABULARY, because the merge is not free and the answer never
 * changes: there are seven vocabularies and the tables are generated. Built
 * fresh per call, this spread roughly 800 definitions into a new object for
 * every record — measured at about half the total cost of a conversion, doing
 * work whose result was identical every time.
 */
function termsFor(classIri: string): Record<string, TermDefinition> {
  const vocabulary = vocabularyOf(classIri);
  const cached = TERMS_BY_VOCABULARY.get(vocabulary);
  if (cached) return cached;

  // The record's own vocabulary wins where both declare a key, which is the
  // point of resolving per class: a `health:` record's `notes` is
  // `health:notes`, and `core`'s entry must not shadow it.
  const merged = {
    ...SPEC_TERMS.vocabularies['core'],
    ...SPEC_TERMS.vocabularies[vocabulary],
  };

  TERMS_BY_VOCABULARY.set(vocabulary, merged);
  return merged;
}

/** A literal, escaped for N-Triples. */
const literal = (value: string, datatype?: string): string =>
  `${JSON.stringify(value)}${datatype ? `^^<${datatype}>` : ''}`;

/**
 * One value, as an N-Triples object term.
 *
 * Returns `null` for a value with no expressible form, which the caller turns
 * into a throw naming the field. Faithful first: this writes every value it is
 * handed and drops none on validity grounds — a shape can only judge what
 * reached the graph, and a writer that quietly kept the first of two values
 * hands the validator a record with nothing left to violate.
 */
function objectTerm(value: unknown, definition: TermDefinition): string | null {
  if (value === null || value === undefined) return null;

  // 1 — the context says it is an IRI.
  if (definition.type === '@id') {
    const text = String(value);

    // A bare token under `"@type": "@id"` has no resolution rule in any context
    // — no context declares `@vocab`, and 85 of 92 fixtures write one
    // (`jayostis/spec#47`). The ontology resolves it: the predicate's range is a
    // class whose subclasses ARE the permitted values, so `"ClinicalGenerated"`
    // is `cascade:ClinicalGenerated` and nothing else.
    if (!/^https?:\/\//.test(text)) {
      const members = definition.range ? SPEC_TERMS.valueSets[definition.range] : undefined;
      const resolved = members?.[text.includes(':') ? text.slice(text.indexOf(':') + 1) : text];

      return resolved ? `<${resolved}>` : null;
    }

    return `<${text}>`;
  }

  // 2 — the context, then the ontology, says what kind of literal it is.
  const datatype = definition.type ?? definition.range;

  // `xsd:string` is written as a PLAIN literal. In RDF 1.1 the two are the same
  // term, so the graph is identical either way — but every string field in the
  // corpus would otherwise carry an explicit datatype the hand-rolled writer
  // never wrote, and a diff nobody can act on is worse than no diff.
  if (datatype === `${XSD}string`) return literal(String(value));
  if (datatype && datatype.startsWith(XSD)) return literal(String(value), datatype);

  // A range that is a CLASS on a term the context did not mark `@id` means the
  // value is a node, and a JSON string is not one. Reported rather than guessed
  // — see `convertToRdf`.
  if (datatype && !datatype.startsWith(XSD)) return null;

  // 3 — the JavaScript value, last.
  if (typeof value === 'boolean') return literal(String(value), `${XSD}boolean`);
  if (typeof value === 'number') {
    return literal(String(value), Number.isInteger(value) ? `${XSD}integer` : `${XSD}double`);
  }
  if (typeof value === 'object') return null;

  return literal(String(value));
}

/**
 * A record as N-Triples.
 *
 * Throws naming the field for a value with no expressible form, and for a key
 * spec's contexts do not define. That is inexpressibility, not invalidity, and
 * the two are not the same question — an unwritable value must never be
 * silently dropped, because a record that reached the graph incomplete
 * validates clean.
 */
export function convertToRdf(record: Record<string, unknown>): string {
  const recordType = recordTypeFor(String(record['type']));

  if (!recordType) {
    throw new Error(
      `Unknown record type: ${String(record['type'])}. It names no class spec declares as `
      + 'holding record data.',
    );
  }

  const subject = `<${String(record['id'] ?? '')}>`;
  const terms = termsFor(recordType.rdfTypeUri);
  const triples = [`${subject} <${RDF_TYPE}> <${recordType.rdfTypeUri}> .`];

  for (const [key, value] of Object.entries(record)) {
    if (STRUCTURAL.has(key) || value === undefined || value === null) continue;

    const definition = terms[key];

    if (!definition) {
      throw new Error(
        `No context entry for "${key}" in core or ${vocabularyOf(recordType.rdfTypeUri)}. `
        + 'Spec publishes the JSON-to-RDF mapping; a key it does not define has no predicate, '
        + 'and writing a guessed one would put a triple in a pod that no shape can judge.',
      );
    }

    // EVERY value, whatever the field's declared cardinality. A writer that
    // kept the first would hand the validator a record with nothing left to
    // violate: the JSON that went in breaks sh:maxCount 1, the graph that comes
    // out does not, and the verdict is clean on data that is wrong.
    for (const item of Array.isArray(value) ? value : [value]) {
      const object = objectTerm(item, definition);

      if (object === null) {
        throw new Error(
          `Cannot express "${key}" = ${JSON.stringify(item)} as RDF. The term declares `
          + `${definition.type ?? definition.range ?? 'no type'}, which this value is not a `
          + 'member of. Refusing rather than dropping it: a record that reaches the graph '
          + 'incomplete validates clean.',
        );
      }

      triples.push(`${subject} <${definition.predicate}> ${object} .`);
    }
  }

  return triples.join('\n');
}

/**
 * The same record as a Turtle document, prefixes and all.
 *
 * `serialize()` is documented as returning "a complete Turtle document string",
 * and routing a record type must change WHICH CODE produced the output, never
 * what shape it is. N-Triples is legal Turtle, so a routed type would still
 * have parsed — and every caller reading a pod file would have found one file
 * written without prefixes for no reason it could see.
 *
 * PARSED AND REWRITTEN, through the vendored n3. Reusing upstream's writer
 * rather than abbreviating IRIs here keeps a Turtle serializer out of this
 * repository, and the round trip pays for itself: output this module could not
 * parse fails immediately rather than reaching a pod.
 */
export function convertToTurtle(record: Record<string, unknown>): string {
  const quads = new N3Parser().parse(convertToRdf(record));

  // Only the prefixes the document actually uses. n3 emits every prefix it is
  // given, and a header declaring seven vocabularies for a record that names
  // two is noise a reader has to discount.
  const used = Object.fromEntries(
    Object.entries(SPEC_TERMS.prefixes)
      .filter(([, namespace]) => quads.some((quad: { predicate: { value: string } }) =>
        quad.predicate.value.startsWith(namespace))),
  );

  const writer = new N3Writer({ prefixes: used });
  for (const quad of quads) writer.addQuad(quad);

  let turtle = '';
  // n3's `end` is callback-shaped and synchronous when the sink is a string.
  writer.end((error: unknown, result: string) => {
    if (error) throw error;
    turtle = result;
  });

  return turtle;
}
