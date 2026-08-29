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
  form: 'literal' | 'iri' | 'iriList' | 'prefixedEnum' | 'blankNode';
  /** Accept an array OR a bare scalar, and write one triple per value. */
  many?: boolean;
  /** `literal` only, e.g. `xsd:integer`. */
  datatype?: string;
  /** `prefixedEnum` only, e.g. `health`. */
  prefix?: string;
  /** `blankNode` only, e.g. `cascade:EmergencyContact`. */
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
  | { kind: 'uri'; predicate: string; value: string }
  | { kind: 'uriList'; predicate: string; items: string[] }
  | { kind: 'blankNode'; predicate: string; rdfType: string; children: Output[] };

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

/** The children of a blank node: one literal per present field of the nested object. */
function childrenOf(value: unknown): Output[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>)
    .filter(([, nested]) => present(nested))
    .map(([nestedKey, nested]) => ({
      kind: 'literal' as const,
      predicate: `${NESTED_PREFIX}:${nestedKey}`,
      value: String(nested),
    }));
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
    case 'blankNode':
      return {
        kind: 'blankNode',
        predicate,
        rdfType: rule.rdfType ?? '',
        children: childrenOf(member),
      };
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
        const items = members(value).map(String);
        return items.length === 0 ? [] : [{ kind: 'uriList', predicate: activePredicate, items }];
      }

      return members(value).map((member) =>
        outputForMember(member, activePredicate, activeRule),
      );
    },
  };
}
