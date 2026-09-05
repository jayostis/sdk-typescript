/**
 * A SHACL evaluator over the shape data this package ships.
 *
 * THE SMALLEST ENGINE THAT ANSWERS #98'S QUESTION: whether a generic evaluator
 * over shipped shape data can replace the hand-written validator chain and
 * agree with `rdf-validate-shacl`. It implements exactly the surface
 * `health:ImmunizationRecordShape` and the four predicate-targeted core shapes
 * exercise — two target types, bare predicate paths, and the value and
 * cardinality components listed in {@link evaluateShape} — and REPORTS
 * everything else rather than skipping it.
 *
 * THE REFUSAL CHANNEL IS THE POINT. Every constraint parameter met on a
 * selected shape and not judged, every path form not walked, every target type
 * not selected, lands in `unevaluated`, and a report with anything there does
 * not conform. Nor does a report that evaluated nothing: a record of a class
 * no shape targets is `run_conformance.py`'s `UNSHAPED`, and "no shape
 * objected" is not the same sentence as "the shapes accept it". A validator
 * that conforms to everything it does not understand is the vacuous verdict
 * this SDK is least able to detect (`CLAUDE.md`), and this module's one rule
 * is that it never produces one.
 *
 * NO INFERENCING (V1 of spec's validation profile). `sh:targetClass` selects a
 * subject by the `rdf:type` it carries, not by `rdfs:subClassOf` reasoning
 * over anything. `rdf-validate-shacl` reads subclass triples out of the DATA
 * graph, which no record here carries, so the two agree on every graph this
 * SDK writes.
 *
 * AGREEMENT WITH THE ORACLE IS MEASURED, NOT ASSUMED. `tests/shacl/` hands both
 * judges one graph and compares `conforms` and the set of
 * `(focusNode, path, sourceConstraintComponent)` tuples; where this engine
 * disagrees with `rdf-validate-shacl` on a shape it claims to evaluate, that
 * is a finding to record and not a knob to turn (V3). Where their semantics
 * had to be chosen — what "well-formed" means for an `xsd:dateTime`, whether
 * `sh:minLength` measures code units — this follows the oracle's reading, so
 * the comparison is about judgement and not about spelling.
 *
 * @module shacl
 */

import type { Quad, Term } from '../vendor/n3/n3.js';

const SH = 'http://www.w3.org/ns/shacl#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const XSD = 'http://www.w3.org/2001/XMLSchema#';
const RDF_TYPE = `${RDF}type`;
const RDF_LANG_STRING = `${RDF}langString`;
const XSD_STRING = `${XSD}string`;

/**
 * One value in the shapes index, in expanded JSON-LD terms: a node reference,
 * a literal, an RDF list resolved to its members, or a blank shape inlined.
 */
export type IndexValue =
  | { readonly '@id': string }
  | { readonly '@value': string; readonly '@type'?: string; readonly '@language'?: string }
  | { readonly '@list': readonly IndexValue[] }
  | IndexedShape;

/**
 * One shape as `scripts/build-shapes.mjs` indexes it.
 *
 * `id` is the IRI of a named shape and absent on a blank one. Every other key
 * is a parameter — the local name for a `sh:` predicate, the full IRI for any
 * other — and every value is an array of {@link IndexValue}, whatever the
 * parameter's cardinality: the index keeps what it does not understand, and
 * cannot know the cardinality of a parameter it does not understand.
 */
export interface IndexedShape {
  readonly id?: string;
  readonly [parameter: string]: unknown;
}

/** One validation result, in the terms `rdf-validate-shacl` reports. */
export interface ShaclResult {
  readonly focusNode: string;
  /** The `sh:path` IRI, or `null` for a node-level constraint. */
  readonly path: string | null;
  readonly sourceConstraintComponent: string;
  /**
   * The `sh:` parameter the component reports under, by local name:
   * `maxCount` for `sh:MaxCountConstraintComponent`. Carried because the
   * engine has it in hand when it reports, and a caller printing a finding
   * for a shape that wrote no message would otherwise re-derive it from the
   * component IRI by naming convention.
   */
  readonly parameter: string;
  /** The `sh:severity` IRI; `sh:Violation` where the shape declares none. */
  readonly severity: string;
  /**
   * Every `sh:message` the shape carries, unaltered and in graph order; empty
   * where it carries none. SHACL permits several and `rdf-validate-shacl`
   * returns them all; six clinical shapes at the pin write two on one
   * property, and a result that kept "the one" kept neither.
   */
  readonly messages: readonly string[];
}

