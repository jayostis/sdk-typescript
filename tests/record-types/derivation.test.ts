/**
 * The derived table is what spec says, and the exceptions are declared.
 *
 * `src/spec/derived/record-types.generated.ts` is built by `scripts/build-record-types.mjs`
 * from `src/spec/`, which is built from the checkout. Nothing here is
 * transcribed — but "derived" is a claim, and a claim nothing checks is how
 * `InsurancePlan` spent five releases pointing at `clinical:CoverageRecord`
 * (#26). This re-runs the derivation against the shipped data and fails naming
 * what moved.
 *
 * THE RULE CHANGED UNDER THIS FILE. It read `rdfs:subClassOf prov:Entity`, and
 * `jayostis/spec#34` (ASK-05) ruled that out — the axiom is PROV-O alignment and
 * says nothing about records. The replacement is the marker
 * `cascade:RecordClass`, which `jayostis/spec#50` adds. Both are asserted here:
 * which one the build used depends on the checkout, and the flip has to happen
 * on its own when the pin moves rather than by an edit nobody remembers.
 *
 * `src/record-types/pending-spec-50.json` is what the bridge cannot see, and it
 * is compared both ways — the day the marker is pinned, this file fails, and the
 * list and the fallback are deleted together rather than one entry at a time.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, beforeAll } from 'vitest';

import { allRecordTypes, recordTypeForClass } from '../../src/record-types/index.js';
import { DERIVED_CLASSES } from '../../src/spec/derived/record-types.generated.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ONTOLOGIES = join(repoRoot, 'src/spec/ontologies');

const OWL_CLASS = 'http://www.w3.org/2002/07/owl#Class';
const SUB_CLASS_OF = 'http://www.w3.org/2000/01/rdf-schema#subClassOf';
const DEPRECATED = 'http://www.w3.org/2002/07/owl#deprecated';
const RECORD_CLASS = 'https://ns.cascadeprotocol.org/core/v1#RecordClass';
const RECORD_ROOTS = new Set([
  'http://www.w3.org/ns/prov#Entity',
  'http://www.w3.org/ns/prov#Activity',
]);

/**
 * Build the artifacts if they are absent.
 *
 * `src/spec/` is gitignored and generated, so a clean clone has none. Failing
 * teaches people to ignore a red suite on a fresh checkout; skipping makes
 * every assertion below vacuous exactly when the data has never been produced.
 */
beforeAll(() => {
  if (!existsSync(ONTOLOGIES)) {
    execFileSync('node', [join(repoRoot, 'scripts/build-spec-data.mjs')], { cwd: repoRoot });
    execFileSync('node', [join(repoRoot, 'scripts/build-record-types.mjs')], { cwd: repoRoot });
  }
}, 60_000);

interface Node { '@id': string; '@type'?: string[]; [key: string]: unknown }

/** The shipped graph, merged across vocabularies. */
function graph(): Map<string, Node> {
  const nodes = new Map<string, Node>();

  for (const file of readdirSync(ONTOLOGIES).filter((f) => f.endsWith('.jsonld'))) {
    for (const node of JSON.parse(readFileSync(join(ONTOLOGIES, file), 'utf-8')) as Node[]) {
      // Merged, because a subclass chain crosses vocabularies —
      // `clinical:SocialHistoryRecord`'s parent is declared in core — and a
      // per-file walk would call a class unreachable purely because its parent
      // was declared elsewhere.
      nodes.set(node['@id'], { ...(nodes.get(node['@id']) ?? {}), ...node });
    }
  }

  return nodes;
}

const nodes = graph();

/**
 * The BRIDGE rule: does this superclass chain reach a PROV root?
 *
 * Ruled out as a statement about records by jayostis/spec#34 (ASK-05) — the
 * axiom is PROV-O alignment. Kept only to assert what the fallback does while
 * cascade:RecordClass is unpinned.
 */
function bearsRecords(iri: string, seen = new Set<string>()): boolean {
  if (seen.has(iri)) return false;
  seen.add(iri);

  const parents = ((nodes.get(iri)?.[SUB_CLASS_OF] ?? []) as { '@id'?: string }[])
    .map((value) => value['@id'])
    .filter((value): value is string => Boolean(value));

  return parents.some((parent) => RECORD_ROOTS.has(parent) || bearsRecords(parent, seen));
}

