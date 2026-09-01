/**
 * The vocabulary a term is declared in: the rule forms, the spec a term module
 * writes, and the outputs a term produces.
 *
 * TYPES ONLY, and it imports nothing from this folder. That is what lets every
 * other file here import it without a cycle, and it is why the split starts
 * with this one: a rule form is named in six places and defined in exactly one.
 *
 * @module terms/types
 */

export type Severity = 'error' | 'warning' | 'info';

/** How a field's value becomes RDF. */
export type FieldRule = {
  /**
   * `number` and `boolean` write a BARE Turtle token — `health:steps 8432`,
   * `cascade:isActive true` — which is what `emitField` writes for a numeric or
   * boolean field and what no combination of `literal` and `datatype` can
   * express: `literal` always quotes. A value of the wrong runtime type falls
   * back to a quoted literal, the same fall-through `emitField` takes.
   *
   * `literalList` is the quoted counterpart of `iriList`: one ordered
   * `( "a" "b" )` rather than a triple per member, which is what `emitField`'s
   * `ARRAY_FIELDS` branch writes for `drugCodes`, `affectsVitalSigns` and
   * `monitoredVitalSigns`. Without it those fields could only be migrated as
   * `literal`, and `members()` would expand each into repeated triples — a
   * silent output-shape change for anyone reading the list.
   */
  form:
    | 'literal'
    | 'number'
    | 'boolean'
    | 'iri'
    | 'iriList'
    | 'literalList'
    | 'prefixedEnum'
    | 'blankNode';
  /** `literal` only, e.g. `xsd:integer`. */
  datatype?: string;
  /**
   * `prefixedEnum` and `iriList`, e.g. `health`. Qualifies a bare local name:
   * `provenanceLayers: ['DeviceGenerated']` under `{ prefix: 'cascade' }` is
   * `cascade:DeviceGenerated`, where the unqualified form would be written
   * `<DeviceGenerated>` — a relative IRI.
   */
  prefix?: string;
  /**
   * `blankNode` only, e.g. `cascade:EmergencyContact`. Optional: a blank node
   * with no declared type is written untyped rather than carrying an empty
   * `a`, which is unparseable Turtle.
   */
  rdfType?: string;
  /**
   * `blankNode` only: the prefix this node's CHILD predicates are written
   * under, defaulting to {@link DEFAULT_NESTED_PREFIX}.
   *
   * Not decorative. `serializeBlankNode` makes the same choice out of
   * `BLANK_NODE_PREDICATE_PREFIXES`, which maps `hasParticipant` to `clinical`,
   * and clinical v1.16 declares that node's children as
   * `clinical:participantRoleCode` / `clinical:participantName`. Migrating
   * `hasParticipant` without this would write them under `cascade:` — valid
   * Turtle that every query for the declared predicate misses.
   */
  nestedPrefix?: string;
  /**
   * `blankNode` only: the node's children, each with its own rule.
   *
   * The point of declaring them is that a blank node's children are otherwise
   * DERIVED — `childrenOf` writes every key of whatever object it is handed,
   * under `nestedPrefix`. That makes the writer authoritative and undeclarable,
   * so every other consumer has to be told separately what it produces: the
   * deserializer's reverse map and the JSON-LD context each carried their own
   * copy of these twelve.
   *
   * Declaring them also gives a child a FORM, which is what `nestedOutputs`
   * lacks — it dispatches on the runtime type, so a nested `5` writes a bare
   * token where `serializeBlankNode` writes `"5"^^xsd:integer` for the same
   * field. Same triple, different bytes, and `pod-002` is asserted byte-for-byte.
   *
   * Optional: a rule without it keeps the old derive-everything behavior, so
   * the two can be migrated one term at a time.
   */
  children?: Record<string, FieldRule>;
  /**
   * `blankNode` only: the rule for a member that is NOT a nested object.
   *
   * Absent — the usual case — a scalar under a node rule THROWS, because it has
   * no faithful output: see the `blankNode` case of {@link outputsForMember}.
   * That is right for `cascade:address`, whose model declares an `Address`
   * object and for which core.ttl offers `cascade:addressText` as the separate
   * flat predicate.
   *
   * It is wrong for an object property that ALSO has a legitimate flat form.
   * `ExportManifest.clinicalSummary` is typed `string` and documented as "IRI
   * of the RecordSummary", and the serializer's `URI_FIELDS` has written it as
   * `cascade:clinicalSummary <urn:uuid:...>` since core v3.4. The node rule must
   * not turn a type-correct call into an error, so the term declares the other
   * form rather than the rule guessing at it: an IRI reference and an inline
   * node are both faithful readings of `cascade:clinicalSummary`, and which one
   * a caller meant is legible from the value they passed.
   *
   * Declared per term, never derived, so a field that has only the nested form
   * keeps the throw. An ARRAY member is still an error whatever this says —
   * that case is a nesting mistake, not a flat spelling.
   */
  scalarRule?: FieldRule;
  /**
   * A CHILD rule only: the predicate this child is written under, where the
   * node's {@link nestedPrefix} is not it.
   *
   * `nestedPrefix` is one prefix for a whole blank node, which holds while every
   * child is a property of the node's own class. An INHERITED property breaks
   * it: `cascade:RecordSummary` extends `CascadeEntity`, so a summary carries
   * `sourceRecordId` and `businessIdentifier`, registered `health:` and
   * `clinical:` respectively, and the node prefix wrote both under `cascade:` —
   * predicates nothing declares, beside a top level spelling the same two
   * fields correctly in the same document.
   *
   * Re-prefixes, never authors: {@link defineTerm} checks the local name against
   * the one `PROPERTY_PREDICATES` registers for the child key, exactly as
   * `predicateByType` is checked. A child that needs a name the vocabulary does
   * not have needs a vocabulary change first.
   */
  predicate?: string;
};

