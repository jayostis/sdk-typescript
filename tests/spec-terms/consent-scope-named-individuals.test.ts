/**
 * A code list published as named individuals resolves.
 *
 * `scripts/build-terms.mjs`'s `membersOf()` walks `rdfs:subClassOf` only —
 * built for `cascade:DataProvenance`, whose three permitted values are
 * declared as SUBCLASSES. Six classes, `cascade:ConsentScope` among them,
 * publish their members the other way: each an `owl:NamedIndividual` also
 * typed to the class, never a subclass at all. That form is invisible to the
 * current rule, so `cascade:consentScope` carrying `"SocialHistoryConsent"`
 * resolves to nothing today — a bare token under `"@type": "@id"` with no
 * member to resolve against, on a term whose range the ontology names plainly.
 *
 * #91's Verification: "a code list published as named individuals resolves.
 * `cascade:consentScope` carrying `"SocialHistoryConsent"` resolves to
 * `<https://ns.cascadeprotocol.org/core/v1#SocialHistoryConsent>`."
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, beforeAll } from 'vitest';

import { SPEC_TERMS } from '../../src/spec/derived/terms.generated.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ONTOLOGIES = join(repoRoot, 'src/spec/ontologies');

/**
 * `src/spec/` is gitignored and generated, so a clean clone has none. Failing
 * outright teaches people to ignore a red suite on a fresh checkout; a build
 * step here means the assertions below are the first thing that can fail.
 */
beforeAll(() => {
  if (!existsSync(ONTOLOGIES)) {
    execFileSync('node', [join(repoRoot, 'scripts/build-spec-data.mjs')], { cwd: repoRoot });
    execFileSync('node', [join(repoRoot, 'scripts/build-terms.mjs')], { cwd: repoRoot });
  }
}, 60_000);

// Hand-written from `spec/ontologies/core/v1/core.ttl`, not read off the
// generated table — the whole point is to catch the table disagreeing with
// spec's own data.
const CONSENT_SCOPE = 'https://ns.cascadeprotocol.org/core/v1#ConsentScope';
const SOCIAL_HISTORY_CONSENT = 'https://ns.cascadeprotocol.org/core/v1#SocialHistoryConsent';
const SUBSTANCE_USE_CONSENT = 'https://ns.cascadeprotocol.org/core/v1#SubstanceUseConsent';
const MENTAL_HEALTH_CONSENT = 'https://ns.cascadeprotocol.org/core/v1#MentalHealthConsent';

describe('cascade:ConsentScope publishes its members as named individuals, not subclasses', () => {
  it('the term resolves against a range the ontology names as cascade:ConsentScope', () => {
    expect(SPEC_TERMS.vocabularies['core']?.['consentScope']?.range).toBe(CONSENT_SCOPE);
  });

  it('cascade:ConsentScope has a published value set at all', () => {
    expect(
      SPEC_TERMS.valueSets[CONSENT_SCOPE],
      'cascade:ConsentScope’s three members are each declared '
      + '`a owl:NamedIndividual, cascade:ConsentScope`, not `rdfs:subClassOf cascade:ConsentScope` — '
      + 'the form scripts/build-terms.mjs’s membersOf() looks for. One added clause (per #91) '
      + 'recovers all six classes with this shape.',
    ).toBeDefined();
  });

  it('resolves "SocialHistoryConsent" to the IRI spec publishes for it', () => {
    expect(SPEC_TERMS.valueSets[CONSENT_SCOPE]?.['SocialHistoryConsent']).toBe(SOCIAL_HISTORY_CONSENT);
  });

  it('carries the other two named individuals as well, not only the one named in the issue', () => {
    expect(SPEC_TERMS.valueSets[CONSENT_SCOPE]?.['SubstanceUseConsent']).toBe(SUBSTANCE_USE_CONSENT);
    expect(SPEC_TERMS.valueSets[CONSENT_SCOPE]?.['MentalHealthConsent']).toBe(MENTAL_HEALTH_CONSENT);
  });
});