const pending = JSON.parse(
  readFileSync(join(repoRoot, 'src/record-types/pending-spec-50.json'), 'utf-8'),
) as { entries: { class: string; declares: string; detail: string }[] };

describe('the derived table is spec\'s record-bearing population', () => {
  it('finds classes at all', () => {
    // A zero-length read makes every assertion below vacuous: nothing derives,
    // nothing is pending, and the suite reports a clean derivation of nothing.
    expect(nodes.size).toBeGreaterThan(500);
    expect(DERIVED_CLASSES.length).toBeGreaterThan(50);
  });

  it('uses the marker when the checkout carries it, and the bridge when it does not', () => {
    // THE RULE ITSELF IS UNDER TEST, because it changed. `cascade:RecordClass`
    // is what `jayostis/spec#50` adds — the explicit list ASK-05's ruling calls
    // for after ruling out `rdfs:subClassOf prov:Entity` as PROV-O alignment.
    // The build must flip to it on its own when the pin moves, so this asserts
    // which rule the checkout in hand supports rather than assuming either.
    const marked = [...nodes].filter(([, node]) => (node['@type'] ?? []).includes(RECORD_CLASS));

    if (marked.length > 0) {
      // The marker has landed. The bridge and the pending list are dead, and
      // the population is exactly what carries the marker.
      expect(new Set(DERIVED_CLASSES.map((entry) => entry.iri)))
        .toEqual(new Set(marked.filter(([, node]) => !node[DEPRECATED]).map(([iri]) => iri)));
      return;
    }

    // The marker has not landed, so the bridge stands in — and the pending list
    // is what it cannot see. Both halves asserted, so neither can quietly stop
    // contributing.
    const bridged = [...nodes]
      .filter(([iri, node]) => (node['@type'] ?? []).includes(OWL_CLASS)
        && !node[DEPRECATED] && bearsRecords(iri))
      .map(([iri]) => iri);

    expect(bridged.length).toBeGreaterThan(50);
    expect(pending.entries.length).toBeGreaterThan(0);
  });

  it('includes every live class the current rule reaches, and no deprecated one', () => {
    const expected = [...nodes]
      .filter(([iri, node]) => (node['@type'] ?? []).includes(OWL_CLASS)
        && !node[DEPRECATED] && bearsRecords(iri))
      .map(([iri]) => iri);

    const derived = new Set(DERIVED_CLASSES.map((entry) => entry.iri));
    const missing = expected.filter((iri) => !derived.has(iri));

    expect(
      missing,
      'src/spec/derived/record-types.generated.ts has drifted from src/spec/. Rebuild with '
      + '`node scripts/build-record-types.mjs`; if the classes really moved, that is a spec bump.',
    ).toEqual([]);
  });

  it('adds exactly the classes the pending list declares, and nothing else', () => {
    const byRule = new Set([...nodes]
      .filter(([iri, node]) => (node['@type'] ?? []).includes(OWL_CLASS)
        && !node[DEPRECATED] && bearsRecords(iri))
      .map(([iri]) => iri));

    const extra = DERIVED_CLASSES.map((entry) => entry.iri).filter((iri) => !byRule.has(iri));

    expect(extra.sort()).toEqual(pending.entries.map((entry) => entry.class).sort());
  });
});

describe('the pending list, compared both ways', () => {
  it('names twelve classes, each with a reason', () => {
    expect(pending.entries).toHaveLength(12);

    for (const entry of pending.entries) {
      expect(entry.declares, entry.class).toBeTruthy();
      expect(entry.detail, entry.class).toBeTruthy();
    }
  });

  it('is still needed — the marker has not landed', () => {
    // THE DIRECTION THAT MATTERS, and it changed with the issue. spec#50 was
    // rewritten after ASK-05: it no longer adds one `rdfs:subClassOf` axiom per
    // class — it adds `cascade:RecordClass` and marks 83 classes with it, and
    // forbids moving a prov axiom to change what the gate sees. So the file
    // does not shrink entry by entry any more; it is deleted whole the moment
    // the marker is pinned, and this is what says when.
    const marked = [...nodes].filter(([, node]) => (node['@type'] ?? []).includes(RECORD_CLASS));

    expect(
      marked.map(([iri]) => iri),
      'the pinned spec now carries cascade:RecordClass, so the bridge rule and '
      + 'src/record-types/pending-spec-50.json have both outlived their cause. Delete the file '
      + 'and the prov fallback in scripts/build-record-types.mjs together.',
    ).toEqual([]);
  });

  it('every entry names a class the shipped data actually declares', () => {
    // The other direction: an entry for a class spec deleted or renamed would
    // silently register nothing at all.
    for (const entry of pending.entries) {
      expect(nodes.has(entry.class), `${entry.class} is in no shipped ontology`).toBe(true);
    }
  });

  it('cites the issue that deletes it', () => {
    const raw = JSON.parse(
      readFileSync(join(repoRoot, 'src/record-types/pending-spec-50.json'), 'utf-8'),
    ) as { $issue: string; $rule: string };

    expect(raw.$issue).toBe('jayostis/spec#50');
    // The rule text must carry the CORRECTION, not just a rule. A reader who
    // finds only the positive statement can re-derive the mistake from the
    // axioms, which is what ASK-05 says keeps happening.
    expect(raw.$rule).toContain('ASK-05');
    expect(raw.$rule).toContain('cascade:RecordClass');
  });
});

