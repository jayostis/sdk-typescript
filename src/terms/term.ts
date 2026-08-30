/**
 * One field, one module: the predicate, the rule for writing it, and the
 * per-record-type variations of both, in a single declaration.
 *
 * A term produces DATA, not side effects. {@link Term.outputsFor} returns what
 * should be written and the builder writes it, so term logic is pure and
 * testable with no serializer present, and the table stays diffable against
 * `spec`'s shapes.
 *
 * @module terms
 */

import { NAMESPACES, PROPERTY_PREDICATES } from '../vocabularies/namespaces.js';

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
  severityByType?: Record<string, 'error' | 'warning'>;
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
};

/** The prefix a blank node's nested fields are written under by default. */
export const DEFAULT_NESTED_PREFIX = 'cascade';

/** `prefix:localName`, the only shape a term may spell a predicate in. */
const PREFIXED_NAME = /^([A-Za-z][\w-]*):([\w-]+)$/;

/**
 * Read a key's OWN value out of a lookup table, never an inherited one.
 *
 * `predicateByType` and `ruleByType` are plain object literals indexed by
 * DATA — `record.type` — so a record typed `'toString'`, `'constructor'` or
 * `'valueOf'` would otherwise resolve `Object.prototype`'s member as though a
 * term had declared it. `?? predicate` does not catch that: a function is not
 * nullish, and it reaches the Turtle as
 * `function toString() { [native code] }`, which does not parse.
 * {@link requirePredicate} guards its own lookup for the same reason.
 */
function ownEntry<T>(table: Record<string, T> | undefined, key: string | undefined): T | undefined {
  if (table === undefined || key === undefined) return undefined;
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
}

/**
 * The predicate a term writes a record of `recordType` under: its per-type
 * override where one is declared, else its registered predicate.
 *
 * Exported because TWO callers need this answer, and a second implementation of
 * it is how they drift. `outputsFor` decides which predicate reaches the subject
 * block; the serializer's `collectPrefixes` decides which `@prefix` lines the
 * document declares. A subject block written under a prefix the header never
 * declared is not a wrong triple — it is a document that does not parse, and it
 * fails on the whole record rather than on the one field.
 *
 * Takes a {@link TermSpec} rather than a {@link Term}, so it can be asked before
 * {@link defineTerm} has built one.
 */
export function predicateFor(spec: TermSpec, recordType: string | undefined): string {
  return ownEntry(spec.predicateByType, recordType) ?? spec.predicate;
}

/**
 * Resolve a JSON field name to its registered predicate.
 *
 * `PROPERTY_PREDICATES` mirrors `spec`'s TTL, and vocabulary is never authored
 * in a term file: this is the only way a spec gets a predicate. An unknown key
 * throws rather than resolving to a silent blank, so a term declared against a
 * field nobody registered takes its own module down at load time.
 *
 * A RUNTIME check, and it cannot be anything else: `PROPERTY_PREDICATES` is
 * annotated `Record<string, string>`, so `requirePredicate('notAThing')` compiles
 * clean.
 *
 * @throws when `key` is not registered in `PROPERTY_PREDICATES`.
 */
export function requirePredicate(key: string): string {
  if (!Object.prototype.hasOwnProperty.call(PROPERTY_PREDICATES, key)) {
    throw new Error(
      `Unknown field '${key}': register it in PROPERTY_PREDICATES ` +
        `(src/vocabularies/namespaces.ts) first, from the class definition in ` +
        `spec. A term references its predicate; it never declares one.`,
    );
  }
  return PROPERTY_PREDICATES[key] as string;
}

