/**
 * Index the shapes `spec` publishes into the form the SHACL evaluator reads.
 *
 * WHAT THE INDEX IS. One entry per NAMED shape, keyed `id`. Every other key is
 * a parameter: the local name for a `sh:` predicate, the full IRI for anything
 * else. Every value is an ARRAY of expanded-JSON-LD terms — `{ '@id' }`,
 * `{ '@value', '@type'?, '@language'? }` — with an RDF list resolved to
 * `{ '@list': [...] }` and a blank shape inlined as a nested object. Arrays
 * whatever the cardinality, because the index keeps every parameter it meets,
 * understood or not, and cannot know the cardinality of one it does not.
 *
 * NOTHING FILTERED. `src/shacl/evaluate.ts` reports a parameter it cannot
 * judge as unevaluated, and it can only report what reached it. An index that
 * dropped an unknown `sh:*` key would turn "reported, not skipped" back into
 * "skipped", one layer down where no test of the engine could see it
 * (`tests/spec-data/build-shapes.test.ts`).
 *
 * A NAMED SHAPE IS ANY NAMED SUBJECT CARRYING A `sh:` PREDICATE — not only a
 * subject typed `sh:NodeShape`. `cascade:HasAttachmentEdgeShape` is a
 * `sh:PropertyShape` with `sh:targetSubjectsOf` and `sh:path` and no node
 * shape above it; an index built per node shape alone drops it silently, and a
 * shape that is never selected is a shape that reports nothing, which reads
 * as a pass. A named subject with no `sh:` predicate at all — the file's own
 * `owl:Ontology` header, a class named as an `sh:in` member — is not a shape.
 *
 * WHAT IT REPORTS. A shape whose `sh:targetClass` names a class no ontology
 * declares is a `target-class-not-in-ontology` finding, one per class. That
 * is the assertion `spec/validation/index.md` §6 says a consumer that vendors
 * shapes owes: a shape targeting a misspelled class is selected by nothing,
 * fires on nothing, and every record of the class it meant validates clean.
 *
 * A STRING, PARSED AT LOAD, in `src/spec/derived/shapes.generated.ts`, for the
 * reason `terms.generated.ts` gives: tsc infers a type per node of an object
 * literal, and this one has thousands.
 *
 * `indexShapes` is pure and takes a quad array, so the tests can hand it a
 * shapes graph that MUST make it speak. The script around it reads
 * `src/spec/shapes/`, which `build-spec-data.mjs` wrote, and never a checkout.
 *
 * @module scripts/build-shapes
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openFindings } from './lib/diagnostics.mjs';
import { isMainModule } from './lib/main-module.mjs';
import { mergedOntologyGraph, specDataLayout } from './lib/spec-source.mjs';

const SH = 'http://www.w3.org/ns/shacl#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDF_TYPE = `${RDF}type`;
const RDF_FIRST = `${RDF}first`;
const RDF_REST = `${RDF}rest`;
const RDF_NIL = `${RDF}nil`;
const RDF_LANG_STRING = `${RDF}langString`;
const XSD_STRING = 'http://www.w3.org/2001/XMLSchema#string';
const OWL_CLASS = 'http://www.w3.org/2002/07/owl#Class';
const RDFS_CLASS = 'http://www.w3.org/2000/01/rdf-schema#Class';

export const TARGET_CLASS_NOT_IN_ONTOLOGY = 'target-class-not-in-ontology';

/** A term's key in the subject map: blank nodes prefixed so they cannot collide with an IRI. */
const keyOf = (term) => (term.termType === 'BlankNode' ? `_:${term.value}` : term.value);

/**
 * One RDF term as an index value — the expanded-JSON-LD form
 * `scripts/build-spec-data.mjs` writes, so the two cannot disagree about what
 * a plain literal is: no `@type` means `xsd:string`.
 */
function termToIndex(term) {
  if (term.termType === 'NamedNode') return { '@id': term.value };
  if (term.termType === 'BlankNode') return { '@id': `_:${term.value}` };

  const datatype = term.datatype?.value ?? '';
  if (term.language) return { '@value': term.value, '@language': term.language };
  if (datatype && datatype !== XSD_STRING) return { '@value': term.value, '@type': datatype };
  return { '@value': term.value };
}

/** The local name of a `sh:` IRI, or the IRI itself for any other namespace. */
const parameterKey = (predicate) => (predicate.startsWith(SH) ? predicate.slice(SH.length) : predicate);

/**
 * Index a shapes graph.
 *
 * @param {readonly import('../src/vendor/n3/n3.js').Quad[]} quads - A shapes graph.
 * @param {Iterable<string>} [declaredClasses] - Every class IRI the ontologies declare;
 *   omitted, no target is checked and no finding is recorded.
 * @returns {{ shapes: object[], findings: { code: string, subject: string }[] }}
 */
