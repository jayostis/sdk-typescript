/**
 * Which predicate a term writes, and the refusal to invent one.
 *
 * A term may not make up vocabulary. Every predicate here is checked against
 * `PROPERTY_PREDICATES` or against the `prefix:localName` shape, at MODULE LOAD
 * — `defineTerm` calls these while the module is being imported — so a term
 * declared with a predicate the vocabulary does not have cannot be constructed
 * at all, and the failure arrives at import rather than at the first record
 * that happens to carry the field.
 *
 * @module terms/predicate
 */

import { NAMESPACES, PROPERTY_PREDICATES } from '../vocabularies/namespaces.js';
import type { TermSpec } from './types.js';

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
export function ownEntry<T>(table: Record<string, T> | undefined, key: string | undefined): T | undefined {
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
export function requireOverridePredicate(key: string, recordType: string, value: string): string {
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
export function requireChildPredicate(termKey: string, childKey: string, value: string): string {
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

