/**
 * The derived table is what spec says, and the exceptions are declared.
 *
 * `src/record-types/generated.ts` is built by `scripts/build-record-types.mjs`
 * from `src/spec/`, which is built from the checkout. Nothing here is
 * transcribed — but "derived" is a claim, and a claim nothing checks is how
 * `InsurancePlan` spent five releases pointing at `clinical:CoverageRecord`
 * (#26). This re-runs the derivation against the shipped data and fails naming
 * what moved.
 *
 * THE PENDING LIST IS COMPARED BOTH WAYS. `src/record-types/pending-spec-50.json`
 * names twelve classes spec's own record-bearing rule does not reach. An entry
 * that stops being needed — because spec declared the axiom — fails here, so
 * the list can only shrink and shrinking it is a deliberate edit. An exception
 * nothing re-checks is an exemption.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, beforeAll } from 'vitest';

import { allRecordTypes, recordTypeForClass } from '../../src/record-types/index.js';
import { DERIVED_CLASSES } from '../../src/record-types/generated.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ONTOLOGIES = join(repoRoot, 'src/spec/ontologies');

const OWL_CLASS = 'http://www.w3.org/2002/07/owl#Class';
const SUB_CLASS_OF = 'http://www.w3.org/2000/01/rdf-schema#subClassOf';
const DEPRECATED = 'http://www.w3.org/2002/07/owl#deprecated';
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

/** Spec's own rule: does this class's superclass chain reach a PROV root? */
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

  it('includes every live class the PROV rule reaches, and no deprecated one', () => {
    const expected = [...nodes]
      .filter(([iri, node]) => (node['@type'] ?? []).includes(OWL_CLASS)
        && !node[DEPRECATED] && bearsRecords(iri))
      .map(([iri]) => iri);

    const derived = new Set(DERIVED_CLASSES.map((entry) => entry.iri));
    const missing = expected.filter((iri) => !derived.has(iri));

    expect(
      missing,
      'src/record-types/generated.ts has drifted from src/spec/. Rebuild with '
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

  it('every entry is still needed — spec has not yet declared the axiom', () => {
    // THE DIRECTION THAT MATTERS. When `jayostis/spec#50` lands, these go red
    // one at a time and each entry is deleted in the commit that bumps the pin.
    // Without this, a fixed class would sit in the list forever, read as
    // deliberate, and quietly stop being derived from spec.
    const settled = pending.entries
      .filter((entry) => bearsRecords(entry.class))
      .map((entry) => entry.class);

    expect(
      settled,
      'spec now reaches these classes through its own record-bearing rule, so their entries in '
      + 'src/record-types/pending-spec-50.json have outlived their cause. Delete them.',
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
    expect(raw.$rule).toContain('prov:Entity');
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

describe('the committed table is what the build produces', () => {
  it('regenerates byte-identically', () => {
    // The strongest form of the check, and the one `tests/vendor-drift.test.ts`
    // already uses for the vendored parser: run the producer and compare. The
    // assertions above compare the class SET; this compares the file, so a name
    // edited by hand, a supersedes link removed, or a reordering all fail.
    //
    // Rebuilding in a test is safe because the output is deterministic — the
    // generator sorts at every level for exactly this reason — so a passing run
    // leaves the tree untouched and a failing one leaves it correct.
    const generated = join(repoRoot, 'src/record-types/generated.ts');
    const committed = readFileSync(generated, 'utf-8');

    execFileSync('node', [join(repoRoot, 'scripts/build-record-types.mjs')], { cwd: repoRoot });

    expect(
      readFileSync(generated, 'utf-8'),
      'src/record-types/generated.ts differs from what scripts/build-record-types.mjs '
      + 'produces. Either it was edited by hand — it says not to be — or spec moved and the '
      + 'rebuilt file is the change to commit.',
    ).toBe(committed);
  }, 60_000);
});
