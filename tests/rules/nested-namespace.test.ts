/**
 * The namespace a nested child keeps across a round trip.
 *
 * THE RULE: a child key is usable only if writing it back produces the
 * predicate it was read from. `recoverableChildKey` already says exactly that
 * in its own doc comment — a bare `wardCount` recovered from a foreign IRI
 * "would be written back as `cascade:wardCount` — a DIFFERENT predicate" — and
 * the check is currently applied only on the branch that does not need it.
 * `REVERSE_PREDICATE_MAP` is consulted first (`turtle-parser.ts:1149`), and any
 * predicate it recognises skips the test.
 *
 * This file is keyed on that rule rather than on the reader, because it takes
 * BOTH sides to state: the reader chooses a key, the writer spells it, and only
 * the pair of them can be wrong. Every case below is a document in and the same
 * document out.
 *
 * TWO OF THESE ARE THE DEFECT AND THREE ARE GUARDS, and the guards are the
 * point of writing them together. The obvious fix — stop consulting the global
 * map for nested children and let the namespace-checked fallback do the work —
 * looks right and breaks every UNTERMED nested node, because those have no term
 * to read a prefix from, so the fallback is switched off and the map is the only
 * thing resolving their children at all. A fix that goes green on the first two
 * and red on the last three has traded a corruption for an outage.
 *
 * @see tests/rules/undeclared-child.test.ts  the sibling rule, on children no term declares
 */

import { describe, it, expect } from 'vitest';

import { serialize } from '../../src/serializer/turtle-serializer.js';
import { deserializeOne } from '../../src/deserializer/turtle-parser.js';

const PREFIXES = `
@prefix cascade: <https://ns.cascadeprotocol.org/core/v1#> .
@prefix health: <https://ns.cascadeprotocol.org/health/v1#> .
`;

const HEALTH_NS = 'https://ns.cascadeprotocol.org/health/v1#';

/** A profile whose emergency contact carries `child`, verbatim Turtle. */
const profileWith = (child: string) => `${PREFIXES}
<urn:uuid:profile-ns-0001> a cascade:PatientProfile ;
    cascade:schemaVersion "1.3" ;
    cascade:emergencyContact [
        a cascade:EmergencyContact ;
        cascade:contactName "Maria Rivera" ;
        ${child}
    ] .
`;

/** A manifest whose summary under `field` carries `child`, verbatim Turtle. */
const manifestWith = (field: string, child: string) => `${PREFIXES}
<urn:uuid:manifest-ns-0001> a cascade:ExportManifest ;
    cascade:schemaVersion "1.3" ;
    cascade:${field} [
        a cascade:RecordSummary ;
        cascade:domain "clinical" ;
        ${child}
    ] .
`;

/** Read a document, write it back, and return both halves for asserting on. */
function roundTrip(turtle: string, type: string, field: string) {
  const record = deserializeOne<Record<string, unknown>>(turtle, type);
  const out = serialize(record as never);
  return {
    nested: record?.[field] as Record<string, unknown>,
    // Every predicate the re-written document carries on the nested node,
    // as it appears in the Turtle — the abbreviation is part of the claim.
    written: out
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^(cascade:|health:|<)/.test(line) && !line.startsWith('cascade:schemaVersion')),
    prefixes: out
      .split('\n')
      .filter((line) => line.startsWith('@prefix'))
      .map((line) => line.split(' ')[1]),
  };
}

describe('the namespace a nested child keeps', () => {
  describe('the defect', () => {
    it('does not move a foreign predicate into the node prefix', () => {
      // `health:notes` is registered in the reverse map — it is a real property
      // this SDK reads at top level — so the map answers `notes` and the check
      // never runs. The writer then abbreviates a bare `notes` under the node's
      // own prefix, and a triple that went in as health:notes comes out as
      // cascade:notes: a different property, under a vocabulary that never
      // declared it, with this SDK's name on the claim.
      const { nested, written } = roundTrip(
        profileWith('health:notes "call after 6pm"'),
        'PatientProfile',
        'emergencyContact',
      );

      expect(nested).not.toHaveProperty('notes');
      expect(nested[`${HEALTH_NS}notes`]).toBe('call after 6pm');
      expect(written).toContainEqual(expect.stringContaining(`<${HEALTH_NS}notes>`));
      expect(written).not.toContainEqual(expect.stringContaining('cascade:notes'));
      // NOT asserted: that the header still declares `health:`. The angle-bracket
      // form needs no prefix, so a correct fix legitimately drops it — an earlier
      // draft of this test demanded it and failed against the right output.
    });

    it('does not move a foreign predicate on an UNTERMED node either', () => {
      // `wellnessSummary` has no term, so `nestedNamespaceOf` returns undefined
      // and the namespace check is off entirely rather than merely bypassed.
      // The prefix an untermed node writes its children under lives in the
      // serializer's `BLANK_NODE_PREDICATE_PREFIXES`; unless the reader can see
      // it too, this half of the defect survives a fix to the half above.
      const { nested, written } = roundTrip(
        manifestWith('wellnessSummary', 'health:notes "seasonal"'),
        'ExportManifest',
        'wellnessSummary',
      );

      expect(nested).not.toHaveProperty('notes');
      expect(nested[`${HEALTH_NS}notes`]).toBe('seasonal');
      expect(written).not.toContainEqual(expect.stringContaining('cascade:notes'));
    });
  });

  describe('the guards — what a fix must not break', () => {
    it('keeps the short key for a child the term declares in this namespace', () => {
      // `notes` IS a declared child of `clinicalSummary`, as `cascade:notes`:
      // the serializer's TYPE_PREDICATE_OVERRIDES forks `notes` to cascade: for
      // a RecordSummary, where the registered spelling is health:notes. So the
      // same local name is right here and wrong one test above, which is why
      // the rule is a round-trip check and not a namespace blocklist.
      const { nested, written } = roundTrip(
        manifestWith('clinicalSummary', 'cascade:notes "quarterly export"'),
        'ExportManifest',
        'clinicalSummary',
      );

      expect(nested.notes).toBe('quarterly export');
      expect(written).toContainEqual(expect.stringContaining('cascade:notes'));
    });

    it('keeps the short key for a declared child that lives in ANOTHER namespace', () => {
      // `sourceRecordId` is declared with `predicate: 'health:sourceRecordId'`,
      // so the writer emits the foreign predicate for the short key and the
      // round trip holds. A fix that refused every predicate outside the node's
      // prefix would break this — the test is what says the rule is "would the
      // writer put this back", not "is it in the node's namespace".
      const { nested, written } = roundTrip(
        manifestWith('clinicalSummary', 'health:sourceRecordId "EHR-77"'),
        'ExportManifest',
        'clinicalSummary',
      );

      expect(nested.sourceRecordId).toBe('EHR-77');
      expect(written).toContainEqual(expect.stringContaining('health:sourceRecordId'));
    });

    it('still resolves the children of an untermed node by name', () => {
      // THE OUTAGE THE OBVIOUS FIX CAUSES. `wellnessSummary` has no term, so
      // the namespace-checked fallback cannot run for it and the global reverse
      // map is the only thing resolving `cascade:domain` to `domain` at all.
      // Deleting that lookup instead of checking its answer returns every child
      // of every untermed node keyed by full IRI.
      const { nested } = roundTrip(
        manifestWith('wellnessSummary', 'cascade:sleepDays 30'),
        'ExportManifest',
        'wellnessSummary',
      );

      expect(nested).toEqual({ domain: 'clinical', sleepDays: 30 });
    });
  });
});
