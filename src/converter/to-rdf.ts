/**
 * A Cascade record to RDF, from spec's published data and nothing else.
 *
 * NO MODELS, NO TERM MODULES, NO PREDICATE TABLE. Every fact this reads comes
 * from `src/spec/derived/terms.generated.ts` and
 * `src/spec/derived/record-types.generated.ts`, both built from the contexts
 * and ontologies this package ships. It is the
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

import { recordTypeFor } from '../record-types/index.js';
import { quoteTurtleString } from '../serializer/turtle-builder.js';
import { SPEC_TERMS } from '../spec/derived/terms.generated.js';
import type { TermDefinition, UnclassifiableRange } from '../spec/derived/terms.generated.js';
// A STATIC import of the vendored bundle, so a bundler can follow it. This was
// a `createRequire` of n3's CommonJS build, which no browser bundle could
// resolve (D-BROWSER-1, #95); `src/vendor/n3/VENDOR.md` says what the bundle is.
import { Parser as N3Parser, Writer as N3Writer } from '../vendor/n3/n3.js';
import type { Quad } from '../vendor/n3/n3.js';

const XSD = 'http://www.w3.org/2001/XMLSchema#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDF_TYPE = `${RDF}type`;
const RDF_FIRST = `${RDF}first`;
const RDF_REST = `${RDF}rest`;
const RDF_NIL = `${RDF}nil`;

/**
 * An absolute IRI: a scheme, then anything N-Triples may hold between angles.
 *
 * A SCHEME TEST, NOT AN HTTP TEST. `urn:` is not exotic here — every fixture's
 * own record id is a `urn:uuid:`, so cross-record references in that form are
 * the expected case and `did:` WebIDs are the other obvious one. Matching
 * `^https?://` reported both as inexpressible, which they are not.
 *
 * EXCLUDES `\x00`-`\x20` AS A RANGE, not `\s` plus the delimiters. `\s` misses
 * most of the C0 controls — NUL, ESC and the rest of `\x00`-`\x1F` other than
 * the whitespace ones — and the N-Triples/Turtle IRIREF grammar excludes all of
 * `#x00`-`#x20`, not only the ones JavaScript calls whitespace.
 */