export interface ShaclReport {
  /** `false` when anything was reported, when anything went unevaluated, or when nothing was evaluated at all. */
  readonly conforms: boolean;
  readonly results: readonly ShaclResult[];
  /** Constraint evaluations performed. Zero is a refusal, never a pass. */
  readonly evaluated: number;
  /**
   * Focus nodes selected, summed over the shapes that selected them. Zero
   * means no shape targeted anything in the graph — which `evaluated === 0`
   * alone cannot say, since a selected shape whose every parameter was
   * refused also evaluates nothing.
   */
  readonly selected: number;
  /** Parameter IRIs present on a selected shape that this engine did not judge, distinct and sorted. */
  readonly unevaluated: readonly string[];
}

// ─── The index, read ────────────────────────────────────────────────────────

const isReference = (value: unknown): value is { '@id': string } =>
  typeof value === 'object' && value !== null && typeof (value as { '@id'?: unknown })['@id'] === 'string';

const isLiteral = (value: unknown): value is { '@value': string; '@type'?: string; '@language'?: string } =>
  typeof value === 'object' && value !== null && typeof (value as { '@value'?: unknown })['@value'] === 'string';

const isList = (value: unknown): value is { '@list': readonly IndexValue[] } =>
  typeof value === 'object' && value !== null && Array.isArray((value as { '@list'?: unknown })['@list']);

/** A blank shape inlined by the index: an object that is none of the other three forms. */
const isInlineShape = (value: unknown): value is IndexedShape =>
  typeof value === 'object' && value !== null && !isReference(value) && !isLiteral(value) && !isList(value);

/** The values of one parameter, always an array in the index; `[]` where absent. */
function valuesOf(shape: IndexedShape, parameter: string): readonly unknown[] {
  const values = shape[parameter];
  return Array.isArray(values) ? values : [];
}

/** The one IRI a parameter names, or `undefined` where it names none or more than one, or a blank node. */
function iriOf(shape: IndexedShape, parameter: string): string | undefined {
  const values = valuesOf(shape, parameter);
  const [only] = values;
  if (values.length !== 1 || !isReference(only) || only['@id'].startsWith('_:')) return undefined;
  return only['@id'];
}

/** The one literal a parameter carries, as its lexical form. */
function literalOf(shape: IndexedShape, parameter: string): string | undefined {
  const values = valuesOf(shape, parameter);
  const [only] = values;
  return values.length === 1 && isLiteral(only) ? only['@value'] : undefined;
}

/** Every literal a parameter carries, as lexical forms in graph order; a non-literal value is skipped. */
function literalsOf(shape: IndexedShape, parameter: string): string[] {
  return valuesOf(shape, parameter).flatMap((value) => (isLiteral(value) ? [value['@value']] : []));
}

// ─── The data graph, read ───────────────────────────────────────────────────

/** A term's key in a map: blank nodes prefixed so they cannot collide with an IRI. */
const keyOf = (term: Term): string => (term.termType === 'BlankNode' ? `_:${term.value}` : term.value);

/** The datatype IRI of a literal, as RDF 1.1 assigns it: `xsd:string` where none is spelled. */
const datatypeOf = (term: Term): string =>
  term.language ? RDF_LANG_STRING : term.datatype?.value ?? XSD_STRING;

/** A term's identity for set membership: a literal by lexical form, language and datatype, so `"1"` and `"1"^^xsd:integer` stay distinct. */
const identityOf = (term: Term): string =>
  term.termType === 'Literal'
    ? `"${term.value}"@${term.language ?? ''}^^${datatypeOf(term)}`
    : keyOf(term);