/** The declaration a term module exports. */
export type TermSpec = {
  /** The JSON field name. */
  key: string;
  /** From {@link requirePredicate}, never a literal. */
  predicate: string;
  /**
   * recordType -> predicate. Values are checked at {@link defineTerm} time; a
   * term may no more author vocabulary here than it can in `predicate`.
   */
  predicateByType?: Record<string, string>;
  rule: FieldRule;
  /** recordType -> rule. */
  ruleByType?: Record<string, FieldRule>;
  /**
   * How many values the vocabulary permits — `sh:maxCount` from the shapes.
   *
   * Read by the validator, never by the writer. `serialize()` stays faithful to
   * whatever it is handed: a writer that refused a record over cardinality could
   * not write `lab-013`, and that fixture exists to be written and then rejected.
   *
   * ABSENT MEANS UNCONSTRAINED, and that is a real answer rather than a gap.
   * `cascade:emergencyContact` has no `sh:maxCount` on
   * `cascade:PatientProfileShape` — a profile may name several people to call —
   * where `cascade:address` and `cascade:preferredPharmacy` beside it are both
   * capped at one. Three fields that look identical here and are not.
   */
  maxCount?: number;
  /**
   * The values the vocabulary admits — `sh:in` from the shapes.
   *
   * Flat, unlike {@link minCountByType}, because a value set does not vary by
   * record type in practice: `health:interpretation`'s 74 codes are the same
   * list on `LabResultRecordShape`, `LabResultShape` and `VitalSignShape`.
   * Checked only when the field is PRESENT, so an absent optional raises
   * nothing here.
   */
  values?: readonly string[];
  /**
   * The shortest a value may be — `sh:minLength` from the shapes.
   *
   * Flat, like {@link TermSpec.values} and {@link TermSpec.maxCount} beside it,
   * and measurement says flat is the whole truth: 30 `sh:property` blocks across
   * the four shapes files `spec` publishes declare an `sh:minLength`, over 28 distinct
   * predicates, and EVERY ONE OF THEM IS 1. The two predicates that appear in
   * more than one shape — `dct:title` and `health:conditionName` — carry the
   * same value in both. There is no per-type variation to model, the way there
   * is for {@link TermSpec.minCountByType}.
   *
   * A FACT ABOUT THE PREDICATE, which is why it lives here rather than in a
   * validator's `Constraints` table. `clinical:ProcedureShape` is the case that
   * proves the two are different questions: `clinical:procedureName` carries an
   * `sh:minLength 1` and NO `sh:minCount`, so an absent procedure name conforms
   * and a present empty one does not. A term judges the values a record
   * carries; whether it must carry one at all belongs to the record type.
   *
   * CHARACTERS, NOT CONTENT. SHACL's condition is the length of the value node
   * after conversion to string, so `"  "` is length 2 and conforms. This does
   * not trim, and must not: a whitespace-only name is a real data defect and
   * `sh:minLength` is not the constraint that states it — `sh:pattern` is, and
   * no shape declares one. Trimming here would reject records `pyshacl` accepts,
   * which is the divergence `tests/support/fixture-contract.ts` exists to catch.
   */
  minLength?: number;
  /**
   * recordType -> the severity this term's rules are reported at, defaulting
   * to `'error'` for every type not named.
   *
   * `sh:severity`, which is not a decoration on a message. A shape declaring
   * `sh:severity sh:Warning` is saying the value is REPORTED and not rejected,
   * and `validate()` computes `valid` from `errors` alone — so a rule reported
   * at the wrong severity does not merely mislabel a finding, it flips the
   * verdict on the record.
   *
   * PER RECORD TYPE, exactly like {@link TermSpec.predicateByType} beside it
   * and for the same reason: a constraint lives inside one node shape.
   * `clinical:LabResultShape` and `health:LabResultRecordShape` bind
   * `interpretation`'s 74 codes with no `sh:severity` — sh:Violation, SHACL's
   * default — and `clinical:VitalSignShape` binds the byte-identical list at
   * `sh:Warning`, because emitted vital data carries "elevated" and core v3.5's
   * ratchet reports such a value rather than rejecting it until a later
   * clinical version raises it. One list, two verdicts, decided by the class.
   *
   * NOT PER RULE, which is the granularity SHACL does not have.
   * `clinical.shapes.ttl:43`: "sh:severity is a property of the shape a
   * constraint belongs to and cannot be applied to one nested result." So one
   * `sh:property` block's `sh:datatype`, `sh:maxCount` and `sh:in` all report
   * at that block's severity — measured on a vital sign breaking all three at
   * once, every result comes back Warning — and this field governs every rule
   * the term declares for the type, not just its value set. A shape wanting two
   * severities on one path has to split into two property shapes, and a term
   * that had to mirror that would need two entries, not a per-rule map.
   */
  severityByType?: Record<string, Severity>;
  /**
   * recordType -> `sh:minCount`. Per type, and it has to be: a shape's
   * `sh:minCount` sits inside one node shape, so `cascade:dateOfBirth` is
   * required of a `cascade:PatientProfile` and means nothing on a lab result.
   * A flat `minCount` would demand every field of every record.
   */
  minCountByType?: Record<string, number>;
};