export function indexShapes(quads, declaredClasses) {
  /** subject key -> its quads, in graph order. */
  const bySubject = new Map();
  for (const quad of quads) {
    const key = keyOf(quad.subject);
    const own = bySubject.get(key) ?? bySubject.set(key, []).get(key);
    own.push(quad);
  }

  const predicatesOf = (key) => bySubject.get(key) ?? [];
  const isListNode = (key) => predicatesOf(key).some((q) => q.predicate.value === RDF_FIRST);

  /**
   * An RDF list's members, walked through `rdf:rest` to `rdf:nil`.
   *
   * A malformed list — two `rdf:first`s, a `rdf:rest` pointing at something
   * that is neither a list node nor `rdf:nil`, a cycle — is refused rather than
   * truncated: a list that lost a member is an `sh:in` that rejects a value
   * spec permits, with nothing to say a member went missing.
   */
  function listMembers(head, seen = new Set()) {
    const members = [];
    let current = head;

    while (current.termType !== 'NamedNode' || current.value !== RDF_NIL) {
      const key = keyOf(current);
      if (seen.has(key)) throw new Error(`the RDF list at ${key} is cyclic`);
      seen.add(key);

      const firsts = predicatesOf(key).filter((q) => q.predicate.value === RDF_FIRST);
      const rests = predicatesOf(key).filter((q) => q.predicate.value === RDF_REST);
      if (firsts.length !== 1 || rests.length !== 1) {
        throw new Error(
          `the RDF list node ${key} carries ${firsts.length} rdf:first and ${rests.length} rdf:rest; `
          + 'a list this cannot walk in full would be indexed short, and an sh:in that lost a '
          + 'member rejects a value spec permits.',
        );
      }

      members.push(valueOf(firsts[0].object, seen));
      current = rests[0].object;
    }

    return members;
  }

  /** One object term as an index value, with a list resolved and a blank shape inlined. */
  function valueOf(term, seen = new Set()) {
    if (term.termType === 'NamedNode' && term.value === RDF_NIL) return { '@list': [] };
    if (term.termType !== 'BlankNode') return termToIndex(term);

    const key = keyOf(term);
    if (isListNode(key)) return { '@list': listMembers(term, new Set(seen)) };

    if (seen.has(key)) throw new Error(`the blank node ${key} reaches itself; a shape cannot be inlined into itself`);
    return shapeOf(key, new Set([...seen, key]));
  }

  /** The parameters of one subject, keyed as the header says, in graph order. */
  function shapeOf(key, seen, id) {
    const shape = id === undefined ? {} : { id };

    for (const quad of predicatesOf(key)) {
      const parameter = parameterKey(quad.predicate.value);
      (shape[parameter] ??= []).push(valueOf(quad.object, seen));
    }

    return shape;
  }

  const shapes = [];
  const targets = [];

  for (const [key, own] of bySubject) {
    if (key.startsWith('_:')) continue;
    if (!own.some((q) => q.predicate.value.startsWith(SH))) continue;

    const shape = shapeOf(key, new Set([key]), key);
    shapes.push(shape);

    for (const target of shape['targetClass'] ?? []) {
      if (typeof target['@id'] === 'string') targets.push(target['@id']);
    }
  }

  const findings = [];
  if (declaredClasses !== undefined) {
    const declared = new Set(declaredClasses);
    for (const classIri of [...new Set(targets)].sort()) {
      if (!declared.has(classIri)) findings.push({ code: TARGET_CLASS_NOT_IN_ONTOLOGY, subject: classIri });
    }
  }

  return { shapes, findings };
}

/**
 * An expanded JSON-LD node array — what `build-spec-data.mjs` writes — as
 * RDF/JS-shaped quads, the input `indexShapes` takes.
 *
 * The inverse of `toExpandedJsonLd` there, and as mechanical: `@type` is
 * `rdf:type` with a named object, `@id` is a node reference (blank where it
 * starts `_:`), and a value object is a literal whose datatype is `@type`,
 * `rdf:langString` under `@language`, and `xsd:string` otherwise.
 *
 * @param {object[]} nodes
 * @returns {object[]}
 */
export function quadsOfExpanded(nodes) {
  const named = (value) => ({ termType: 'NamedNode', value });
  const node = (id) => (id.startsWith('_:') ? { termType: 'BlankNode', value: id.slice(2) } : named(id));
  const literal = (value, datatype, language = '') => ({ termType: 'Literal', value, datatype: named(datatype), language });
  const quad = (subject, predicate, object) => ({ termType: 'Quad', subject, predicate, object, graph: { termType: 'DefaultGraph', value: '' } });

  const quads = [];

  for (const entry of nodes) {
    const subject = node(entry['@id']);

    for (const type of entry['@type'] ?? []) quads.push(quad(subject, named(RDF_TYPE), named(type)));

    for (const [predicate, values] of Object.entries(entry)) {
      if (predicate.startsWith('@')) continue;

      for (const value of values) {
        if (typeof value['@id'] === 'string') {
          quads.push(quad(subject, named(predicate), node(value['@id'])));
        } else if (typeof value['@language'] === 'string') {
          quads.push(quad(subject, named(predicate), literal(value['@value'], RDF_LANG_STRING, value['@language'])));
        } else {
          quads.push(quad(subject, named(predicate), literal(value['@value'], value['@type'] ?? XSD_STRING)));
        }
      }
    }
  }

  return quads;
}

