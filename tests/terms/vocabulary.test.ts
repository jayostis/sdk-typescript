/**
 * A term references vocabulary; it never declares any.
 *
 * `PROPERTY_PREDICATES` mirrors `spec`'s TTL, so the only way a field name
 * becomes a predicate is through `requirePredicate`. What it protects: a term
 * declared against a misspelled or unregistered field would otherwise write
 * triples under a predicate no shape constrains and no consumer queries.
 */

import { describe, it, expect } from 'vitest';

import { defineTerm, requirePredicate } from '../../src/terms/term.js';
import { termFor } from '../../src/terms/index.js';

describe('requirePredicate', () => {
  it('resolves a registered key to the predicate spec defines for it', () => {
    expect(requirePredicate('snomedCode')).toBe('health:snomedCode');
  });

  it('throws on a key spec does not define, naming the table to register it in', () => {
    expect(() => requirePredicate('notAThing')).toThrow(/PROPERTY_PREDICATES/);
  });

  it('takes the whole term declaration down, at import rather than at write time', () => {
    // Runtime, not `@ts-expect-error`: PROPERTY_PREDICATES is typed
    // Record<string, string>, so a bad key compiles clean (#22). Once the
    // serializer imports termFor, this throws the moment anything imports the
    // package — the whole suite fails at once rather than one field going quiet.
    expect(() =>
      defineTerm({
        key: 'notAThing',
        predicate: requirePredicate('notAThing'),
        rule: { form: 'literal' },
      }),
    ).toThrow();
  });
});

describe('defineTerm', () => {
  it('refuses an unregistered key even when the predicate was written by hand', () => {
    // The declaration above throws from its own requirePredicate call, so it
    // says nothing about a term that skipped it. `predicate` is a plain string:
    // nothing stops an author typing one, and then the only thing standing
    // between a misspelled field and triples no shape constrains is this check.
    expect(() =>
      defineTerm({
        key: 'notAThing',
        predicate: 'health:notAThing',
        rule: { form: 'literal' },
      }),
    ).toThrow(/PROPERTY_PREDICATES/);
  });

  it('accepts a registered key declared the same way', () => {
    expect(() =>
      defineTerm({
        key: 'snomedCode',
        predicate: 'health:snomedCode',
        rule: { form: 'literal' },
      }),
    ).not.toThrow();
  });
});

describe('termFor', () => {
  it('returns undefined for a field no term claims, leaving the serializer defaults to run', () => {
    // Most registered fields have no rule and must keep reaching the
    // type-driven branches of emitField. An unclaimed key is the normal case,
    // not a missing registration.
    expect(termFor('resultUnit')).toBeUndefined();
  });
});