/**
 * The data graph indexed by subject, and by class for `sh:targetClass`.
 *
 * A SET OF TRIPLES, as an RDF graph is. The parser hands over one quad per
 * statement in the document, and a Turtle document may state a triple twice;
 * `rdf-validate-shacl` judges a dataset and sees one value node where this
 * saw two, tripping `sh:maxCount 1` on a record every RDF store holds as
 * conforming. Deduplicated here, once, so every count and every per-value
 * walk below reads the graph and not the serialization.
 */
class Graph {
  private readonly bySubject = new Map<string, Quad[]>();

  constructor(quads: readonly Quad[]) {
    const seen = new Set<string>();
    for (const quad of quads) {
      const key = keyOf(quad.subject);
      const statement = `${key} ${quad.predicate.value} ${identityOf(quad.object)}`;
      if (seen.has(statement)) continue;
      seen.add(statement);

      const own = this.bySubject.get(key);
      if (own) own.push(quad);
      else this.bySubject.set(key, [quad]);
    }
  }

  /** The objects of `predicate` on `subject`, in graph order. */
  objects(subject: Term, predicate: string): Term[] {
    return (this.bySubject.get(keyOf(subject)) ?? [])
      .filter((quad) => quad.predicate.value === predicate)
      .map((quad) => quad.object);
  }

  /** Every subject typed `classIri` by an `rdf:type` it carries itself. */
  instancesOf(classIri: string): Term[] {
    return this.subjects((quad) => quad.predicate.value === RDF_TYPE
      && quad.object.termType === 'NamedNode' && quad.object.value === classIri);
  }

  /** Every subject carrying `predicate`. */
  subjectsOf(predicate: string): Term[] {
    return this.subjects((quad) => quad.predicate.value === predicate);
  }

  private subjects(matches: (quad: Quad) => boolean): Term[] {
    const found: Term[] = [];
    for (const own of this.bySubject.values()) {
      const hit = own.find(matches);
      if (hit) found.push(hit.subject);
    }
    return found;
  }
}

// ─── Lexical forms, as the oracle reads them ────────────────────────────────

/**
 * Whether a lexical form is well-formed for its datatype.
 *
 * THE ORACLE'S RULES, TRANSCRIBED. `rdf-validate-shacl` delegates to
 * `rdf-validate-datatype`, whose `xsd:date` and `xsd:dateTime` are regular
 * expressions over the shape of the string — a month of 13 passes both — and
 * whose unknown datatype passes everything. Matching that is what makes the
 * agreement suites compare judgement rather than spelling; a stricter calendar
 * check would be a disagreement with the oracle on a case neither fixture
 * corpus contains, recorded here rather than silently introduced.
 */
const sign = '(\\+|-)?';
const integerPattern = new RegExp(`^${sign}\\d+$`);
const decimalPattern = new RegExp(`^${sign}${sign}(\\d+\\.?\\d*|\\.\\d+)$`);
const floatPattern = new RegExp(`^${sign}${sign}(\\d+\\.?\\d*|\\.\\d+)((E|e)(\\+|-)?\\d+)?$`);
const year = '-?(([1-9]\\d{3,})|(0\\d{3}))';
const timezone = '(((\\+|-)\\d{2}:\\d{2})|Z)';
const date = `${year}-\\d{2}-\\d{2}`;
const time = '\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?';
const datePattern = new RegExp(`^${date}${timezone}?$`);
const dateTimePattern = new RegExp(`^${date}T${time}${timezone}?$`);
const anyUriPattern = /^[^\uFFFE\uFFFF]*$/;

const LEXICAL: Readonly<Record<string, (value: string) => boolean>> = {
  [`${XSD}string`]: () => true,
  [`${XSD}boolean`]: (v) => v === 'true' || v === 'false' || v === '1' || v === '0',
  [`${XSD}integer`]: (v) => integerPattern.test(v),
  [`${XSD}nonNegativeInteger`]: (v) => integerPattern.test(v) && !/^-\d*[1-9]/.test(v),
  [`${XSD}decimal`]: (v) => decimalPattern.test(v),
  [`${XSD}double`]: (v) => v === 'INF' || v === '-INF' || v === 'NaN' || floatPattern.test(v),
  [`${XSD}float`]: (v) => v === 'INF' || v === '-INF' || v === 'NaN' || floatPattern.test(v),
  [`${XSD}date`]: (v) => datePattern.test(v),
  [`${XSD}dateTime`]: (v) => dateTimePattern.test(v),
  [`${XSD}anyURI`]: (v) => anyUriPattern.test(v),
};