/**
 * Check one `predicateByType` value the way {@link requirePredicate} checks a
 * key, and for the same reason: a term references vocabulary, it never declares
 * any. Without this the override map is free-form string nothing validates.
 *
 * An override is a RE-PREFIXING of the registered predicate and nothing else.
 * That rule is not invented here — every entry in the serializer's
 * `TYPE_PREDICATE_OVERRIDES` moves the same local name to another namespace:
 * `snomedCode` from `health:` to `clinical:`, `notes` from `health:` to
 * `cascade:`, `status` from `health:` to `coverage:`. Both halves are checked
 * because both are silent when wrong. A mistyped prefix
 * (`clincal:snomedCode`) writes an undeclared prefix, and the whole document
 * stops parsing; a mistyped local name (`clinical:snomedCoed`) writes valid
 * Turtle under a predicate no shape constrains and no query finds.
 *
 * If an override ever genuinely has to rename the local part, this throws at
 * load time and says what it saw — which is the point. It is a rule to be
 * revisited deliberately, not routed around in silence.
 *
 * @throws when `value` is not `prefix:localName`, when its prefix is not a
 * declared namespace, or when its local name is not the one `key` is
 * registered under.
 */
function requireOverridePredicate(key: string, recordType: string, value: string): string {
  return requireReprefixed(
    key,
    value,
    (registered, why) =>
      `predicateByType['${recordType}'] for field '${key}' is '${value}': ${why}. ` +
      `A per-type override re-prefixes the registered predicate ` +
      `('${registered}'); it never declares a new one.`,
  );
}

/**
 * The same rule for a CHILD's {@link FieldRule.predicate}.
 *
 * A child predicate is a re-prefixing for the identical reason a per-type
 * override is — `sourceRecordId` moves from the node's `cascade:` to the
 * `health:` the vocabulary registers — and both halves are silent when wrong in
 * the identical way. Sharing the check rather than restating it is what keeps
 * the two from drifting into different notions of what a term may declare.
 */
function requireChildPredicate(termKey: string, childKey: string, value: string): string {
  return requireReprefixed(
    childKey,
    value,
    (registered, why) =>
      `children['${childKey}'].predicate on term '${termKey}' is '${value}': ${why}. ` +
      `A child predicate re-prefixes the registered predicate ` +
      `('${registered}'); it never declares a new one.`,
  );
}

/** The shared body of both re-prefixing checks; `describe` names the caller's field. */
function requireReprefixed(
  key: string,
  value: string,
  describe: (registered: string, why: string) => string,
): string {
  const registered = requirePredicate(key);
  const expected = PREFIXED_NAME.exec(registered)?.[2];

  const reject = (why: string): never => {
    throw new Error(describe(registered, why));
  };

  const parsed = PREFIXED_NAME.exec(value);
  if (parsed === null) reject(`not a prefixed name of the form 'prefix:localName'`);

  const [, prefix, localName] = parsed as RegExpExecArray;
  if (!Object.prototype.hasOwnProperty.call(NAMESPACES, prefix as string)) {
    reject(`'${prefix}' is not a namespace declared in NAMESPACES`);
  }
  if (expected !== undefined && localName !== expected) {
    reject(`'${localName}' is not the local name '${key}' is registered under ('${expected}')`);
  }

  return value;
}

/** Present enough to write: `null` and `undefined` are absent, `0` and `''` are not. */
function present(value: unknown): boolean {
  return value !== undefined && value !== null;
}

/** Every member of an array value, or the bare scalar as a one-member list. */
function members(value: unknown): unknown[] {
  return (Array.isArray(value) ? value : [value]).filter(present);
}

/** A value with fields to write as a blank node's children — not a scalar, not an array. */
function isNestedObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Nested keys that describe the sub-structure rather than a triple in it.
 *
 * `serializeBlankNode` skips both: a blank node's children are `type`-free
 * fields under one vocabulary, and writing `cascade:type "RecordSummary"` would
 * invent a triple no shape declares.
 */
const NESTED_SKIP = new Set(['type', 'id']);

