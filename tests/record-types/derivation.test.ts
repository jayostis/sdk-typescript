/**
 * The committed table is what derivation produces from `spec`, and this is
 * what says so.
 *
 * `src/record-types/table.ts` is hand-committed because `src/` cannot read a
 * `spec` checkout — a consumer installs `dist` and has none. A committed copy
 * of somebody else's fact is exactly what #69 exists to remove, so the copy
 * has to be COMPARED rather than trusted: this re-runs the derivation against
 * the checkout and fails naming the row that moved.
 *
 * The table it replaces was equally hand-written and nothing compared it to
 * anything, which is how `InsurancePlan` spent five releases pointing at
 * `clinical:CoverageRecord` (#26). The point of this file is that the same
 * mistake now has somewhere to be reported.
 *
 * The synthetic cases are not decoration. `SocialHistoryRecord` is the only
 * local-name collision the corpus contains, so without classes written by hand
 * the collision rule would be tested once, by accident of what `spec` happens
 * to declare today.
 */

import { describe, it, expect } from 'vitest';

import {
  RDF_TYPE_OVERRIDES,
  deriveRecordTypes,
  allRecordTypes,
} from '../../src/record-types/index.js';
import { RECORD_CLASSES } from '../../src/record-types/table.js';
import { ontologyClasses } from '../support/ontology-classes.js';

/** Every name this SDK accepts, canonical and alias alike. */
const ACCEPTED_NAMES = Object.keys(RECORD_CLASSES);

describe('derivation against the spec checkout', () => {
  it('resolves every name it does not report as unresolved', () => {
    const { derived, unresolved } = deriveRecordTypes(ontologyClasses(), ACCEPTED_NAMES);

    expect(derived.size + unresolved.length).toBe(ACCEPTED_NAMES.length);
  });

  it('reports exactly these six names as needing an override', () => {
    // Enumerated, not counted. `toHaveLength(6)` passes on a list with the
    // right size and the wrong contents, which is the failure this exists to
    // catch — a class arriving in `spec` under a name an override already
    // covers would keep the count and change the meaning.
    const { unresolved } = deriveRecordTypes(ontologyClasses(), ACCEPTED_NAMES);

    expect([...unresolved].sort()).toEqual([
      'ClinicalSocialHistoryRecord',
      'CoverageRecord',
      'MedicationRecord',
      'ProcedureRecord',
      'SocialHistoryConsent',
      'SocialHistoryRecord',
    ]);
  });

  it('has an override for every unresolved name, and no override it does not need', () => {
    // Both directions. An override with nothing to override is a line nobody
    // will delete, and it hides the day derivation stops resolving a row.
    const { unresolved } = deriveRecordTypes(ontologyClasses(), ACCEPTED_NAMES);

    expect(Object.keys(RDF_TYPE_OVERRIDES).sort()).toEqual([...unresolved].sort());
  });

  it('names SocialHistoryRecord as the corpus collision, with both candidates', () => {
    const { ambiguous } = deriveRecordTypes(ontologyClasses(), ACCEPTED_NAMES);

    expect(ambiguous).toEqual([
      {
        name: 'SocialHistoryRecord',
        candidates: ['clinical:SocialHistoryRecord', 'health:SocialHistoryRecord'],
      },
    ]);
  });

  it('agrees with the committed table on every derived row', () => {
    // The assertion this file exists for. 33 rows, each named on failure.
    const { derived } = deriveRecordTypes(ontologyClasses(), ACCEPTED_NAMES);
    const disagreements: string[] = [];

    for (const [name, curie] of derived) {
      if (RECORD_CLASSES[name] !== curie) {
        disagreements.push(`${name}: spec says ${curie}, table says ${RECORD_CLASSES[name]}`);
      }
    }

    expect(
      disagreements,
      'src/record-types/table.ts has drifted from the ontologies. The derivation is the '
      + 'authority: correct the table, or add an override saying why the derived class is not '
      + 'the one this SDK writes.',
    ).toEqual([]);
  });

  it('derives 33 of the 39 accepted names', () => {
    // A count as well as the contents, because a name silently disappearing
    // from `ACCEPTED_NAMES` would leave every assertion above passing.
    const { derived } = deriveRecordTypes(ontologyClasses(), ACCEPTED_NAMES);

    expect(ACCEPTED_NAMES).toHaveLength(39);
    expect(derived.size).toBe(33);
    expect(allRecordTypes()).toHaveLength(36);
  });
});

