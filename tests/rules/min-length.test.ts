/**
 * `sh:minLength` — an empty value is reported, and a blank one is not.
 *
 * THE RULE, from `spec`: 30 `sh:property` blocks across the four vendored shape
 * files declare an `sh:minLength`, over 28 distinct predicates, and every one of
 * them is 1. Until this landed, `Constraint.minLength` was a declared field that
 * nothing read, so `medicationName: ''` satisfied a `minCount: 1` — one member
 * is present, and nobody asked how long it was.
 *
 * THE CONTESTABLE PART, and the reason this file exists rather than one added
 * assertion in `validator.test.ts`. SHACL's condition is the length of the value
 * node AFTER CONVERSION TO STRING, so `'  '` is two characters and conforms.
 * The check does not trim, and two tests below say so out loud, because the
 * opposite is the obvious-looking change for someone reading `''` and `'  '`
 * side by side. A whitespace-only name IS a defect — it is just not this
 * constraint's, `sh:pattern` being the one that would state it, and no vendored
 * shape declaring one. Trimming here would reject records `pyshacl` accepts, and
 * a validator that disagrees with the shapes is the thing this SDK has the
 * hardest time noticing.
 *
 * ON THE TERM, NOT IN A VALIDATOR. Length is a fact about a PREDICATE, true
 * wherever it appears, which is why one declaration covers six record types and
 * why {@link tests/terms/min-length-complete.test.ts} can check it against the
 * shapes at all. `clinical:ProcedureShape` is the case that separates a length
 * from a presence: `clinical:procedureName` carries an `sh:minLength 1` and no
 * `sh:minCount`, so an absent name conforms and a present empty one does not.
 * The last block below is that asymmetry, asserted.
 *
 * @see src/terms/types.ts               TermSpec.minLength
 * @see src/validator/term-findings.ts   where it is enforced
 */

import { describe, it, expect } from 'vitest';

import { validate } from '../../src/validator/validator.js';
import { allTerms } from '../../src/terms/index.js';
import { record, messagesFor } from './records.js';

/** The message the rule produces, so a test asserts what a caller reads. */
const tooShort = (field: string, length: number): string =>
  `${field} is ${length} characters; the vocabulary requires at least 1`;

/** Whether any finding on `field` came from the length rule. */
const lengthMessages = (result: Parameters<typeof messagesFor>[0], field: string): string[] =>
  messagesFor(result, field).filter((m) => m.includes('characters'));

/**
 * Every field a term gives an `sh:minLength`, with a record type that carries
 * it and the other fields that type needs to get past its own required checks.
 *
 * Hand-paired rather than derived: a term knows its predicate and not which
 * record types use it, and a wrong pairing here would test the rule against a
 * record the field means nothing on.
 */
const TERMED: ReadonlyArray<readonly [string, string, Record<string, unknown>]> = [
  ['MedicationRecord', 'medicationName', { isActive: true }],
  ['ConditionRecord', 'conditionName', { status: 'active' }],
  ['AllergyRecord', 'allergen', {}],
  ['LabResultRecord', 'testName', { resultValue: '412', resultUnit: 'ng/mL' }],
  ['ImmunizationRecord', 'vaccineName', {}],
  ['CoverageRecord', 'providerName', {}],
  ['FamilyHistoryRecord', 'relationship', { conditionName: 'Type 2 diabetes' }],
];

describe('the sweep covers what it claims to', () => {
  it('checks every term that declares a minLength, so an empty sweep cannot pass', () => {
    // Without this the file goes green the day a term drops `minLength` or the
    // pairing list falls behind — a vacuous pass in a file about vacuous passes.
    const declaring = allTerms()
      .filter((term) => term.minLength !== undefined)
      .map((term) => term.key)
      .sort();

    expect(declaring).toEqual([...TERMED.map(([, field]) => field)].sort());
  });

  it('every one of them is minLength 1, which is what the message hardcodes', () => {
    // `tooShort` above writes "at least 1". The day a shape declares a longer
    // minimum, that helper is wrong and this says so rather than the assertions
    // failing one by one with a confusing diff.
    const lengths = new Set(
      allTerms()
        .filter((term) => term.minLength !== undefined)
        .map((term) => term.minLength),
    );

    expect([...lengths]).toEqual([1]);
  });
});