/**
 * A nested field's outputs, chosen by the value's RUNTIME type — the same
 * dispatch `serializeBlankNode` does across `b.literal` / `b.boolean` /
 * `b.number` / `b.decimal`. Stringifying every value instead would change a
 * nested `42` from an xsd:integer to an xsd:string.
 *
 * Plural because arity is part of that dispatch. An ARRAY is one output per
 * member — the repeated-predicate form `serializeBlankNode` writes for a 0..*
 * nested field. Clinical v1.16's `participantRoleCode: ['ATND', 'REF']` is two
 * `clinical:participantRoleCode` triples; joined into `"ATND,REF"` it is one
 * literal no consumer can split back apart, and an emergency contact's two
 * phone numbers would be one unusable string. A nested OBJECT yields nothing,
 * again matching `serializeBlankNode`, whose chain covers `string` / `boolean`
 * / `number` and leaves a child object unwritten rather than stamping
 * `[object Object]` into the graph.
 *
 * This is the UNDECLARED path only. A child with a rule goes through
 * {@link outputsForMember}, which THROWS on an object instead of skipping —
 * a declaration is something an object can contradict, and a rule names the
 * field it belongs to.
 */
function nestedOutputs(predicate: string, value: unknown): Output[] {
  if (Array.isArray(value)) {
    return value.filter(present).flatMap((member) => nestedOutputs(predicate, member));
  }
  if (typeof value === 'boolean') return [{ kind: 'boolean', predicate, value }];
  if (typeof value === 'number') return [{ kind: 'number', predicate, value }];
  if (typeof value === 'object') return [];
  return [{ kind: 'literal', predicate, value: String(value) }];
}

/**
 * The children of a blank node.
 *
 * EVERY present key is written. A declared child gets its rule's form; an
 * undeclared one is written by runtime type, exactly as a term with no
 * `children` map writes all of them.
 *
 * `rule.children` used to be a filter as well as a declaration — an undeclared
 * key was dropped here, to stop the next `cascade:contactEmail` being emitted
 * under no domain, no range and no shape. It stopped the triple and not the
 * defect: the caller's value vanished with no error, and the record reached
 * `validate()` with nothing left to violate. Two of the five children this term
 * was missing hid behind exactly that silence until someone counted them
 * against the shape.
 *
 * The refusal now happens where it can be seen. `undeclaredChildKeys` reports
 * the same keys to `validate()`, which is the only judge that ships, and the
 * writer stays faithful — which is the whole position of this SDK: a shape can
 * judge only what reached the graph.
 */
function childrenOf(value: unknown, rule: FieldRule): Output[] {
  if (!isNestedObject(value)) return [];
  const prefix = rule.nestedPrefix ?? DEFAULT_NESTED_PREFIX;
  const declared = rule.children;

  return Object.entries(value)
    .filter(([nestedKey, nested]) => !NESTED_SKIP.has(nestedKey) && present(nested))
    .flatMap(([nestedKey, nested]) => {
      const childRule = ownEntry(declared, nestedKey);
      const predicate = childPredicateFor(nestedKey, prefix, childRule);
      return childRule
        ? members(nested).flatMap((m) => outputsForMember(m, nestedKey, predicate, childRule))
        : nestedOutputs(predicate, nested);
    });
}

/**
 * A nested key discriminated as an absolute IRI rather than a JSON name.
 *
 * `://` is the whole test, and it is reliable in both directions: no field name
 * in any Cascade model contains it, and every predicate IRI the parser can hand
 * back does. A scheme-prefix test would be worse, not better — it matches
 * `cascade:contactName`, which is exactly the case that must NOT be treated
 * this way.
 */
const isAbsoluteIri = (key: string): boolean => key.includes('://');