const ABSOLUTE_IRI = /^[A-Za-z][A-Za-z0-9+.-]*:[^\x00-\x20<>"{}|\\^`]*$/;

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
function vocabularyOf(classIri: string): string | undefined {
  // LOOKED UP, NOT PARSED. This read the vocabulary out of the IRI with
  // `/\/([a-z]+)\/v\d+#/` — spec's URI shape written as an assumption, in the
  // module whose whole purpose is to stop encoding spec by hand. It also failed
  // SILENTLY: `[a-z]+` matches no digit and no hyphen, so a vocabulary segment
  // carrying either fell through to `'core'` and the record resolved with its
  // own vocabulary invisible — keys refused as undefined, or worse, answered by
  // a core term that happened to share the name.
  //
  // `namespaceOwners` is the same fact taken from spec: see
  // `scripts/lib/iri.mjs` for how it is derived, and why `core` wins over
  // `cascade` for the shared namespace without anyone saying so.
  //
  // LONGEST MATCH, because nothing forbids one namespace being a prefix of
  // another; picking the first that matched would answer by object order.
  let owner: string | undefined;
  let matched = 0;

  for (const [namespace, vocabulary] of Object.entries(SPEC_TERMS.namespaceOwners ?? {})) {
    if (namespace.length > matched && classIri.startsWith(namespace)) {
      owner = vocabulary;
      matched = namespace.length;
    }
  }

  // `undefined`, NOT `'core'`. A class in a namespace spec publishes no context
  // for cannot be resolved, and saying "core" would be an answer rather than a
  // refusal — `termsFor` is where that becomes a message naming the class.
  return owner;
}

/**
 * The keys every context that declares them agrees about, and the ones no two
 * contexts do.
 *
 * WHY THE STACK IS NOT ENOUGH. `core` plus the record's own vocabulary assumes
 * spec's contexts are partitioned by vocabulary, and they are not:
 * `businessIdentifier` is declared on `CascadeEntity` and is therefore legal on
 * EVERY record type, but it is published in the `clinical` context — not
 * `core`, not `health`. Resolving a `health:ImmunizationRecord` against the
 * stack alone turned a field the hand-rolled serializer has always written into
 * a hard failure the moment the type was routed.
 *
 * WHY THIS CANNOT WRITE THE WRONG PREDICATE, which is the harm the
 * per-vocabulary stack exists to prevent. A key lands here only if every context
 * that declares it names the SAME predicate, so there is one answer and no
 * choice to get wrong. The 34 keys that mean different things in different
 * contexts — `notes` is `clinical:notes` under `clinical` and `health:notes`
 * under `health`, and `status`, `severity` and 31 others are the same — are
 * collected in `CONTESTED_KEYS` instead and still refused, naming the ambiguity
 * rather than reporting the key as undefined. That is `jayostis/spec#4`; this
 * reads around it without guessing.
 */
const [SHARED_TERMS, CONTESTED_KEYS] = ((): [Record<string, TermDefinition>, Set<string>] => {
  const shared: Record<string, TermDefinition> = {};
  const contested = new Set<string>();

  // AGREEING MEANS AGREEING ABOUT ALL OF IT, not just the predicate. A
  // definition also carries `@type`, `@container` and the ontology's range, and
  // two contexts naming one predicate while declaring different datatypes for
  // it is a disagreement — resolved, if only the predicate were compared, by
  // whichever vocabulary this loop reached last. Iteration order deciding a
  // field's datatype is the defect `src/record-types/` exists to remove, one
  // layer down.
  //
  // No key does this today: across all seven contexts, zero agree on a
  // predicate and differ on type or container. Compared in full anyway, because
  // the alternative is a rule that is right by luck and silent when the luck
  // runs out.
  const shape = (definition: TermDefinition): string =>
    [definition.predicate, definition.type ?? '', definition.container ?? '', definition.range ?? ''].join('|');

  for (const terms of Object.values(SPEC_TERMS.vocabularies)) {
    for (const [key, definition] of Object.entries(terms)) {
      const agreed = shared[key];

      if (agreed && shape(agreed) !== shape(definition)) contested.add(key);
      else shared[key] = definition;
    }
  }

  for (const key of contested) delete shared[key];

  return [shared, contested];
})();

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

  // REFUSED RATHER THAN DEFAULTED. The old code answered `'core'` here for any
  // IRI it could not parse, so a class from a namespace spec publishes no
  // context for was resolved against core's terms — every key either refused as
  // undefined or, where a core term shared the name, written with core's
  // predicate. A wrong predicate no shape can judge is the failure this module
  // exists to avoid, and it is worth a throw naming the class.
  //
  // Unreachable at the pinned revision: every registered class is in one of the
  // six namespaces, and `recordTypeFor` gates entry. It is the day spec adds a
  // vocabulary that this has to speak.
  if (!vocabulary) {
    throw new Error(
      `No context resolves ${classIri}: its namespace is not one any published context owns. `
      + `Spec publishes the JSON-to-RDF mapping per vocabulary, so a class outside all of them `
      + 'has no term table to resolve its keys against, and guessing one would write predicates '
      + 'no shape can judge.',
    );
  }

  const cached = TERMS_BY_VOCABULARY.get(vocabulary);
  if (cached) return cached;

  // The record's own vocabulary wins where both declare a key, which is the
  // point of resolving per class: a `health:` record's `notes` is
  // `health:notes`, and `core`'s entry must not shadow it.
  // Lowest first. `SHARED_TERMS` holds only keys every context agrees about, so
  // what it contributes is a key the stack does not define — never a rival
  // answer for one it does.
  const merged = {
    ...SHARED_TERMS,
    ...SPEC_TERMS.vocabularies['core'],
    ...SPEC_TERMS.vocabularies[vocabulary],
  };

  TERMS_BY_VOCABULARY.set(vocabulary, merged);
  return merged;
}

/**
 * A literal, escaped for N-Triples.
 *
 * ESCAPED BY THE SERIALIZER'S OWN FUNCTION, not by a second scheme here.
 * `convertToRdf` is exported, so this text reaches consumers directly rather
 * than always being reparsed by `convertToTurtle` — and a package with two
 * escapers has no forcing function to fix both. `quoteTurtleString` is the
 * one-line form; `escapeTurtleString`'s triple-quoted long literal is Turtle
 * only and is not a term N-Triples can hold.
 */
const literal = (value: string, datatype?: string): string =>
  `${quoteTurtleString(value)}${datatype ? `^^<${datatype}>` : ''}`;

