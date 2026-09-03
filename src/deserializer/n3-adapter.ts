/**
 * The vendored N3 parser, speaking the shape the deserializer already reads.
 *
 * A GRAMMAR, NOT A VOCABULARY. This is the one part of #69 that takes no
 * migration flag. Parsing Turtle is not a per-record-type question — a
 * type-keyed switch here would mean the same document parsed differently
 * depending on which type the caller asked for, and `deserialize(ttl, 'X')`
 * parses the whole document and filters afterwards, so it already sees triples
 * for types no allow-list names. It is swapped outright, and
 * `tests/deserializer/parser-differential.test.ts` is the evidence: both
 * parsers over all 92 fixtures, every difference named.
 *
 * WHAT IT REPLACES. A ~700-line hand-written tokenizer built from regular
 * expressions, which had no branch for the comma object list `a :p :x , :y`
 * (#71) — legal Turtle this SDK's own writer does not emit, so a document from
 * anywhere else lost objects silently.
 *
 * The vendored copy is byte-identical to `node_modules/n3/lib`, so upstream's
 * own suite validates it and nothing here re-tests a Turtle parser. See
 * `src/vendor/n3/VENDOR.md`. It is reached through `createRequire` because it
 * is Babel's CommonJS build; the ESM original does not run under this package's
 * `"type": "module"` — every relative import in it is extensionless.
 *
 * @module deserializer
 */

import { createRequire } from 'node:module';

import { NAMESPACES } from '../vocabularies/namespaces.js';
import type { ParsedTriple } from './parsed-triple.js';

const require = createRequire(import.meta.url);

/* eslint-disable @typescript-eslint/no-explicit-any */
const N3Parser = require('../vendor/n3/N3Parser.js').default as new (
  options?: Record<string, unknown>,
) => { parse(input: string): any[] };

const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDF_FIRST = `${RDF}first`;
const RDF_REST = `${RDF}rest`;
const RDF_NIL = `${RDF}nil`;

/**
 * Which `objectType` a literal's datatype means.
 *
 * The hand-written parser decided this from the LEXICAL form — a bare `5` was
 * `integer`, `"5"^^xsd:integer` was a `literal` carrying a datatype — and the
 * two are the same RDF term. Deciding it from the datatype answers `integer`
 * for both, which is what every consumer of `objectType` actually wants: it is
 * read to convert the value to a JavaScript number, and the quotes around it in
 * the source are not data.
 *
 * `xsd:string` maps to a plain literal with NO datatype, because in RDF 1.1 a
 * plain literal IS an `xsd:string` — n3 supplies the datatype every simple
 * literal implicitly has, and carrying it through would put an explicit
 * `datatype` on every string field the SDK reads.
 */
const OBJECT_TYPE_BY_DATATYPE: Readonly<Record<string, ParsedTriple['objectType']>> = {
  [`${NAMESPACES.xsd}boolean`]: 'boolean',
  [`${NAMESPACES.xsd}integer`]: 'integer',
  [`${NAMESPACES.xsd}double`]: 'double',
  [`${NAMESPACES.xsd}decimal`]: 'double',
};

/**
 * Blank-node labels, renumbered `_:b1`, `_:b2`, … in first-appearance order.
 *
 * n3 mints its own labels (`b0_b1` and the like) and the hand-written parser
 * minted `_:b1` upwards. Nothing downstream parses a label — it is a key used
 * to find a node's children — so either would work, and renumbering exists so
 * the differential test compares triples rather than two naming schemes.
 *
 * Per-parse, so two documents in one process do not share a counter and a label
 * cannot leak from one graph into another.
 */
function labeller(): (label: string) => string {
  const labels = new Map<string, string>();

  return (label) => {
    const existing = labels.get(label);
    if (existing) return existing;

    const minted = `_:b${labels.size + 1}`;
    labels.set(label, minted);
    return minted;
  };
}

/** A term as the deserializer spells it: IRIs and blank labels bare, literals unquoted. */
function termValue(term: any, label: (id: string) => string): string {
  return term.termType === 'BlankNode' ? label(term.value) : String(term.value);
}

/**
 * Re-collapse `rdf:first`/`rdf:rest` chains into one `list` triple.
 *
 * Turtle's `( a b c )` is sugar for a chain of blank nodes, and n3 expands it
 * because that is what the syntax MEANS. The deserializer wants it back in the
 * collapsed form the hand-written parser produced — a single triple whose
 * object is the JSON array of members — because that is what
 * `ARRAY_TYPE_FIELDS` reads.
 *
 * Returns the head-to-members map plus the set of chain nodes, so the caller
 * can emit the one and drop the other.
 */
