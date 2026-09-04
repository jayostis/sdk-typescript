/**
 * Which vocabulary owns a namespace is derived, not parsed out of an IRI.
 *
 * WHAT THIS REPLACED. `src/converter/to-rdf.ts` read the vocabulary from a class
 * IRI with `/\/([a-z]+)\/v\d+#/` and fell back to `'core'` on any miss. Two
 * problems, and the second is the one that needed a test: the pattern encodes
 * spec's URI shape as an assumption in the module built to stop encoding spec by
 * hand, and `[a-z]+` matches no digit and no hyphen, so a vocabulary segment
 * carrying either resolved against core's terms with its own vocabulary
 * invisible — silently, because the fallback looks deliberate.
 *
 * Driven with synthetic vocabularies, for the reason `assembleRecordTypes` takes
 * its classes as an argument: the real data has six well-behaved namespaces and
 * cannot produce a tie, a digit-bearing segment, or a context that spans two
 * namespaces. A detector is proven by making it speak (`tests/README.md`).
 */

import { describe, it, expect } from 'vitest';

// @ts-expect-error -- a build helper, deliberately plain JavaScript and untyped.
import { localNameOf, namespaceOf, namespaceOwners } from '../../scripts/lib/iri.mjs';
import { SPEC_TERMS } from '../../src/spec/derived/terms.generated.js';

const CORE = 'https://ns.cascadeprotocol.org/core/v1#';
const HEALTH = 'https://ns.cascadeprotocol.org/health/v1#';

/** A term table: `name -> { predicate }`, which is all the rule reads. */
const terms = (...predicates: string[]) =>
  Object.fromEntries(predicates.map((p, i) => [`t${i}`, { predicate: p }]));

describe('the owner is the context with the largest share of a namespace', () => {
  it('prefers the narrow context over the one that spans everything', () => {
    // The `core` / `cascade` case in miniature, and the whole reason the rule is
    // a proportion rather than a count: `cascade` has MORE core terms than
    // `core` does here, and still loses, because they are a smaller part of what
    // it is. Resolving against it would hand a record every vocabulary's terms.
    const owners = namespaceOwners({
      core: terms(`${CORE}a`, `${CORE}b`),
      cascade: terms(`${CORE}a`, `${CORE}b`, `${CORE}c`, `${HEALTH}x`, `${HEALTH}y`, `${HEALTH}z`),
      health: terms(`${HEALTH}x`, `${HEALTH}y`),
    });

    expect(owners[CORE]).toBe('core');
    expect(owners[HEALTH]).toBe('health');
  });

  it('refuses a tie rather than letting directory order decide', () => {
    // Two contexts with an equal claim means the rule no longer answers. The old
    // code could not reach this state at all; it would have picked whichever
    // segment the regex found and never known there was a second claimant.
    expect(() => namespaceOwners({
      alpha: terms(`${CORE}a`),
      beta: terms(`${CORE}b`),
    })).toThrow(/equal claim/);
  });

  it('does not care what the namespace segment looks like', () => {
    // The regex matched `[a-z]+` between slashes before `/v<digits>#`. None of
    // these would have parsed, and each would have resolved against core.
    const shapes = [
      'https://example.org/fhir-r4/v2#Observation',
      'https://example.org/vocab2024#Thing',
      'urn:cascade:local#Thing',
    ];

    for (const iri of shapes) {
      const ns = namespaceOf(iri);
      expect(namespaceOwners({ odd: terms(iri) })[ns], iri).toBe('odd');
    }
  });
});

describe('the map this package actually ships', () => {
  it('gives the core namespace to core, not to cascade', () => {
    // The judgement the deleted comment made by hand, now falling out of the
    // data: `core.jsonld` is 141 terms all in this namespace, `cascade.jsonld`
    // is 719 spanning every vocabulary.
    expect(SPEC_TERMS.namespaceOwners[CORE]).toBe('core');
  });

  it('owns every namespace a record type could carry', () => {
    // The wiring, so the synthetic cases above cannot pass while the shipped map
    // is missing the vocabulary a real class needs. An absent entry is now a
    // refusal in `termsFor` rather than a silent fallback to core, so a gap here
    // takes a whole vocabulary down loudly — which is the point, but it must not
    // happen by accident.
    const owned = new Set(Object.keys(SPEC_TERMS.namespaceOwners));

    for (const vocabulary of ['core', 'health', 'clinical', 'coverage', 'checkup', 'pots']) {
      const namespace = `https://ns.cascadeprotocol.org/${vocabulary}/v1#`;
      expect(owned.has(namespace), `${namespace} is owned by nothing`).toBe(true);
    }
  });
});

describe('localNameOf', () => {
  it('returns the whole string when there is no separator', () => {
    // The `+ 1` on a `-1` miss. Without it the first character is dropped, and
    // the result still looks like a name.
    expect(localNameOf('Thing')).toBe('Thing');
  });
});