describe('an empty string is reported', () => {
  it.each(TERMED)('%s.%s of zero length is a finding naming the length', (type, field, rest) => {
    const result = validate(record(type, { ...rest, [field]: '' }));

    expect(lengthMessages(result, field)).toEqual([tooShort(field, 0)]);
    expect(result.valid).toBe(false);
  });

  it.each(TERMED)('%s.%s does NOT report a length when it holds a real value', (type, field, rest) => {
    const result = validate(record(type, { ...rest, [field]: 'Metoprolol' }));

    expect(lengthMessages(result, field)).toEqual([]);
  });
});

describe('a blank string is NOT reported, because sh:minLength counts characters', () => {
  it.each(TERMED)('%s.%s of two spaces conforms, exactly as pyshacl reads it', (type, field, rest) => {
    // DELIBERATE, and the single most likely thing to be "fixed" by someone
    // who has not read the shape. SHACL measures the value node converted to
    // string; `'  '` is length 2. Making this pass by trimming would put the
    // validator ahead of the vocabulary, which the fixture contract asserts it
    // never is. If a blank name should be rejected, the shape needs an
    // `sh:pattern` first and this file changes after it, not before.
    const result = validate(record(type, { ...rest, [field]: '  ' }));

    expect(lengthMessages(result, field)).toEqual([]);
  });

  it('a single space is one character, and one is what the vocabulary asks for', () => {
    const result = validate(record('AllergyRecord', { allergen: ' ' }));

    expect(lengthMessages(result, 'allergen')).toEqual([]);
  });
});

describe('a length is not a presence, and the two report differently', () => {
  it.each(TERMED)('%s.%s absent raises no length finding at all', (type, field, rest) => {
    // THE ASYMMETRY `clinical:ProcedureShape` MAKES REAL: `clinical:procedureName`
    // carries an `sh:minLength 1` and no `sh:minCount`, so a record without one
    // conforms. A length rule that fired on absence would reject it — and would
    // report "0 characters" about a field the caller never wrote, which is the
    // same wrong-defect message `required-field-arity` exists to prevent.
    const result = validate(record(type, rest));

    expect(lengthMessages(result, field)).toEqual([]);
  });

  it('medicationName absent says required, and empty says how long it is', () => {
    const absent = validate(record('MedicationRecord', { isActive: true }));
    const empty = validate(record('MedicationRecord', { isActive: true, medicationName: '' }));

    expect(messagesFor(absent, 'medicationName')).toEqual([
      'medicationName is required for MedicationRecord',
    ]);
    expect(messagesFor(empty, 'medicationName')).toEqual([tooShort('medicationName', 0)]);
  });
});

describe('every member, and only the members it can measure', () => {
  it('reports the empty value in a repeated predicate, not just the first', () => {
    // The faithful reader returns an array for any repeated predicate, so a
    // document carrying two `clinical:allergen` triples arrives shaped like
    // this. Checking only `members[0]` would pass a graph whose second value is
    // empty — the partial answer this SDK is least able to detect.
    const result = validate(record('AllergyRecord', { allergen: ['peanut', ''] }));

    expect(lengthMessages(result, 'allergen')).toEqual([tooShort('allergen', 0)]);
  });

  it('a non-string value raises no length finding, rather than being stringified', () => {
    // `sh:minLength` is ill-formed against a blank node, and measuring
    // `String(0)` as one character would invent a rule out of a datatype the
    // shape constrains separately. The value is wrong here and something else
    // has to be what says so.
    const result = validate(record('AllergyRecord', { allergen: 0 }));

    expect(lengthMessages(result, 'allergen')).toEqual([]);
  });
});