/**
 * The predicate a nested key is written under.
 *
 * Normally the abbreviation, `prefix:key`. An ABSOLUTE IRI key is written as
 * itself, in angle brackets, and that is not an edge case dressed up — it is
 * the only faithful spelling available for two kinds of child the reader can
 * legitimately return:
 *
 *   A predicate from ANOTHER NAMESPACE. `<https://other.example.org/ns#wardCount>`
 *   abbreviated under this node's prefix becomes `cascade:wardCount`, a
 *   different predicate. Turtle can say the original perfectly well; only the
 *   abbreviation cannot.
 *
 *   A local name PN_LOCAL does not admit. `cascade:odd(name)` does not parse,
 *   while `<https://ns.cascadeprotocol.org/core/v1#odd(name)>` is valid Turtle
 *   saying the same thing. The limit was this writer's spelling, never the
 *   format's.
 *
 * Which is the general shape of the rule: an abbreviation is a convenience, and
 * where it cannot express what the document said, the long form is used rather
 * than the value dropped. JSON-LD reads an absolute-IRI key the same way, so
 * the JSON stays as faithful as the Turtle.
 *
 * A declared child's own {@link FieldRule.predicate} overrides both, and is the
 * only way a node's children can span namespaces. `nestedPrefix` is one prefix
 * for the whole node, which is right while every child is the node class's own
 * property and wrong the moment it INHERITS one: a `cascade:RecordSummary`
 * reaches `sourceRecordId` through `CascadeEntity`, registered
 * `health:sourceRecordId`, and the node prefix wrote `cascade:sourceRecordId` —
 * a predicate no ontology declares, for a value the top level spells correctly
 * in the same document.
 *
 * Not derived from `PROPERTY_PREDICATES`, though it looks like it could be. A
 * `RecordSummary`'s `notes` is `cascade:notes` and the registered spelling is
 * `health:notes` — the serializer's `TYPE_PREDICATE_OVERRIDES` already carries
 * that fork — so a lookup by key alone would be right for `sourceRecordId` and
 * wrong for `notes`, silently. Declared per term, like `scalarRule`, and
 * checked at {@link defineTerm} against the registered local name so a term can
 * re-prefix vocabulary and never author it.
 *
 * Exported because the WRITER is not its only caller. `serializeBlankNode`
 * writes the nested fields no term claims yet, and `validate()` names the
 * predicate it is refusing — three callers that have to agree on one spelling,
 * where a second implementation is how they drift. `serializeBlankNode` had
 * `${nsPrefix}:${k}` inline and emitted `cascade:https://other.example.org/ns#wardCount`
 * for a foreign child the faithful reader now keeps: not a wrong triple, an
 * unparseable document.
 */
export function childPredicateFor(
  nestedKey: string,
  prefix: string,
  childRule?: FieldRule,
): string {
  if (childRule?.predicate) return childRule.predicate;
  return isAbsoluteIri(nestedKey) ? `<${nestedKey}>` : `${prefix}:${nestedKey}`;
}

/**
 * The keys of a nested object that the rule declares no child for.
 *
 * The writer's counterpart, and deliberately the same walk: `NESTED_SKIP`,
 * `present` and `ownEntry` are applied here exactly as `childrenOf` applies
 * them, so the two cannot disagree about which keys are in play. A key this
 * returns is one that WAS written, under a predicate no `sh:path` declares.
 *
 * EMPTY for a rule with no `children` map. An undeclared-children term has not
 * said what its children are, so nothing about the object contradicts it —
 * `wellnessSummary` is not judged for carrying what `clinicalSummary` is judged
 * for, because only one of the two has made a declaration to violate.
 *
 * Every member of an array, not just the first: a profile may name several
 * emergency contacts and the second one's spelling is as wrong as the first's.
 */
export function undeclaredChildKeys(rule: FieldRule, value: unknown): string[] {
  if (!rule.children) return [];

  const seen = new Set<string>();
  for (const member of members(value)) {
    if (!isNestedObject(member)) continue;
    for (const [nestedKey, nested] of Object.entries(member)) {
      if (NESTED_SKIP.has(nestedKey) || !present(nested)) continue;
      if (ownEntry(rule.children, nestedKey)) continue;
      seen.add(nestedKey);
    }
  }
  return [...seen];
}