/**
 * The spec-fix entry for a range, if `range` names one of the classes spec
 * declared and never gave a field or a published member (#91).
 *
 * `SPEC_TERMS.unclassifiableRanges` is declared non-optional on `SpecTerms`,
 * but that only binds a freshly generated `terms.generated.ts` — the map
 * itself is a JSON literal baked in at generation time, so a copy of the file
 * built by a pre-#91 version of `scripts/build-terms.mjs` has no such key at
 * runtime despite the type saying otherwise. `?.` here is what stands between
 * that stale-file case and a `TypeError` thrown from every `@id`-typed term,
 * unclassifiable or not — one shared check, so the two call sites can't drift.
 */
const unclassifiableRangeFor = (range: string | undefined): UnclassifiableRange | undefined =>
  range ? SPEC_TERMS.unclassifiableRanges?.[range] : undefined;

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
    //
    // ASKED FIRST, BEFORE THE IRI TEST, because a CURIE satisfies both: a scheme
    // test cannot tell `cascade:ClinicalGenerated` from `urn:webid:alice`, and
    // the value set can — the first is a member and members are what this term
    // admits.
    const members = definition.range ? SPEC_TERMS.valueSets[definition.range] : undefined;

    // A CLOSED SET IS CLOSED, and the miss does not fall through to the scheme
    // test below. `ABSOLUTE_IRI` is a SCHEME test, so `core:ClinicalGenerate` —
    // the trailing `d` dropped — satisfies it, and falling through wrote
    // `<core:ClinicalGenerate>`: an IRI spec never published, invented by the
    // writer, on a term whose permitted values are enumerated. That is the
    // "cannot express" case, not the "any IRI" case, and refusing it is what
    // CLAUDE.md's faithful-first rule asks for — the two are only ever told
    // apart by whether the term HAS a value set, never by whether a lookup in
    // one happened to hit.
    if (members) {
      // A colon alone does not make `text` a CURIE — `bogus:ClinicalGenerated`
      // has one, and stripping everything up to it regardless of what the
      // prefix actually is looks up "ClinicalGenerated" and finds it, which is
      // the closed set treating an unrecognized prefix as if it were `cascade:`.
      // The local name is trusted only once the prefix is one `SPEC_TERMS`
      // actually publishes.
      const colon = text.indexOf(':');
      const prefix = colon === -1 ? undefined : text.slice(0, colon);
      const localName =
        prefix !== undefined && Object.prototype.hasOwnProperty.call(SPEC_TERMS.prefixes, prefix)
          ? text.slice(colon + 1)
          : text;

      const resolved = Object.prototype.hasOwnProperty.call(members, localName)
        ? members[localName]
        : undefined;
      if (resolved) return `<${resolved}>`;

      // The same member, written out in full. A record that spells a permitted
      // value as its own IRI is not wrong, and closing the set must not refuse
      // the one spelling that needs no resolution rule at all.
      return Object.values(members).includes(text) ? `<${text}>` : null;
    }

    // A range with no members is not automatically an open reference.
    // `cascade:creatorWebID` (`rdfs:range rdfs:Resource`) is open by design and
    // belongs here; `health:hrvHistory` (`rdfs:range health:HRVReading`) is a
    // Cascade class spec declared and never gave a single field, and accepting
    // any IRI for it would write a reference spec cannot judge into the graph.
    // `SPEC_TERMS.unclassifiableRanges` is exactly that second group (#91), so
    // it is refused here — `null`, turned by the caller into the throw naming
    // the term, the range and what spec would need to add — rather than
    // silently taking the permissive branch below.
    if (unclassifiableRangeFor(definition.range)) return null;

    // Any absolute IRI, whatever its scheme. `cascade:creatorWebID` has
    // `rdfs:range rdfs:Resource` and therefore no value set at all, so this is
    // the only branch a WebID can take.
    return ABSOLUTE_IRI.test(text) ? `<${text}>` : null;
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
    if (Number.isInteger(value)) return literal(String(value), `${XSD}integer`);

    // `String()` is not the XSD lexical form for every double. `NaN` happens to
    // coincide, but XSD Schema Part 2 spells the infinities `INF` / `-INF`,
    // never JavaScript's `"Infinity"` / `"-Infinity"` — a lexical form no SHACL
    // datatype check accepts.
    if (Number.isNaN(value)) return literal('NaN', `${XSD}double`);
    if (!Number.isFinite(value)) return literal(value > 0 ? 'INF' : '-INF', `${XSD}double`);

    return literal(String(value), `${XSD}double`);
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
    // TWO REFUSALS, NOT ONE, and they had the same message until the second was
    // noticed to be a lie. `type: "Address"` was refused with "names no class
    // spec declares" while `../spec/contexts/v1/core.jsonld` names
    // `cascade:Address` plainly — the class exists, and what it lacks is
    // membership of the record population.
    //
    // They are different situations with different remediations: one is a
    // spelling or a class spec has not published, the other is a roster question
    // upstream or a caller reaching for the wrong function. A single message
    // sends both readers to the wrong place.
    const named = Object.values(SPEC_TERMS.vocabularies)
      .some((terms) => Object.prototype.hasOwnProperty.call(terms, String(record['type'])));

    throw new Error(
      named
        ? `Cannot serialize "${String(record['type'])}" as a record: spec publishes the name but `
          + 'does not mark its class a record class, so it is not a top-level subject. A nested '
          + 'structure is written as part of its parent. If it should be a record in its own '
          + 'right, that is a roster question upstream — see jayostis/spec#50.'
        : `Unknown record type: ${String(record['type'])}. No context spec publishes names it, `
          + 'so there is no class to write. Check the spelling, or the class is not published yet.',
    );
  }

  const id = record['id'];

  // NAMED HERE, NOT LEFT TO THE PARSER. `id ?? ''` wrote `<>` for a record with
  // no id — a relative IRI resolving to whatever base the consumer parses with,
  // so every id-less record collides: the "reaches the graph and validates
  // clean" outcome this module argues against. And an id that was not an IRI
  // escaped as `Unexpected "<not" on line 1` out of the vendored parser, naming
  // neither the record nor the field, unlike every other refusal here.
  if (typeof id !== 'string' || !ABSOLUTE_IRI.test(id)) {
    throw new Error(
      `"id" must be an absolute IRI; this record has ${JSON.stringify(id)}. A record with no `
      + 'usable subject is written as the relative IRI <>, which resolves to whatever base the '
      + 'reader parses with — so every such record collides, and the merged graph validates '
      + 'clean on data that named nothing.',
    );
  }

  const subject = `<${id}>`;
  const terms = termsFor(recordType.rdfTypeUri);

  // Computed once for the refusal messages below. `termsFor` has already thrown
  // if this were undefined, so the fallback is unreachable — it is here because
  // a message that read "core or undefined" would be worse than one that names
  // only the context it is sure of.
  const stack = vocabularyOf(recordType.rdfTypeUri) ?? 'core';
  const triples = [`${subject} <${RDF_TYPE}> <${recordType.rdfTypeUri}> .`];

  /** A value with no expressible form, turned into the throw naming the field. */
  const expressOrThrow = (key: string, item: unknown, definition: TermDefinition): string => {
    const object = objectTerm(item, definition);

    if (object === null) {
      // PER VALUE, NOT PER TYPE (#91). A range spec declares and never gives
      // members or fields — `health:HRVReading` and five more — is not a
      // mistake in THIS record; the record just happens to be the one that
      // exercised a gap on spec's side. The refusal has to say so, or a reader
      // goes looking for a typo that is not there.
      const gap = unclassifiableRangeFor(definition.range);

      if (gap) {
        throw new Error(
          `Cannot express "${key}" = ${JSON.stringify(item)} as RDF: its range `
          + `${definition.range} is unclassifiable — neither a code list nor a structured class `
          + `with any field spec has declared. ${gap.specFix}`,
        );
      }

      throw new Error(
        `Cannot express "${key}" = ${JSON.stringify(item)} as RDF. The term declares `
        + `${definition.type ?? definition.range ?? 'no type'}, which this value is not a `
        + 'member of. Refusing rather than dropping it: a record that reaches the graph '
        + 'incomplete validates clean.',
      );
    }

    return object;
  };

  // Blank-node labels for `@list` chains, unique within this record.
  let listNodeCounter = 0;

  for (const [key, value] of Object.entries(record)) {
    if (STRUCTURAL.has(key) || value === undefined || value === null) continue;

    const definition = terms[key];

    if (!definition) {
      throw new Error(
        CONTESTED_KEYS.has(key)
          ? `"${key}" names a different predicate in each context that declares it, and neither `
            + `core nor ${stack} — the contexts a `
            + `${recordType.name} resolves against — is one of them. See jayostis/spec#4. `
            + 'Picking one would write the wrong predicate for every record of the other class.'
          : `No context entry for "${key}" in core or ${stack}. `
            + 'Spec publishes the JSON-to-RDF mapping; a key it does not define has no '
            + 'predicate, and writing a guessed one would put a triple in a pod that no shape '
            + 'can judge.',
      );
    }

    const items = Array.isArray(value) ? value : [value];

    // `@container: @list` is order-sensitive — `provenanceLayers` and the three
    // other core v3.4 fields `src/jsonld/context.ts` marks this way — and flat
    // repeated triples cannot carry an order at all. Written instead as an
    // `rdf:List`: a chain of blank nodes, each holding one `rdf:first` and
    // pointing `rdf:rest` at the next, terminated by `rdf:nil`.
    if (definition.container === '@list') {
      if (items.length === 0) {
        triples.push(`${subject} <${definition.predicate}> <${RDF_NIL}> .`);
      } else {
        const nodes = items.map(() => `_:list${listNodeCounter++}`);
        triples.push(`${subject} <${definition.predicate}> ${nodes[0]} .`);

        items.forEach((item, index) => {
          triples.push(`${nodes[index]} <${RDF_FIRST}> ${expressOrThrow(key, item, definition)} .`);
          triples.push(
            `${nodes[index]} <${RDF_REST}> `
            + `${index === items.length - 1 ? `<${RDF_NIL}>` : nodes[index + 1]} .`,
          );
        });
      }

      continue;
    }

    // EVERY value, whatever the field's declared cardinality. A writer that
    // kept the first would hand the validator a record with nothing left to
    // violate: the JSON that went in breaks sh:maxCount 1, the graph that comes
    // out does not, and the verdict is clean on data that is wrong.
    for (const item of items) {
      triples.push(`${subject} <${definition.predicate}> ${expressOrThrow(key, item, definition)} .`);
    }
  }

  return triples.join('\n');
}