// ── the script ───────────────────────────────────────────────────────────────

if (isMainModule(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const { ontologies: ONTOLOGIES, shapes: SHAPES, derived: DERIVED, diagnostics: DIAGNOSTICS } = specDataLayout(root);
  const OUT = join(DERIVED, 'shapes.generated.ts');

  // Opened first: a crash anywhere below leaves no findings file rather than
  // the previous run's, which is what lets the collector tell the two apart.
  const findings = openFindings({ source: 'build-shapes', dir: DIAGNOSTICS });
  const manifest = JSON.parse(readFileSync(join(root, 'spec-sources.json'), 'utf-8'));

  const files = readdirSync(SHAPES).filter((f) => f.endsWith('.jsonld')).sort();

  if (files.length === 0) {
    throw new Error(
      `no shapes under ${SHAPES}. build-spec-data.mjs writes one document per vocabulary that `
      + 'publishes shapes; with none, the evaluator would select no shape for any record and '
      + 'refuse every verdict.',
    );
  }

  /** vocabulary -> the quads its shapes document carries. */
  const perVocabulary = new Map(files.map((file) => [
    file.replace(/\.jsonld$/, ''),
    quadsOfExpanded(JSON.parse(readFileSync(join(SHAPES, file), 'utf-8'))),
  ]));

  // Every class the ontologies declare, by either spelling of "class". The
  // record-type table reads the marker `cascade:RecordClass`; a shape may
  // legitimately target a class that is not a record class (a nested
  // structure reached by `sh:node`), so the question here is the wider one.
  const declaredClasses = new Set();
  for (const node of mergedOntologyGraph(ONTOLOGIES).values()) {
    const types = node['@type'] ?? [];
    if (types.includes(OWL_CLASS) || types.includes(RDFS_CLASS)) declaredClasses.add(node['@id']);
  }

  const { shapes, findings: undeclared } = indexShapes([...perVocabulary.values()].flat(), declaredClasses);

  /** Which shapes files carry a `sh:targetClass` for this class — the files to open. */
  const shapesFilesTargeting = (classIri) => [...perVocabulary]
    .filter(([, quads]) => quads.some((q) => q.predicate.value === `${SH}targetClass` && q.object.value === classIri))
    .map(([vocabulary]) => `spec:${manifest[vocabulary].shapes}`);

  for (const { code, subject } of undeclared) {
    findings.record({
      code,
      severity: 'warning',
      owner: 'spec',
      subject,
      detail: `a shape declares sh:targetClass ${subject}, and no ontology declares that class. `
        + 'A conforming record is typed to a declared class, so the shape selects none of them '
        + 'and every constraint it states is enforced on nobody — a misspelling, or a class the '
        + 'ontology removed and the shapes file did not.',
      specFix: 'Either declare the class in the vocabulary\'s ontology, or retarget (or remove) '
        + 'the shape so it names the class it was written for.',
      location: shapesFilesTargeting(subject),
    });
  }

  const recorded = findings.close();

  const payload = JSON.stringify(shapes);

  const source = `/**
 * GENERATED by \`scripts/build-shapes.mjs\`. Do not edit.
 *
 * Every shape \`spec\` publishes, indexed for \`src/shacl/evaluate.ts\`: one entry
 * per named shape, its \`sh:\` parameters keyed by local name with RDF lists
 * resolved to arrays and blank shapes inlined. Nothing filtered — a parameter
 * the evaluator has never heard of is here, so it can be reported as
 * unevaluated rather than skipped.
 *
 * A STRING, PARSED AT LOAD, for the reason \`terms.generated.ts\` gives.
 *
 * @module spec/derived
 */

import type { IndexedShape } from '../../shacl/evaluate.js';

export const SPEC_SHAPES: readonly IndexedShape[] = JSON.parse(
  ${JSON.stringify(payload)},
) as IndexedShape[];
`;

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, source, 'utf-8');

  if (undeclared.length > 0) {
    console.warn(
      `  NOTE: ${undeclared.length} sh:targetClass value(s) name a class no ontology declares `
      + '(target-class-not-in-ontology):\n'
      + undeclared.map(({ subject }) => `    ${subject}`).join('\n'),
    );
  }

  console.log(
    `build-shapes: ${files.length} shapes files, ${shapes.length} shapes, `
    + `${Math.round(payload.length / 1024)}K -> src/spec/derived/shapes.generated.ts; `
    + `${recorded} finding(s) -> src/spec/diagnostics/build-shapes.json`,
  );
}