/** A literal of datatype `iri` whose lexical form that datatype admits. */
function hasDatatype(term: Term, iri: string): boolean {
  if (term.termType !== 'Literal' || datatypeOf(term) !== iri) return false;
  return (LEXICAL[iri] ?? (() => true))(term.value);
}

/** Term equality against an index value, the way `sh:in` compares: by term, never by string. */
function sameTerm(term: Term, member: unknown): boolean {
  if (isReference(member)) {
    return member['@id'].startsWith('_:')
      ? term.termType === 'BlankNode' && term.value === member['@id'].slice(2)
      : term.termType === 'NamedNode' && term.value === member['@id'];
  }
  if (isLiteral(member)) {
    const memberDatatype = member['@language'] ? RDF_LANG_STRING : member['@type'] ?? XSD_STRING;
    return term.termType === 'Literal'
      && term.value === member['@value']
      && (term.language ?? '') === (member['@language'] ?? '')
      && datatypeOf(term) === memberDatatype;
  }
  return false;
}

// ─── The evaluation ─────────────────────────────────────────────────────────

/**
 * Parameters that are not constraints and are consumed by the shape's own
 * bookkeeping: read for a result, or read at selection, and never a thing the
 * data is judged against. Everything `sh:`-namespaced and not here and not in
 * {@link COMPONENTS} is reported unevaluated.
 */
const NOT_CONSTRAINTS: ReadonlySet<string> = new Set([
  'path', 'property', 'targetClass', 'targetSubjectsOf',
  'severity', 'message', 'name', 'description', 'flags',
]);

/**
 * Target parameters this engine does not select by. Reported where the target
 * WOULD SELECT something, never silently unselected — and never reported for
 * a shape that selected nothing, since a refusal belongs to a selected shape
 * (`ShaclReport.unevaluated`) and a shape that matched nothing in the graph
 * has nothing to refuse. `sh:targetObjectsOf` selects iff the graph carries
 * its predicate, which is checkable; `sh:targetNode` names its focus nodes
 * outright and selects them whether or not the graph mentions them, so it is
 * always reported; `sh:target` is a custom or SPARQL target this engine cannot
 * read, and is reported on the assumption that it selects.
 */
const UNSELECTED_TARGETS = ['targetNode', 'target'];

/** The component IRI a parameter reports under. */
const component = (parameter: string): string =>
  `${SH}${parameter.charAt(0).toUpperCase()}${parameter.slice(1)}ConstraintComponent`;

/**
 * A value-level check: one value node in, `true` where it satisfies the
 * parameter. `undefined` means the parameter's value is a form this engine
 * cannot read, and the parameter goes unevaluated rather than judged.
 */
type ValueCheck = (value: Term) => boolean;

class Evaluation {
  readonly results: ShaclResult[] = [];
  readonly unevaluated = new Set<string>();
  evaluated = 0;
  selected = 0;

  constructor(private readonly graph: Graph, private readonly shapes: readonly IndexedShape[]) {}

  /** Select the focus nodes a top-level shape targets, and evaluate it on each. */
  select(shape: IndexedShape): void {
    for (const target of UNSELECTED_TARGETS) {
      if (valuesOf(shape, target).length > 0) this.unevaluated.add(`${SH}${target}`);
    }
    for (const value of valuesOf(shape, 'targetObjectsOf')) {
      // Reported only where the predicate occurs, so the shape would have
      // selected its objects; a form this cannot read is reported outright.
      if (!isReference(value) || this.graph.subjectsOf(value['@id']).length > 0) {
        this.unevaluated.add(`${SH}targetObjectsOf`);
      }
    }

    const focus = new Map<string, Term>();
    const add = (term: Term): void => { focus.set(keyOf(term), term); };

    for (const value of valuesOf(shape, 'targetClass')) {
      if (isReference(value)) this.graph.instancesOf(value['@id']).forEach(add);
      else this.unevaluated.add(`${SH}targetClass`);
    }
    for (const value of valuesOf(shape, 'targetSubjectsOf')) {
      if (isReference(value)) this.graph.subjectsOf(value['@id']).forEach(add);
      else this.unevaluated.add(`${SH}targetSubjectsOf`);
    }

    this.selected += focus.size;
    for (const node of focus.values()) this.evaluateShape(shape, node);
  }

