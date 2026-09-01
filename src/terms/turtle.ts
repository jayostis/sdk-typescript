/**
 * What a term writes in Turtle: the outputs, and the shapes a value can take.
 *
 * Pure. These return what SHOULD be written and the builder writes it, so term
 * logic is testable with no serializer present — see `tests/terms/rules.test.ts`.
 *
 * @module terms/turtle
 */

import { ownEntry } from './predicate.js';
import { childPredicateFor } from './children.js';
import { NESTED_SKIP, isNestedObject, members, present } from './value.js';
import { DEFAULT_NESTED_PREFIX } from './types.js';
import type { FieldRule, Output } from './types.js';



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
 * One member of a value, under an already-resolved predicate and rule.
 *
 * Returns a LIST because a rule form can produce several outputs from one
 * member, not because any of them may produce none.
 *
 * Takes `key` only to name the field in the `blankNode` error. The predicate
 * alone is not enough: a caller debugging their record is holding JSON keyed on
 * `address`, and `cascade:address` is a spelling they may never have seen.
 */
export function outputsForMember(
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