function collapseLists(quads: readonly any[], label: (id: string) => string): {
  membersOf: Map<string, string[]>;
  chainNodes: Set<string>;
} {
  const first = new Map<string, string>();
  const rest = new Map<string, string>();

  for (const quad of quads) {
    if (quad.subject.termType !== 'BlankNode') continue;

    const node = label(quad.subject.value);
    if (quad.predicate.value === RDF_FIRST) first.set(node, termValue(quad.object, label));
    if (quad.predicate.value === RDF_REST) {
      rest.set(node, quad.object.termType === 'BlankNode'
        ? label(quad.object.value)
        : String(quad.object.value));
    }
  }

  const chainNodes = new Set([...first.keys()].filter((node) => rest.has(node)));
  const membersOf = new Map<string, string[]>();

  for (const head of chainNodes) {
    const members: string[] = [];
    const seen = new Set<string>();

    // `seen` is not defensiveness about our own writer, it is about documents
    // from anywhere else: `_:a rdf:rest _:a` is a cycle a graph can express and
    // a list cannot, and walking it without this never returns.
    for (let node: string | undefined = head; node && !seen.has(node); node = rest.get(node)) {
      seen.add(node);
      const member = first.get(node);
      if (member === undefined) break;
      members.push(member);
    }

    membersOf.set(head, members);
  }

  return { membersOf, chainNodes };
}

/**
 * Parse a Turtle document into the flat triple list the deserializer reads.
 *
 * FAITHFUL, LIKE EVERY OTHER READER HERE. It drops nothing on validity grounds
 * and refuses nothing a parser accepts. The one thing it does drop is a
 * language tag, which `ParsedTriple` has nowhere to put — the same as before,
 * and the same for both parsers, so the differential does not hide it.
 */
export function parseTurtleWithN3(content: string): ParsedTriple[] {
  const quads = new N3Parser().parse(content);
  const label = labeller();
  const { membersOf, chainNodes } = collapseLists(quads, label);
  const triples: ParsedTriple[] = [];

  for (const quad of quads) {
    const subject = termValue(quad.subject, label);

    const predicate = String(quad.predicate.value);

    // The chain's OWN triples are not data — its members are, and they are
    // carried on the triple that points at the head. Only `rdf:first` and
    // `rdf:rest` are the chain's own.
    //
    // This skipped every triple whose subject was a chain node, which drops any
    // OTHER predicate on that blank node silently: no error, a shorter record,
    // and a graph with nothing left for a shape to catch. `_:l rdf:first "x" ;
    // rdf:rest rdf:nil ; c:note "KEEP ME"` lost the note.
    //
    // Legal RDF, and the same failure the hand-written parser had with comma
    // lists — in the replacement written to fix it, one layer along. This
    // module opens by promising it drops nothing on validity grounds, and a
    // promise the code does not keep is worse than no promise.
    if (chainNodes.has(subject) && (predicate === RDF_FIRST || predicate === RDF_REST)) continue;
    const object = quad.object;

    if (object.termType === 'BlankNode' && chainNodes.has(label(object.value))) {
      triples.push({
        subject,
        predicate,
        object: JSON.stringify(membersOf.get(label(object.value)) ?? []),
        objectType: 'list',
      });
      continue;
    }

    // `()`. An empty list is `rdf:nil` itself, with no chain to collapse.
    if (object.termType === 'NamedNode' && object.value === RDF_NIL) {
      triples.push({ subject, predicate, object: '[]', objectType: 'list' });
      continue;
    }

    if (object.termType === 'BlankNode') {
      triples.push({ subject, predicate, object: label(object.value), objectType: 'blankNode' });
      continue;
    }

    if (object.termType !== 'Literal') {
      triples.push({ subject, predicate, object: String(object.value), objectType: 'uri' });
      continue;
    }

    const datatype = String(object.datatype?.value ?? '');
    const objectType = OBJECT_TYPE_BY_DATATYPE[datatype];

    if (objectType) {
      triples.push({ subject, predicate, object: String(object.value), objectType });
      continue;
    }

    triples.push({
      subject,
      predicate,
      object: String(object.value),
      objectType: 'literal',
      ...(datatype && datatype !== `${NAMESPACES.xsd}string` ? { datatype } : {}),
    });
  }

  return triples;
}
