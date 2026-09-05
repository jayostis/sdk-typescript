/**
 * Agree with the oracle, or refuse loudly, across the corpus.
 *
 * Over every top-level fixture's `expectedOutput.turtle`. Where the engine
 * evaluated a graph in full — nothing unevaluated, something evaluated — its
 * verdict and its set of violations must equal the oracle's. Where it did
 * not, the fixture is listed with what went unjudged and nothing else is
 * asserted of it: an engine may not know a component yet, but it may never
 * disagree in silence on one it claims to know.
 *
 * NOT VACUOUS BY CONSTRUCTION. The fully-evaluated set must contain the three
 * imm fixtures, so an engine that refused everything — the cheapest way to
 * never disagree — fails here.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, beforeAll } from 'vitest';

import { quadsFromTurtle } from '../support/graph.js';
import { engineOverSpec, oracleOverSpec, oracleTuplesOf, tuplesOf, SH } from './harness.js';

const fixturesDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../conformance/fixtures');

/** Every top-level fixture id — the families in subdirectories are other suites' business. */
const FIXTURE_IDS = readdirSync(fixturesDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''))
  .sort();

interface Outcome {
  readonly id: string;
  readonly evaluated: number;
  readonly unevaluated: readonly string[];
  /** Set only for a fully-evaluated fixture whose two judges differ. */
  readonly disagreement?: string;
}

/**
 * The fixtures the engine refuses at the pin, by name, sorted. Every one is
 * refused on `sh:minInclusive` / `sh:maxInclusive`, `sh:or` over property
 * alternatives, `sh:class`, or because no shape targets its class at all.
 */
const REFUSED_AT_THE_PIN: readonly string[] = [
  'benefit-001', 'claim-001',
  'dailyactivity-001', 'dailyactivity-002', 'dailysleep-001', 'dailysleep-002',
  'dailyvital-001', 'dailyvital-002',
  'denial-001', 'device-001',
  'encounter-001', 'encounter-002', 'encounter-003',
  'fam-001', 'fam-002', 'fam-003',
  'imaging-001',
  'med-001', 'med-002', 'med-003', 'med-004', 'med-005', 'med-006', 'med-007', 'med-008', 'med-009', 'med-010', 'med-011',
  'medadmin-001',
  'pod-001', 'pod-002', 'pod-003',
  'proc-001', 'proc-002', 'proc-003', 'proc-004',
  'profile-001', 'profile-002', 'profile-003', 'profile-004', 'profile-005',
  'social-003',
];

const outcomes: Outcome[] = [];

beforeAll(async () => {
  for (const id of FIXTURE_IDS) {
    const fixture = JSON.parse(readFileSync(join(fixturesDir, `${id}.json`), 'utf-8')) as {
      expectedOutput: { turtle: string };
    };
    const quads = quadsFromTurtle(fixture.expectedOutput.turtle);
    const engine = engineOverSpec(quads);

    if (engine.unevaluated.length > 0 || engine.evaluated === 0) {
      outcomes.push({ id, evaluated: engine.evaluated, unevaluated: engine.unevaluated });
      continue;
    }

    const oracle = await oracleOverSpec(quads);
    const differs = engine.conforms !== oracle.conforms
      || JSON.stringify(tuplesOf(engine)) !== JSON.stringify(oracleTuplesOf(oracle));

    outcomes.push({
      id,
      evaluated: engine.evaluated,
      unevaluated: [],
      ...(differs
        ? {
          disagreement: `${id}: engine conforms=${engine.conforms} ${JSON.stringify(tuplesOf(engine))}; `
            + `oracle conforms=${oracle.conforms} ${JSON.stringify(oracleTuplesOf(oracle))}`,
        }
        : {}),
    });
  }
}, 120_000);

const fullyEvaluated = (): Outcome[] => outcomes.filter((o) => o.unevaluated.length === 0 && o.evaluated > 0);
const refused = (): Outcome[] => outcomes.filter((o) => o.unevaluated.length > 0 || o.evaluated === 0);

/** The refusals, as the listing a reader acts on. */
const listing = (): string => refused()
  .map((o) => `${o.id}: ${o.evaluated === 0 ? 'nothing evaluated' : o.unevaluated.map((p) => p.replace(SH, 'sh:')).join(', ')}`)
  .join('\n');

describe('evaluate', () => {
  it('reached every top-level fixture', () => {
    expect(FIXTURE_IDS.length).toBeGreaterThan(50);
    expect(outcomes.map((o) => o.id)).toEqual(FIXTURE_IDS);
  });

  it('agrees with the oracle on every fixture it evaluated in full', () => {
    const disagreements = fullyEvaluated().flatMap((o) => (o.disagreement ? [o.disagreement] : []));

    expect(
      disagreements,
      `fully evaluated ${fullyEvaluated().length} of ${outcomes.length}; refused:\n${listing()}`,
    ).toEqual([]);
  });

  it('evaluates the imm family in full, so the loop cannot be vacuous', () => {
    const ids = fullyEvaluated().map((o) => o.id);

    expect(ids, `refused:\n${listing()}`).toEqual(expect.arrayContaining(['imm-001', 'imm-002', 'imm-003']));
  });

  it('refuses exactly the fixtures it refused when this was written, by name', () => {
    // THE COMPARED SET CANNOT SHRINK IN SILENCE. A refused fixture is listed
    // and passed over, so an engine that started refusing a parameter it used
    // to judge would drop fixtures out of oracle comparison and every
    // assertion above would stay green (`tests/README.md`: a skip that reports
    // green is worse than a failure). The list is written by hand, not
    // measured; an engine that judges more moves a name OFF it deliberately,
    // and one that judges less puts a name on and is asked why.
    expect(refused().map((o) => o.id)).toEqual(REFUSED_AT_THE_PIN);
  });

  it('refuses by naming a parameter, never by naming nothing', () => {
    // A refusal is only loud if a reader can act on it. An entry that is not
    // a `sh:` parameter IRI names nothing anyone can implement.
    for (const outcome of refused()) {
      for (const parameter of outcome.unevaluated) {
        expect(parameter, outcome.id).toMatch(new RegExp(`^${SH}[A-Za-z]+$`));
      }
    }
  });
});
