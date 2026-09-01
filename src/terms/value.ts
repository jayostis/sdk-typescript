/**
 * What a field's VALUE is, before any question of how it is written.
 *
 * Shared by `turtle.ts` and `children.ts`, and its own module because both need
 * it: `turtle.ts` already imports `childPredicateFor` from `children.ts`, so
 * putting these there — or leaving them in `turtle.ts` — makes the two files
 * import each other. None of it is format-specific; "is this field present" and
 * "how many members does it have" are the same questions whichever writer is
 * asking.
 *
 * @module terms/value
 */


export function present(value: unknown): boolean {
  return value !== undefined && value !== null;
}

/** Every member of an array value, or the bare scalar as a one-member list. */
export function members(value: unknown): unknown[] {
  return (Array.isArray(value) ? value : [value]).filter(present);
}

/** A value with fields to write as a blank node's children — not a scalar, not an array. */
export function isNestedObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Nested keys that describe the sub-structure rather than a triple in it.
 *
 * `serializeBlankNode` skips both: a blank node's children are `type`-free
 * fields under one vocabulary, and writing `cascade:type "RecordSummary"` would
 * invent a triple no shape declares.
 */
export const NESTED_SKIP = new Set(['type', 'id']);
