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

import { PROPERTY_PREDICATES } from '../vocabularies/namespaces.js';

/** How a field's value becomes RDF. */
export type FieldRule = {
  /**
   * `number` and `boolean` write a BARE Turtle token — `health:steps 8432`,
   * `cascade:isActive true` — which is what `emitField` writes for a numeric or
   * boolean field and what no combination of `literal` and `datatype` can
   * express: `literal` always quotes. A value of the wrong runtime type falls
   * back to a quoted literal, the same fall-through `emitField` takes.
   */
  form: 'literal' | 'number' | 'boolean' | 'iri' | 'iriList' | 'prefixedEnum' | 'blankNode';
  /** Accept an array OR a bare scalar, and write one triple per value. */
  many?: boolean;
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
};

/** The declaration a term module exports. */
export type TermSpec = {
  /** The JSON field name. */
  key: string;
  /** From {@link predicateOf}, never a literal. */
  predicate: string;
  /** recordType -> predicate. */
  predicateByType?: Record<string, string>;
  rule: FieldRule;
  /** recordType -> rule. */
  ruleByType?: Record<string, FieldRule>;
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
  /** `rdfType` absent means an untyped blank node, not an empty `a`. */
  | { kind: 'blankNode'; predicate: string; rdfType?: string; children: Output[] };

export type Term = TermSpec & {
  /**
   * Reads `record[key]` itself, and `record.type` to resolve
   * `predicateByType` / `ruleByType`. Returns `[]` when the field is absent.
   */
  outputsFor(record: Record<string, unknown>): Output[];
};

/** The prefix a blank node's nested fields are written under. */
const NESTED_PREFIX = 'cascade';

/**
 * Resolve a JSON field name to its registered predicate.
 *
 * `PROPERTY_PREDICATES` mirrors `spec`'s TTL, and vocabulary is never authored
 * in a term file: this is the only way a spec gets a predicate. An unknown key
 * throws rather than resolving to a silent blank, so a term declared against a
 * field nobody registered takes its own module down at load time.
 *
 * A RUNTIME check, and it cannot be anything else: `PROPERTY_PREDICATES` is
 * annotated `Record<string, string>`, so `predicateOf('notAThing')` compiles
 * clean.
 *
 * @throws when `key` is not registered in `PROPERTY_PREDICATES`.
 */
export function predicateOf(key: string): string {
  if (!Object.prototype.hasOwnProperty.call(PROPERTY_PREDICATES, key)) {
    throw new Error(
      `Unknown field '${key}': register it in PROPERTY_PREDICATES ` +
        `(src/vocabularies/namespaces.ts) first, from the class definition in ` +
        `spec. A term references its predicate; it never declares one.`,
    );
  }
  return PROPERTY_PREDICATES[key] as string;
}

/** Present enough to write: `null` and `undefined` are absent, `0` and `''` are not. */
function present(value: unknown): boolean {
  return value !== undefined && value !== null;
}

/** Every member of an array value, or the bare scalar as a one-member list. */
function members(value: unknown): unknown[] {
  return (Array.isArray(value) ? value : [value]).filter(present);
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
 * A nested field's output, chosen by the value's RUNTIME type — the same
 * dispatch `serializeBlankNode` does across `b.literal` / `b.boolean` /
 * `b.number` / `b.decimal`. Stringifying every value instead would change a
 * nested `42` from an xsd:integer to an xsd:string.
 */
function nestedOutput(predicate: string, value: unknown): Output {
  if (typeof value === 'boolean') return { kind: 'boolean', predicate, value };
  if (typeof value === 'number') return { kind: 'number', predicate, value };
  return { kind: 'literal', predicate, value: String(value) };
}

/** The children of a blank node: one output per present field of the nested object. */
function childrenOf(value: unknown): Output[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>)
    .filter(([nestedKey, nested]) => !NESTED_SKIP.has(nestedKey) && present(nested))
    .map(([nestedKey, nested]) => nestedOutput(`${NESTED_PREFIX}:${nestedKey}`, nested));
}

/** One member of a value, under an already-resolved predicate and rule. */
function outputForMember(member: unknown, predicate: string, rule: FieldRule): Output {
  switch (rule.form) {
    case 'iri':
      return { kind: 'uri', predicate, value: String(member) };
    case 'prefixedEnum':
      return {
        kind: 'uri',
        predicate,
        value: rule.prefix ? `${rule.prefix}:${String(member)}` : String(member),
      };
    case 'number':
      // Not `Number(member)`: `emitField` takes its numeric branch only for a
      // value that already IS a number, and falls through to a quoted literal
      // otherwise. Coercing here would write a bare token for the string
      // '8432' where the existing writer writes "8432".
      return typeof member === 'number' && Number.isFinite(member)
        ? { kind: 'number', predicate, value: member }
        : { kind: 'literal', predicate, value: String(member) };
    case 'boolean':
      return typeof member === 'boolean'
        ? { kind: 'boolean', predicate, value: member }
        : { kind: 'literal', predicate, value: String(member) };
    case 'blankNode':
      // An absent `rdfType` leaves the field off entirely. Carrying `''` would
      // reach `b.type('')` and emit a bare `a`, which does not parse.
      return rule.rdfType
        ? {
            kind: 'blankNode',
            predicate,
            rdfType: rule.rdfType,
            children: childrenOf(member),
          }
        : { kind: 'blankNode', predicate, children: childrenOf(member) };
    case 'literal':
    default:
      return rule.datatype
        ? { kind: 'literal', predicate, value: String(member), datatype: rule.datatype }
        : { kind: 'literal', predicate, value: String(member) };
  }
}

/**
 * Build a term from its declaration.
 *
 * `outputsFor` closes over the spec rather than reading `this`, so a
 * destructured `outputsFor` still works; the spread leaves `key`, `predicate`
 * and `rule` on the object as plain data, so the table stays dumpable and
 * diffable against `spec`'s shapes.
 */
export function defineTerm(spec: TermSpec): Term {
  const { key, predicate, predicateByType, rule, ruleByType } = spec;

  return {
    ...spec,
    outputsFor(record: Record<string, unknown>): Output[] {
      const value = record[key];
      if (!present(value)) return [];

      const recordType = typeof record.type === 'string' ? record.type : undefined;
      const activePredicate =
        (recordType ? predicateByType?.[recordType] : undefined) ?? predicate;
      const activeRule = (recordType ? ruleByType?.[recordType] : undefined) ?? rule;

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

      return members(value).map((member) =>
        outputForMember(member, activePredicate, activeRule),
      );
    },
  };
}
