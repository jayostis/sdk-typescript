/**
 * Five named terms classify correctly — enum-vs-structured, tested directly.
 *
 * #91 rejects "count `rdfs:domain`-linked properties" as the enum-vs-structured
 * test, because it disagrees with the members test on 39 of 89 ranges, always
 * by calling something a closed set that is not: `rdfs:Resource`,
 * `rdf:List` and a structured class with no declared fields would all be
 * (wrongly) treated as code lists, and a converter would then refuse every
 * real value for them.
 *
 * This asserts the five classifications the issue names DIRECTLY — a term is
 * a code list exactly when its range has a published value set
 * (`SPEC_TERMS.valueSets[range]` is defined) — and does not implement the
 * rejected domain-property rule to compare against it. Nothing ships that
 * rule; a test that reimplemented it here would be asserting a number about a
 * strawman and pass forever.
 *
 * Every IRI below is hand-copied from the pinned `spec` checkout
 * (`conformance/scripts/SPEC_PIN`), not read off the generated table.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, beforeAll } from 'vitest';

import { SPEC_TERMS } from '../../src/spec/derived/terms.generated.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ONTOLOGIES = join(repoRoot, 'src/spec/ontologies');

beforeAll(() => {
  if (!existsSync(ONTOLOGIES)) {
    execFileSync('node', [join(repoRoot, 'scripts/build-spec-data.mjs')], { cwd: repoRoot });
    execFileSync('node', [join(repoRoot, 'scripts/build-terms.mjs')], { cwd: repoRoot });
  }
}, 60_000);

const CORE = 'https://ns.cascadeprotocol.org/core/v1#';
const HEALTH = 'https://ns.cascadeprotocol.org/health/v1#';
const RDFS_RESOURCE = 'http://www.w3.org/2000/01/rdf-schema#Resource';
const RDF_LIST = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#List';

interface Case {
  readonly label: string;
  readonly vocabulary: string;
  readonly term: string;
  readonly range: string;
  /** The table's "is it a code list?" column. */
  readonly codeList: boolean;
}

const CASES: readonly Case[] = [
  // yes — 3 subclasses. The rule the current code already gets right.
  { label: 'dataProvenance / cascade:DataProvenance', vocabulary: 'core', term: 'dataProvenance', range: `${CORE}DataProvenance`, codeList: true },
  // yes — 3 named individuals. What #91 adds; RED at HEAD.
  { label: 'consentScope / cascade:ConsentScope', vocabulary: 'core', term: 'consentScope', range: `${CORE}ConsentScope`, codeList: true },
  // no — any identifier. Wrongly "yes" under the rejected domain-property rule.
  { label: 'creatorWebID / rdfs:Resource', vocabulary: 'core', term: 'creatorWebID', range: RDFS_RESOURCE, codeList: false },
  // no — an ordered list. Also wrongly "yes" under the rejected rule.
  { label: 'provenanceLayers / rdf:List', vocabulary: 'core', term: 'provenanceLayers', range: RDF_LIST, codeList: false },
  // no — a structured class with no declared fields. Also wrongly "yes" under
  // the rejected rule, and one of the six spec-row gaps #91's worklist reports.
  { label: 'hrvHistory / health:HRVReading', vocabulary: 'health', term: 'hrvHistory', range: `${HEALTH}HRVReading`, codeList: false },
];

describe('enum-vs-structured classification of five named terms', () => {
  it.each(CASES)('$label resolves against the range the table says it should', ({ vocabulary, term, range }) => {
    expect(SPEC_TERMS.vocabularies[vocabulary]?.[term]?.range).toBe(range);
  });

  it.each(CASES)('$label classifies as codeList=$codeList', ({ range, codeList }) => {
    const members = SPEC_TERMS.valueSets[range];

    if (codeList) {
      expect(members, `${range} should publish a value set — it is a code list`).toBeDefined();
      expect(Object.keys(members ?? {}).length, `${range}'s value set should not be empty`)
        .toBeGreaterThan(0);
    } else {
      expect(
        members,
        `${range} must NOT be treated as a closed code list — a converter that saw a value set `
        + 'here would refuse every real value for it.',
      ).toBeUndefined();
    }
  });
});
