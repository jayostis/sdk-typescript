/**
 * A blank node's children: their predicates, and which of them a term declares.
 *
 * The one place child predicates are written down. `childPredicateFor` is what
 * the writer emits and what the deserializer's reverse map and the JSON-LD
 * context are both BUILT FROM, rather than each interpolating a prefix of its
 * own — a second copy of that decision is how the reverse map came to disagree
 * with the writer in the first place.
 *
 * @module terms/children
 */

import { ownEntry } from './predicate.js';
import { rulesOf } from './rule.js';
import { DEFAULT_NESTED_PREFIX } from './types.js';
import { NESTED_SKIP, isNestedObject, members, present } from './value.js';
import type { FieldRule, TermSpec } from './types.js';

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
  const merged: Record<string, string> = {};
  for (const rule of rulesOf(spec)) {
    if (rule.form !== 'blankNode' || !rule.children) continue;
    const prefix = rule.nestedPrefix ?? DEFAULT_NESTED_PREFIX;
    for (const [childKey, childRule] of Object.entries(rule.children)) {
      merged[childKey] = childPredicateFor(childKey, prefix, childRule);
    }
  }
  return merged;
}