/**
 * The child predicates a blank-node rule will actually WRITE for `value`.
 *
 * For `collectPrefixes`, which decides the `@prefix` lines the header declares
 * while `childrenOf` decides what the subject block writes — the same two
 * halves of one document `predicateFor` exists to keep in agreement, one level
 * down. Every child took the node's `nestedPrefix` until a child could
 * re-prefix, and a node written under `cascade:` now carries
 * `health:sourceRecordId`: a prefix the header never declared is not a wrong
 * triple, it is a document that does not parse.
 *
 * The keys PRESENT in the value, not the declared ones. An `@prefix` line for a
 * child nobody set is an unused declaration, and `pod-002` is asserted
 * byte-for-byte.
 *
 * Deliberately the same walk as {@link undeclaredChildKeys} — `NESTED_SKIP`,
 * `present`, `members`, `childPredicateFor` — so the header, the writer and the
 * validator cannot disagree about which children are in play.
 */
export function childPredicatesIn(rule: FieldRule, value: unknown): string[] {
  if (rule.form !== 'blankNode') return [];
  const prefix = rule.nestedPrefix ?? DEFAULT_NESTED_PREFIX;

  const seen = new Set<string>();
  for (const member of members(value)) {
    if (!isNestedObject(member)) continue;
    for (const [nestedKey, nested] of Object.entries(member)) {
      if (NESTED_SKIP.has(nestedKey) || !present(nested)) continue;
      seen.add(childPredicateFor(nestedKey, prefix, ownEntry(rule.children, nestedKey)));
    }
  }
  return [...seen];
}

/**
 * The severity every rule this term declares reports at, for this record type.
 *
 * `error` is the default because SHACL's is `sh:Violation`: a shape that says
 * nothing about severity is rejecting, not reporting.
 *
 * One function rather than the expression written out at each call site, and
 * that is what the finding was. `maxCount` and `values` resolved it and the
 * `minCountByType` loop hardcoded `'error'` beside them — latent only because
 * no term declares both `severityByType` and `minCountByType` today. The day
 * one does, a shape saying "reported, not rejected" would have REJECTED, and
 * since `valid` is computed from `errors` alone that is a conformant record
 * refused. A default spelled once cannot be honoured in two places and not a
 * third.
 */
export function severityFor(
  spec: TermSpec,
  recordType: string | undefined,
): 'error' | 'warning' {
  return ownEntry(spec.severityByType, recordType) ?? 'error';
}

/** The rule a term applies to a record of this type, resolving `ruleByType`. */
export function ruleFor(spec: TermSpec, recordType: string | undefined): FieldRule {
  return ownEntry(spec.ruleByType, recordType) ?? spec.rule;
}

/**
 * A blank-node term's child predicates, `childKey -> prefix:localName`.
 *
 * The one place these are written down, and what the deserializer's reverse map
 * and the JSON-LD context are both built from. Empty for a term that has not
 * declared its children, so the two schemes coexist during migration.
 *
 * Through {@link childPredicateFor} rather than interpolating the prefix here,
 * so the reader is built from the spelling the writer actually emits. A second
 * copy of that decision is how the reverse map came to disagree with the writer
 * in the first place.
 */
export function childPredicatesOf(spec: TermSpec): Record<string, string> {
  const { rule } = spec;
  if (rule.form !== 'blankNode' || !rule.children) return {};
  const prefix = rule.nestedPrefix ?? DEFAULT_NESTED_PREFIX;
  return Object.fromEntries(
    Object.entries(rule.children).map(([childKey, childRule]) => [
      childKey,
      childPredicateFor(childKey, prefix, childRule),
    ]),
  );
}

/**
 * One member of a value, under an already-resolved predicate and rule.
 *
 * Returns a LIST because a rule form can produce several outputs from one
 * member, not because any of them may produce none.
 *
 * Takes `key` only to name the field in the `blankNode` error. The predicate
 * alone is not enough: a caller debugging their record is holding JSON keyed on
 * `address`, and `cascade:address` is a spelling they may never have seen.
 */