/** These quads as a Turtle document, with exactly these prefixes offered. */
function turtleOf(quads: Quad[], prefixes: Record<string, string>): string {
  const writer = new N3Writer({ prefixes });
  for (const quad of quads) writer.addQuad(quad);

  let turtle = '';
  // n3's `end` is callback-shaped and synchronous when the sink is a string.
  writer.end((error, result) => {
    if (error) throw error;
    turtle = result;
  });

  return turtle;
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
  //
  // ASKED OF THE OUTPUT, NOT OF THE QUADS. A prefix is used when the writer
  // abbreviated something with it, and only the writer knows what it
  // abbreviates: it renders `rdf:type` as `a`, writes an `xsd:string` literal
  // bare, and shortens a datatype IRI that appears in no predicate. Reading the
  // predicate position alone got all three wrong — every routed document
  // carried a `@prefix rdf:` line nothing used, while a namespace reaching the
  // document only as a subject, an object or a datatype was written out in
  // full. Restating n3's rules here would be a second place for them to drift.
  //
  // WRITTEN TWICE: once to see, once to keep. Dropping a declaration nothing
  // referenced cannot change how anything else renders.
  const body = turtleOf(quads, SPEC_TERMS.prefixes)
    .split('\n')
    .filter((line) => !line.startsWith('@prefix '))
    .join('\n');

  // LITERAL TEXT IS NOT AN ABBREVIATION. The search above reads the rendered
  // document, and a literal is part of that document without being part of what
  // the writer abbreviated — so a record whose value happens to contain
  // `clinical:` declared a vocabulary the body never named. Legal Turtle and the
  // same graph either way, and precisely the noise this filter exists to remove.
  //
  // Blanked rather than matched around. A prefixed name can follow a newline, a
  // space, `;`, `,`, `[`, `(` or `^^`, and a literal can contain any of those —
  // including real newlines inside a triple-quoted string — so a pattern over
  // what MAY precede a prefix has to be right about every one of them. Removing
  // the literals first leaves only positions where an abbreviation can occur.
  const abbreviations = body.replace(/"""[\s\S]*?"""|"(?:[^"\\]|\\.)*"/g, '""');

  return turtleOf(quads, Object.fromEntries(
    Object.entries(SPEC_TERMS.prefixes).filter(([prefix]) => abbreviations.includes(`${prefix}:`)),
  ));
}