  /**
   * Evaluate one shape on one focus node.
   *
   * A shape with `sh:path` is a property shape: its value nodes are the
   * objects of the path on the focus node, and its results name the path. A
   * shape without one is a node shape: its one value node is the focus node
   * itself, and its results name no path. `sh:property` on either kind hands
   * each VALUE node to the nested shape as that shape's focus, which is what
   * makes a node shape's property shapes see the focus node, and is SHACL's
   * own reading of `sh:property` on a property shape.
   */
  private evaluateShape(shape: IndexedShape, focus: Term): void {
    const hasPath = valuesOf(shape, 'path').length > 0;
    const walkable = hasPath ? iriOf(shape, 'path') : null;

    if (walkable === undefined) {
      // A path this engine does not walk: a sequence, an alternative, an
      // inverse. NOTHING on the shape can be judged without it, so every
      // constraint it carries is reported alongside the path itself.
      this.unevaluated.add(`${SH}path`);
      for (const parameter of Object.keys(shape)) {
        if (parameter === 'id' || parameter.includes(':') || NOT_CONSTRAINTS.has(parameter)) continue;
        this.unevaluated.add(`${SH}${parameter}`);
      }
      return;
    }

    const path: string | null = walkable;
    const values = path === null ? [focus] : this.graph.objects(focus, path);
    const severity = iriOf(shape, 'severity') ?? `${SH}Violation`;
    const messages = literalsOf(shape, 'message');

    const report = (parameter: string): void => {
      this.results.push({
        focusNode: focus.value,
        path,
        sourceConstraintComponent: component(parameter),
        parameter,
        severity,
        messages,
      });
    };

    for (const parameter of Object.keys(shape)) {
      // `id`, and every full-IRI key: `rdf:type`, `rdfs:label`, `rdfs:comment`.
      // Not SHACL, not a constraint, nothing to report.
      if (parameter === 'id' || parameter.includes(':')) continue;
      if (NOT_CONSTRAINTS.has(parameter)) continue;

      switch (parameter) {
        case 'minCount':
        case 'maxCount': {
          const bound = literalOf(shape, parameter);
          if (path === null || bound === undefined) { this.unevaluated.add(`${SH}${parameter}`); break; }
          this.evaluated += 1;
          const ok = parameter === 'minCount' ? values.length >= Number(bound) : values.length <= Number(bound);
          if (!ok) report(parameter);
          break;
        }
        default: {
          const check = this.valueCheck(shape, parameter);
          if (check === undefined) { this.unevaluated.add(`${SH}${parameter}`); break; }
          this.evaluated += 1;
          for (const value of values) if (!check(value)) report(parameter);
        }
      }
    }

    for (const nested of valuesOf(shape, 'property')) {
      const propertyShape = isInlineShape(nested)
        ? nested
        : isReference(nested) ? this.shapes.find((s) => s.id === nested['@id']) : undefined;

      if (propertyShape === undefined) { this.unevaluated.add(`${SH}property`); continue; }
      for (const value of values) this.evaluateShape(propertyShape, value);
    }
  }

