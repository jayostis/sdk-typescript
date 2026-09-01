/**
 * What a term is in JSON-LD, both directions.
 *
 * The counterpart to `turtle.ts`, and the reason a nested node carries its
 * class in both formats rather than only the one. The switch over rule forms
 * lives HERE and nowhere else: an earlier attempt put a second copy in
 * `src/jsonld/`, which is the failure `childPredicatesOf` names in its own
 * comment.
 *
 * @module terms/json-ld
 */

import type { FieldRule } from './types.js';

/**
 * The forms a term can be written in JSON-LD, and a refusal for the rest.
 *
 * `FieldRule` names eight; four have no term yet. An unhandled form THROWS
 * rather than passing the value through, because passing through is not
 * "skipped", it is "written wrongly": an `iriList` would become an array of
 * bare strings where the graph needs an ordered list of IRIs, and nothing would
 * report it. Refusing what has no expressible form, naming the field, is the
 * same rule `outputsForMember` follows for a `blankNode` it cannot write.
 *
 * `literal` and `number` pass through because the CONTEXT carries their
 * datatype — `dateOfBirth` is `{ "@id": …, "@type": "xsd:date" }` there — and a
 * second copy of that decision here is how two writers come to disagree.
 */
export function jsonLdValue(key: string, rule: FieldRule, value: unknown): unknown {
  switch (rule.form) {
    case 'literal':
    case 'number':
      return value;
    case 'blankNode':
      return withNodeType(rule.rdfType, value);
    default:
      throw unwritableAsJsonLd(key, rule.form);
  }
}

/**
 * The inverse of {@link jsonLdValue}, and not optional.
 *
 * A record read back out of its own JSON-LD has to be the record that went in,
 * and no model declares an `@type` key on a nested structure — so without this
 * a round trip hands the caller back an `emergencyContact` carrying a key they
 * never set. The Turtle pair already works this way: the writer puts `rdf:type`
 * on the node and the reader drops it rebuilding the object.
 */
export function recordValue(key: string, rule: FieldRule, value: unknown): unknown {
  switch (rule.form) {
    case 'literal':
    case 'number':
      return value;
    case 'blankNode':
      return withoutNodeType(value);
    default:
      throw unwritableAsJsonLd(key, rule.form);
  }
}

function unwritableAsJsonLd(key: string, form: string): Error {
  return new Error(
    `No JSON-LD form for '${key}': the term declares form '${form}', which defineTerm `
    + 'does not write yet. Add the case rather than letting the value through — an '
    + 'unhandled form is written wrongly, not skipped.',
  );
}

/**
 * A nested node carrying the class its term declares.
 *
 * `rdfType` is optional, and absent means an UNTYPED node rather than an empty
 * one, so a term declaring none leaves the value alone. Where it IS declared,
 * omitting it is not cosmetic: a shape targeting `cascade:EmergencyContact`
 * never reaches an untyped node, so the contact is valid Turtle, constrained by
 * nothing, and invisible to any query asking for a contact.
 */
function withNodeType(rdfType: string | undefined, value: unknown): unknown {
  if (rdfType === undefined) return value;
  if (Array.isArray(value)) return value.map((member) => withNodeType(rdfType, member));
  if (typeof value !== 'object' || value === null) return value;

  return { '@type': rdfType, ...(value as Record<string, unknown>) };
}

/** The same node with the class taken back off. */
function withoutNodeType(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutNodeType);
  if (typeof value !== 'object' || value === null) return value;

  const { '@type': _class, ...rest } = value as Record<string, unknown>;
  return rest;
}