function outputsForMember(
  member: unknown,
  key: string,
  predicate: string,
  rule: FieldRule,
): Output[] {
  // An OBJECT under any rule but `blankNode` has no faithful output, so it is
  // an ERROR rather than the two wrong graphs on either side of it.
  //
  // This is the guard {@link nestedOutputs} still has and the declared-child
  // path had lost: that function returns [] for a child object, and its comment
  // says why — "leaves a child object unwritten rather than stamping
  // [object Object] into the graph". A child with a DECLARED rule never reaches
  // it, and `literal`'s `String(member)` wrote `cascade:addressLine
  // "[object Object]"`: a literal that reads as data, is not, and that no shape
  // can tell from a real one.
  //
  // It THROWS where `nestedOutputs` skips, and the difference is the rule. A
  // declared child says what form the value takes, so an object contradicts a
  // declaration and the term can name the field; an undeclared one dispatches on
  // the runtime type with nothing to contradict. Skipping here would be the
  // silent half-write instead — the node written, one child gone, nothing
  // reported. This is the same position the `blankNode` case below takes on the
  // mirror-image value, for the same reason.
  if (rule.form !== 'blankNode' && isNestedObject(member)) {
    throw new Error(
      `Field '${key}' (predicate ${predicate}) is declared as a ${rule.form}, ` +
        `but was given an object. A scalar rule has no faithful form for one: ` +
        `String(value) writes "[object Object]" into the graph. Pass a value of ` +
        `the declared form, or declare the field as a blank node with children.`,
    );
  }

  switch (rule.form) {
    case 'iri':
      return [{ kind: 'uri', predicate, value: String(member) }];
    case 'prefixedEnum':
      return [
        {
          kind: 'uri',
          predicate,
          value: rule.prefix ? `${rule.prefix}:${String(member)}` : String(member),
        },
      ];
    case 'number':
      // Not `Number(member)`: `emitField` takes its numeric branch only for a
      // value that already IS a number, and falls through to a quoted literal
      // otherwise. Coercing here would write a bare token for the string
      // '8432' where the existing writer writes "8432".
      return typeof member === 'number' && Number.isFinite(member)
        ? [{ kind: 'number', predicate, value: member }]
        : [{ kind: 'literal', predicate, value: String(member) }];
    case 'boolean':
      return typeof member === 'boolean'
        ? [{ kind: 'boolean', predicate, value: member }]
        : [{ kind: 'literal', predicate, value: String(member) }];
    case 'blankNode': {
      // A scalar under a blankNode rule has no faithful output, so it is an
      // ERROR rather than a choice between two wrong graphs. Writing the node
      // anyway gives an anonymous `[ ]` asserting nothing, with the value it
      // was built from dropped; writing nothing gives a document missing the
      // field, with no error and no partial output to notice. `emitField`
      // already takes this position for an array-valued field with no rule, and
      // for the same reason: a caller is owed an error naming the field instead
      // of a graph that quietly disagrees with what they passed.
      //
      // Not a far-fetched input. core.ttl offers `cascade:addressText` and
      // `cascade:pharmacyAddress` as the flat single-string counterparts of
      // the nested nodes, so a caller reaching for the flat pattern is reaching
      // for something spec describes — and TypeScript does not stop them, since
      // a JS caller has no compile-time protection at all.
      //
      // Thrown per MEMBER, so a mixed array fails rather than serializing the
      // object members and discarding the scalar ones. A partial list is the
      // hardest form of this to see: what comes back is well-formed.
      if (!isNestedObject(member)) {
        // Unless the term declared the flat form. An IRI reference and an
        // inline node are both faithful readings of an object property, and
        // `scalarRule` is where a term says its field has both — see the field
        // on {@link FieldRule}. Never for an ARRAY member: that is a nesting
        // mistake rather than a flat spelling, and it keeps the throw.
        if (rule.scalarRule && !Array.isArray(member)) {
          return outputsForMember(member, key, predicate, rule.scalarRule);
        }
        throw new Error(
          `Field '${key}' (predicate ${predicate}) is declared as a blank node, ` +
            `but was given ${Array.isArray(member) ? 'an array' : `a ${typeof member}`}. ` +
            `A blankNode rule writes the fields of a nested object as the node's ` +
            `children; pass an object, or use the flat predicate spec declares ` +
            `for the single-string form of this structure.`,
        );
      }
      const children = childrenOf(member, rule);
      // An absent `rdfType` leaves the field off entirely. Carrying `''` would
      // reach `b.type('')` and emit a bare `a`, which does not parse.
      return [
        rule.rdfType
          ? { kind: 'blankNode', predicate, rdfType: rule.rdfType, children }
          : { kind: 'blankNode', predicate, children },
      ];
    }
    case 'literal':
    default:
      return [
        rule.datatype
          ? { kind: 'literal', predicate, value: String(member), datatype: rule.datatype }
          : { kind: 'literal', predicate, value: String(member) },
      ];
  }
}