  /**
   * The value-level components this engine implements, each as a check over
   * one value node, or `undefined` for a parameter it does not judge — which
   * is every other `sh:` parameter, a made-up one included.
   */
  private valueCheck(shape: IndexedShape, parameter: string): ValueCheck | undefined {
    switch (parameter) {
      case 'datatype': {
        const iri = iriOf(shape, 'datatype');
        return iri === undefined ? undefined : (value) => hasDatatype(value, iri);
      }
      case 'minLength':
      case 'maxLength': {
        const bound = literalOf(shape, parameter);
        if (bound === undefined) return undefined;
        // The oracle's reading: a blank node has no string form and fails; an
        // IRI is measured as its string; length is in UTF-16 code units.
        return (value) => value.termType !== 'BlankNode'
          && (parameter === 'minLength' ? value.value.length >= Number(bound) : value.value.length <= Number(bound));
      }
      case 'pattern': {
        const pattern = literalOf(shape, 'pattern');
        if (pattern === undefined) return undefined;
        const flags = literalOf(shape, 'flags');
        // A pattern JavaScript cannot compile, or flags it does not know (the
        // SPARQL-only `q` among them), is a parameter this cannot read: it
        // goes unevaluated like every other unreadable form, rather than
        // throwing a SyntaxError out of `validate()`. Built once here, before
        // the value loop, so it is refused even for a focus node with no
        // values under the path — where the oracle, compiling per value,
        // would conform. Refusal is the permitted direction.
        let re: RegExp;
        try {
          re = flags === undefined ? new RegExp(pattern) : new RegExp(pattern, flags);
        } catch {
          return undefined;
        }
        return (value) => value.termType !== 'BlankNode' && re.test(value.value);
      }
      case 'in': {
        const [list] = valuesOf(shape, 'in');
        if (valuesOf(shape, 'in').length !== 1 || !isList(list)) return undefined;
        return (value) => list['@list'].some((member) => sameTerm(value, member));
      }
      case 'nodeKind': {
        const kind = iriOf(shape, 'nodeKind');
        if (kind === undefined || !kind.startsWith(SH)) return undefined;
        const admits: Readonly<Record<string, readonly string[]>> = {
          BlankNode: ['BlankNode', 'BlankNodeOrIRI', 'BlankNodeOrLiteral'],
          NamedNode: ['IRI', 'BlankNodeOrIRI', 'IRIOrLiteral'],
          Literal: ['Literal', 'BlankNodeOrLiteral', 'IRIOrLiteral'],
        };
        const local = kind.slice(SH.length);
        if (!Object.values(admits).some((kinds) => kinds.includes(local))) return undefined;
        return (value) => (admits[value.termType] ?? []).includes(local);
      }
      case 'or': {
        // ONLY the datatype form: every alternative an inlined shape whose one
        // parameter is a single `sh:datatype`. An alternative this engine
        // cannot judge could be the one that rescues the value, so the whole
        // disjunction goes unevaluated rather than half-judged.
        const [list] = valuesOf(shape, 'or');
        if (valuesOf(shape, 'or').length !== 1 || !isList(list)) return undefined;
        const datatypes: string[] = [];
        for (const alternative of list['@list']) {
          if (!isInlineShape(alternative)) return undefined;
          const keys = Object.keys(alternative);
          const iri = iriOf(alternative, 'datatype');
          if (keys.length !== 1 || keys[0] !== 'datatype' || iri === undefined) return undefined;
          datatypes.push(iri);
        }
        return (value) => datatypes.some((iri) => hasDatatype(value, iri));
      }
      default:
        return undefined;
    }
  }
}

/**
 * Evaluate a data graph against indexed shapes.
 *
 * Every shape in `shapes` that carries a target this engine selects by is
 * tried against the graph; the rest are reached only through `sh:property`
 * references from a selected one. The report's `unevaluated` is sorted and
 * distinct so two reports compare with `toEqual`.
 */
export function evaluate(data: readonly Quad[], shapes: readonly IndexedShape[]): ShaclReport {
  const evaluation = new Evaluation(new Graph(data), shapes);

  for (const shape of shapes) evaluation.select(shape);

  const unevaluated = [...evaluation.unevaluated].sort();

  return {
    conforms: evaluation.results.length === 0 && unevaluated.length === 0 && evaluation.evaluated > 0,
    results: evaluation.results,
    evaluated: evaluation.evaluated,
    selected: evaluation.selected,
    unevaluated,
  };
}
