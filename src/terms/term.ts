/**
 * One field, one module: the predicate, the rule for writing it, and the
 * per-record-type variations of both, in a single declaration.
 *
 * A term produces DATA, not side effects. {@link Term.outputsFor} returns what
 * should be written and the builder writes it, so term logic is pure and
 * testable with no serializer present, and the table stays diffable against
 * `spec`'s shapes.
 *
 * THIS FILE IS THE ASSEMBLY, and nothing else. What a term IS lives in
 * `types.ts`; which predicate it writes in `predicate.ts`; which rule applies in
 * `rule.ts`; a blank node's children in `children.ts`; and the two output
 * formats in `turtle.ts` and `json-ld.ts`. `defineTerm` validates a spec and
 * hangs the three methods off it.
 *
 * Import from `./index.js`, not from any of these directly — that is what makes
 * the arrangement above an internal detail, and `tests/terms/front-door.test.ts`
 * is what keeps it one.
 *
 * @module terms
 */

import { predicateFor, requireChildPredicate, requireOverridePredicate, requirePredicate } from './predicate.js';
import { jsonLdValue, recordValue } from './json-ld.js';
import { ruleFor } from './rule.js';
import { outputsForMember } from './turtle.js';
import { members, present } from './value.js';
import type { Output, Term, TermSpec } from './types.js';

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

    jsonLdFor(record: Record<string, unknown>): unknown {
      const value = record[key];
      if (!present(value)) return undefined;

      const recordType = typeof record.type === 'string' ? record.type : undefined;
      return jsonLdValue(key, ruleFor(spec, recordType), value);
    },

    fromJsonLdValue(value: unknown, recordType?: string): unknown {
      return recordValue(key, ruleFor(spec, recordType), value);
    },
  };
}
