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
 * THE RULE CHANGED UNDER THIS FILE, AND THIS FILE IS WHAT SAID SO. It read
 * `rdfs:subClassOf prov:Entity`, and `jayostis/spec#34` (ASK-05) ruled that out
 * — the axiom is PROV-O alignment and says nothing about records. The
 * replacement is the marker `cascade:RecordClass`, which `jayostis/spec#50`
 * adds, with `src/record-types/pending-spec-50.json` standing in for what the
 * bridge could not see until the pin moved.
 *
 * That list was compared BOTH WAYS — asserted still needed, not merely
 * consulted — so the day `conformance/scripts/SPEC_PIN` moved to the revision
 * carrying the marker, these tests went red saying exactly what to delete
 * rather than going quietly green on a workaround nobody needed any more. The
 * bridge, the pending list and the one hand-declared supersedes link were
 * removed together in the commit that answered them.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, beforeAll } from 'vitest';

import {
  NAME_COLLISIONS,
  allRecordTypes,
  assembleRecordTypes,
  recordTypeFor,
  recordTypeForClass,
} from '../../src/record-types/index.js';
import { DERIVED_CLASSES } from '../../src/spec/derived/record-types.generated.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ONTOLOGIES = join(repoRoot, 'src/spec/ontologies');

const DEPRECATED = 'http://www.w3.org/2002/07/owl#deprecated';
const RECORD_CLASS = 'https://ns.cascadeprotocol.org/core/v1#RecordClass';

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

/** Every live class carrying the marker — the population, re-derived here. */
const marked = [...nodes]
  .filter(([, node]) => (node['@type'] ?? []).includes(RECORD_CLASS) && !node[DEPRECATED])
  .map(([iri]) => iri);

describe('the derived table is spec\'s record-bearing population', () => {
  it('finds classes at all', () => {
    // A zero-length read makes every assertion below vacuous: nothing derives,
    // nothing is pending, and the suite reports a clean derivation of nothing.
    expect(nodes.size).toBeGreaterThan(500);
    expect(DERIVED_CLASSES.length).toBeGreaterThan(50);
  });

  it('is derived by the marker, and the marker is actually present', () => {
    // THE RULE ITSELF IS UNDER TEST. `cascade:RecordClass` is what
    // `jayostis/spec#50` adds — the explicit list ASK-05's ruling calls for
    // after ruling out `rdfs:subClassOf prov:Entity` as PROV-O alignment.
    //
    // The count assertion is not decoration. `recordPopulation` refuses a graph
    // that marks nothing, but this file re-derives the population itself, and a
    // re-derivation that found zero would agree with a generated table that
    // also found zero — two empty sets comparing equal, and every assertion
    // below vacuous.
    expect(marked.length).toBeGreaterThan(50);
  });

  it('includes every live class the marker reaches, and no deprecated one', () => {
    const derived = new Set(DERIVED_CLASSES.map((entry) => entry.iri));
    const missing = marked.filter((iri) => !derived.has(iri));

    expect(
      missing,
      'src/spec/derived/record-types.generated.ts has drifted from src/spec/. Rebuild with '
      + '`node scripts/build-record-types.mjs`; if the classes really moved, that is a spec bump.',
    ).toEqual([]);
  });

  it('adds nothing the marker does not reach', () => {
    // The other direction, and the one that used to need the pending list. A
    // table that merely CONTAINED the population would pass the assertion above
    // while registering classes spec never marked — which is what the bridge
    // did, 96 alignment axioms at a time.
    const byRule = new Set(marked);
    const extra = DERIVED_CLASSES.map((entry) => entry.iri).filter((iri) => !byRule.has(iri));

    expect(
      extra.sort(),
      'the table registers a class the marker does not reach. There is no pending list any '
      + 'more — spec states the population — so an extra class is a derivation bug here, not a '
      + 'declared exception.',
    ).toEqual([]);
  });
});