describe('names come from the published contexts', () => {
  it('derives four supersedes links from rdfs:seeAlso, not from a table', () => {
    // The four deprecations spec states correctly. A fifth landing upstream
    // needs no change in this repository at all.
    const withSupersedes = DERIVED_CLASSES
      .filter((entry) => entry.supersedes.length > 0)
      .map((entry) => entry.name)
      .sort();

    expect(withSupersedes).toEqual([
      'AllergyRecord', 'ConditionRecord', 'ImmunizationRecord', 'LabResultRecord',
    ]);
  });

  it('does not derive one for clinical:CoverageRecord, whose seeAlso points at FHIR', () => {
    // `jayostis/spec#50` gap 2. It resolves through a declared override
    // instead, and this is what says the derivation is not the reason.
    const insurancePlan = DERIVED_CLASSES.find((entry) => entry.name === 'InsurancePlan');

    expect(insurancePlan?.supersedes).toEqual([]);
    expect(recordTypeForClass('https://ns.cascadeprotocol.org/clinical/v1#CoverageRecord')?.name)
      .toBe('InsurancePlan');
  });

  it('every derived name is non-empty and unique', () => {
    const names = DERIVED_CLASSES.map((entry) => entry.name);

    expect(names.every((name) => name.length > 0)).toBe(true);
    // One collision exists — the two `SocialHistoryRecord` classes — and it is
    // resolved by an override at assembly, not by the derivation.
    expect(names.length - new Set(names).size).toBe(1);
  });

  it('registers more classes than this SDK has models for', () => {
    // The population is spec's, not ours. 79 classes carry record data and
    // `src/models/` covers a fraction of them; a lookup that answered only for
    // the modelled ones would be a hand-kept list wearing a derivation's
    // clothes.
    expect(allRecordTypes().length).toBe(DERIVED_CLASSES.length);
    expect(allRecordTypes().length).toBeGreaterThan(60);
  });
});

describe('the table on disk is what the build produces', () => {
  it('regenerates byte-identically', () => {
    // The strongest form of the check, and the one `tests/vendor-drift.test.ts`
    // already uses for the vendored parser: run the producer and compare. The
    // assertions above compare the class SET; this compares the file, so a name
    // edited by hand, a supersedes link removed, or a reordering all fail.
    //
    // Rebuilding in a test is safe because the output is deterministic — the
    // generator sorts at every level for exactly this reason — so a passing run
    // leaves the tree untouched and a failing one leaves it correct.
    //
    // The table is gitignored, so this is no longer a check that a commit kept
    // up: it is a check that the file the suite just imported is the one the
    // generator produces from the spec data on disk. A stale build left by an
    // interrupted `npm run generate`, or a hand edit made to get a run green,
    // is what it catches now.
    const generated = join(repoRoot, 'src/spec/derived/record-types.generated.ts');
    const onDisk = readFileSync(generated, 'utf-8');

    execFileSync('node', [join(repoRoot, 'scripts/build-record-types.mjs')], { cwd: repoRoot });

    expect(
      readFileSync(generated, 'utf-8'),
      'src/spec/derived/record-types.generated.ts differs from what scripts/build-record-types.mjs '
      + 'produces. Either it was edited by hand — it says not to be — or the spec data under '
      + '`src/spec/` moved after it was built. `npm run generate` rebuilds both in order.',
    ).toBe(onDisk);
  }, 60_000);
});