/**
 * Build a term from its declaration.
 *
 * `outputsFor` closes over the spec rather than reading `this`, so a
 * destructured `outputsFor` still works; the spread leaves `key`, `predicate`
 * and `rule` on the object as plain data, so the table stays dumpable and
 * diffable against `spec`'s shapes.
 *
 * @throws when a `predicateByType` value is not a re-prefixing of the
 * registered predicate. Checked HERE, at declaration, so a bad override takes
 * its own module down at load time rather than writing bad Turtle at runtime.
 */
export function defineTerm(spec: TermSpec): Term {
  const { key, predicateByType } = spec;

  // Not a duplicate of the caller's `requirePredicate(key)` in the common case:
  // `predicate` is a plain string, so a term can be declared with one written
  // out by hand and never reach that check. Asserting the key here means a term
  // keyed on a field spec does not define cannot be constructed at all.
  requirePredicate(key);

  for (const [recordType, override] of Object.entries(predicateByType ?? {})) {
    requireOverridePredicate(key, recordType, override);
  }

  // Every rule the term can apply, not just `spec.rule`: a `ruleByType` entry
  // declares children of its own and an unchecked one is the same free-form
  // string the `predicateByType` check exists to refuse.
  for (const rule of [spec.rule, ...Object.values(spec.ruleByType ?? {})]) {
    for (const [childKey, childRule] of Object.entries(rule.children ?? {})) {
      if (childRule.predicate !== undefined) {
        requireChildPredicate(key, childKey, childRule.predicate);
      }
    }
  }

  return {
    ...spec,
    outputsFor(record: Record<string, unknown>): Output[] {
      const value = record[key];
      if (!present(value)) return [];

      const recordType = typeof record.type === 'string' ? record.type : undefined;
      const activePredicate = predicateFor(spec, recordType);
      const activeRule = ruleFor(spec, recordType);

      if (activeRule.form === 'iriList') {
        // The prefix applies here exactly as it does to `prefixedEnum`:
        // `emitField` maps each `provenanceLayers` member to `cascade:${item}`,
        // and an unqualified `DeviceGenerated` would be written as the relative
        // IRI `<DeviceGenerated>`.
        const items = members(value).map((member) =>
          activeRule.prefix ? `${activeRule.prefix}:${String(member)}` : String(member),
        );
        return items.length === 0 ? [] : [{ kind: 'uriList', predicate: activePredicate, items }];
      }

      if (activeRule.form === 'literalList') {
        // No prefix branch, unlike `iriList`: these members are quoted
        // literals, and a prefix on a literal is part of the string rather
        // than a namespace.
        const items = members(value).map(String);
        return items.length === 0 ? [] : [{ kind: 'list', predicate: activePredicate, items }];
      }

      return members(value).flatMap((member) =>
        outputsForMember(member, key, activePredicate, activeRule),
      );
    },
  };
}