/** One triple-shaped thing a term asks the builder to write. */
export type Output =
  | { kind: 'literal'; predicate: string; value: string; datatype?: string }
  /** A bare numeric token: `health:steps 8432`, `health:durationHours 7.4`. */
  | { kind: 'number'; predicate: string; value: number }
  /** A bare `true` / `false`, never a quoted literal. */
  | { kind: 'boolean'; predicate: string; value: boolean }
  | { kind: 'uri'; predicate: string; value: string }
  | { kind: 'uriList'; predicate: string; items: string[] }
  /** An ordered `rdf:List` of QUOTED literals: `clinical:drugCode ( "a" "b" )`. */
  | { kind: 'list'; predicate: string; items: string[] }
  /** `rdfType` absent means an untyped blank node, not an empty `a`. */
  | { kind: 'blankNode'; predicate: string; rdfType?: string; children: Output[] };

export type Term = TermSpec & {
  /**
   * Reads `record[key]` itself, and `record.type` to resolve
   * `predicateByType` / `ruleByType`. Returns `[]` when the field is absent.
   */
  outputsFor(record: Record<string, unknown>): Output[];

  /**
   * The same field, as it belongs in a JSON-LD document. `undefined` when the
   * field is absent, which is what `outputsFor` says with `[]`.
   *
   * Takes the RECORD, like `outputsFor`, so resolving `ruleByType` stays here
   * rather than at each call site. A caller that had to pull the value and the
   * record type out itself would be a second place that knows how a term
   * resolves, which is how the two come to disagree.
   */
  jsonLdFor(record: Record<string, unknown>): unknown;

  /**
   * One field's value read back off a JSON-LD document — the inverse of
   * {@link Term.jsonLdFor}.
   *
   * Takes the value rather than the document: the reader has already matched
   * the key, and handing the whole document back would invite a second lookup
   * of the field it just found.
   */
  fromJsonLdValue(value: unknown, recordType?: string): unknown;
};

/** The prefix a blank node's nested fields are written under by default. */
export const DEFAULT_NESTED_PREFIX = 'cascade';