describe('what the checkout provides', () => {
  it('finds the classes at all', () => {
    // A zero-length read makes every assertion above vacuous: nothing derives,
    // everything is unresolved, and the suite reports a clean derivation of
    // nothing. The count is loose on purpose — it is a floor, not a fact.
    const classes = ontologyClasses();

    expect(classes.length).toBeGreaterThan(100);
    expect(classes.map((c) => `${c.prefix}:${c.localName}`)).toContain('clinical:Medication');
  });

  it('sees owl:deprecated in both spellings', () => {
    // `true` and `"true"^^xsd:boolean` are the same triple and `spec` writes
    // both. A detector matching only the bare form calls
    // `clinical:CoverageRecord` live, and `CoverageRecord` then derives
    // straight back to the class #26 removed — a wrong answer shaped exactly
    // like a right one, since the row it produces looks derived.
    const deprecated = ontologyClasses()
      .filter((c) => c.deprecated)
      .map((c) => `${c.prefix}:${c.localName}`)
      .sort();

    expect(deprecated).toEqual([
      'clinical:Allergy',
      'clinical:Condition',
      // The typed spelling, `clinical.ttl:190`. The other four use the bare one.
      'clinical:CoverageRecord',
      'clinical:Immunization',
      'clinical:LabResult',
    ]);
  });
});

describe('the collision rule, on classes the corpus does not contain', () => {
  it('reports a collision rather than taking the first candidate', () => {
    const { derived, ambiguous, unresolved } = deriveRecordTypes(
      [
        { prefix: 'health', localName: 'Widget' },
        { prefix: 'clinical', localName: 'Widget' },
      ],
      ['Widget'],
    );

    expect(ambiguous).toEqual([
      { name: 'Widget', candidates: ['clinical:Widget', 'health:Widget'] },
    ]);
    expect(derived.has('Widget')).toBe(false);
    // In BOTH lists: `ambiguous` says why, `unresolved` says something must
    // decide. A caller reading only `unresolved` cannot miss a collision.
    expect(unresolved).toEqual(['Widget']);
  });

  it('reports a name no class declares', () => {
    const { derived, ambiguous, unresolved } = deriveRecordTypes(
      [{ prefix: 'health', localName: 'Widget' }],
      ['Sprocket'],
    );

    expect(derived.size).toBe(0);
    expect(ambiguous).toEqual([]);
    expect(unresolved).toEqual(['Sprocket']);
  });

  it('does not derive to a deprecated class, even on an exact match', () => {
    // The rule `CoverageRecord` needs. A deprecated class is still READ — it
    // is in `acceptedClassUris` — but a class this SDK must never write cannot
    // be what a name derives to.
    const { derived, unresolved } = deriveRecordTypes(
      [{ prefix: 'clinical', localName: 'Widget', deprecated: true }],
      ['Widget'],
    );

    expect(derived.has('Widget')).toBe(false);
    expect(unresolved).toEqual(['Widget']);
  });

  it('derives to the live class when a deprecated one shares its local name', () => {
    // Not a collision: one candidate survives the deprecation filter, so this
    // resolves rather than asking a human. Written down because the two rules
    // interact and the wrong composition — filter after choosing — would
    // report an ambiguity that does not exist.
    const { derived, ambiguous } = deriveRecordTypes(
      [
        { prefix: 'clinical', localName: 'Widget', deprecated: true },
        { prefix: 'health', localName: 'Widget' },
      ],
      ['Widget'],
    );

    expect(ambiguous).toEqual([]);
    expect(derived.get('Widget')).toBe('health:Widget');
  });

  it('is not confused by a class declared twice in one vocabulary', () => {
    // Same CURIE twice is one candidate, not two. `spec` does not do this
    // today; a merge that duplicated a block would, and reporting it as a
    // collision would send a reader looking for a second vocabulary.
    const { derived, ambiguous } = deriveRecordTypes(
      [
        { prefix: 'health', localName: 'Widget' },
        { prefix: 'health', localName: 'Widget' },
      ],
      ['Widget'],
    );

    expect(ambiguous).toEqual([]);
    expect(derived.get('Widget')).toBe('health:Widget');
  });
});