describe('names come from the published contexts', () => {
  it('derives all five supersedes links from rdfs:seeAlso, not from a table', () => {
    // FIVE, AND IT WAS FOUR. `clinical:CoverageRecord`'s `rdfs:seeAlso` used to
    // point at `fhir:Coverage` — a documentation link, not the superseding
    // class — leaving the supersession stated only in an `rdfs:comment` no
    // reader can act on, which is why `SUPERSEDES_OVERRIDES` declared that one
    // link by hand. `jayostis/spec#50` gap 2 states the triple now, so the
    // override was deleted and this became a derivation like the other four.
    const withSupersedes = DERIVED_CLASSES
      .filter((entry) => entry.supersedes.length > 0)
      .map((entry) => entry.name)
      .sort();

    expect(withSupersedes).toEqual([
      'AllergyRecord', 'ConditionRecord', 'ImmunizationRecord', 'InsurancePlan', 'LabResultRecord',
    ]);
  });

  it('derives the InsurancePlan link from spec rather than from an override', () => {
    // The override is gone, so this now asserts the DERIVATION carries it —
    // which is the half a passing `recordTypeForClass` could not distinguish.
    // Read one way it says spec was fixed; read the other it says nothing here
    // is quietly standing in for spec any more.
    const insurancePlan = DERIVED_CLASSES.find((entry) => entry.name === 'InsurancePlan');

    expect(insurancePlan?.supersedes)
      .toEqual(['https://ns.cascadeprotocol.org/clinical/v1#CoverageRecord']);
    expect(recordTypeForClass('https://ns.cascadeprotocol.org/clinical/v1#CoverageRecord')?.name)
      .toBe('InsurancePlan');
  });

  it('every derived name is non-empty, and every duplicate is carried as data', () => {
    // WHAT THIS USED TO PIN, AND WHY THAT STOPPED MEANING ANYTHING. It asserted
    // `names.length - new Set(names).size === 1` — a count that was only ever a
    // proxy for "the assembly throws if this grows", back when a second
    // collision would have taken the package down at import. The assembly no
    // longer throws (#89), so the count would have gone on passing while
    // asserting nothing about what happens to the contested name. The four
    // assertions below say what does.
    const names = DERIVED_CLASSES.map((entry) => entry.name);

    expect(names.every((name) => name.length > 0)).toBe(true);

    // The generator's own detector, checked against the table it ships beside:
    // a `NAME_COLLISIONS` that went stale relative to `DERIVED_CLASSES` would
    // be a report of a collision that is not there, or silence about one that
    // is.
    const duplicated = [...new Set(names.filter((name, i) => names.indexOf(name) !== i))].sort();

    expect(NAME_COLLISIONS.map((collision) => collision.name)).toEqual(duplicated);

    for (const collision of NAME_COLLISIONS) {
      expect(collision.claimants.length, collision.name).toBeGreaterThan(1);
      expect(
        DERIVED_CLASSES.filter((entry) => entry.name === collision.name).map((entry) => entry.iri),
        collision.name,
      ).toEqual([...collision.claimants]);
    }
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

describe('a collision costs the contested name and nothing else', () => {
  /**
   * SYNTHETIC, because the real table has no collision left to test against.
   * Spec publishes one duplicate name and `src/record-types/overrides.ts`
   * settles it, so `assembleRecordTypes(DERIVED_CLASSES)` is exactly the case
   * that cannot exhibit the behaviour — which is why the function takes its
   * classes as an argument.
   */
  const derived = (iri: string, name: string) => ({ iri, name, localName: name, supersedes: [] });

  const contested = [
    derived('https://example.org/a#Widget', 'Widget'),
    derived('https://example.org/b#Widget', 'Widget'),
    derived('https://example.org/c#Sprocket', 'Sprocket'),
  ];

  it('assembles, and every uncontested type in the table still resolves', () => {
    // THE WHOLE POINT OF DEFERRING. This used to throw, and it ran at module
    // evaluation: `src/index.ts` re-exports from five modules that import
    // `src/record-types/index.js` at module scope, so one duplicate name in a
    // regenerated table failed `import '@the-cascade-protocol/sdk'` — and
    // `serialize`, `deserialize`, `toJsonLd` and `validate` with it — over one
    // ambiguous name, while every other type in the table was untouched.
    const table = assembleRecordTypes(contested);

    expect(table.recordTypes).toHaveLength(3);
    expect(table.recordTypeFor('Sprocket')?.rdfTypeUri).toBe('https://example.org/c#Sprocket');
    // Both contested CLASSES still read back, because neither class is
    // ambiguous — only the name they share is.
    expect(table.recordTypeForClass('https://example.org/a#Widget')?.name).toBe('Widget');
    expect(table.recordTypeForClass('https://example.org/b#Widget')?.name).toBe('Widget');
  });

  it('throws for the contested name, naming both classes that claim it', () => {
    const table = assembleRecordTypes(contested);

    expect(() => table.recordTypeFor('Widget'))
      .toThrow(/https:\/\/example\.org\/a#Widget and https:\/\/example\.org\/b#Widget/);
    // And says what to do about it. A reader has to know where the answer is
    // declared, or the exception is just a stop.
    expect(() => table.recordTypeFor('Widget')).toThrow(/NAME_OVERRIDES/);
  });

  it('still answers undefined for a name nothing registers', () => {
    // THE DISTINCTION THAT MAKES THE DEFERRAL SAFE. Every caller of
    // `recordTypeFor` reads `undefined` as "not a record type" and takes a
    // different path on it, so a contested name answering `undefined` would be
    // four quiet wrong answers rather than one loud one. An unknown name and a
    // contested name are two questions with two answers.
    const table = assembleRecordTypes(contested);

    expect(table.recordTypeFor('NotARecordType')).toBeUndefined();
    expect(table.recordTypeForClass('https://example.org/z#Nothing')).toBeUndefined();
    expect(recordTypeFor('NotARecordType')).toBeUndefined();
  });

  it('leaves the shipped table with nothing contested', () => {
    // Asserted rather than assumed, because the deferral is what would let the
    // next duplicate name in a regenerated table be absorbed silently — no
    // throw at import, and every uncontested type carrying on as normal. This
    // is what says the day it happens.
    const table = assembleRecordTypes(DERIVED_CLASSES);

    expect(
      [...table.contestedNames.keys()],
      'spec now publishes a name for two record classes that no NAME_OVERRIDES entry settles. '
      + 'recordTypeFor() throws for it and nothing else is affected — but until an override says '
      + 'which spelling each class returns, that name resolves to nothing at all.',
    ).toEqual([]);
    expect([...table.contestedClasses.keys()]).toEqual([]);
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
