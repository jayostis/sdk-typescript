/**
 * The `resultValue` term: `health:resultValue`.
 *
 * Pure. No serializer, no fixture loader, no RDF library — a term returns DATA
 * and this file reads that data, so what fails here is the term's own rule.
 *
 * Termed for its CARDINALITY rather than for its rule, which is why the rule is
 * what this file spends most of its assertions on: terming a field moves it
 * from the serializer's type-driven chain onto the term fork, and a rule that
 * does not reproduce the old output changes every record that carries the
 * field. `{ form: 'number' }` is the claim, and it is not the obvious choice —
 * the model types this `string`.
 *
 * @see spec/ontologies/health/v1/health.shapes.ttl  health:LabResultRecordShape
 * @see tests/conformance/lab.test.ts                the cardinality end to end
 */

import { describe, it, expect } from 'vitest';

import { termFor } from '../../src/terms/index.js';
import { requirePredicate } from '../../src/terms/term.js';

const LAB = { id: 'urn:uuid:lab008-aaaa-bbbb-cccc-ddddeeeeffff', type: 'LabResultRecord' };
const outputs = (value: unknown) => termFor('resultValue')?.outputsFor({ ...LAB, resultValue: value });

describe('resultValue', () => {
  it('references the registered predicate rather than declaring one', () => {
    expect(termFor('resultValue')?.predicate).toBe('health:resultValue');
    expect(requirePredicate('resultValue')).toBe('health:resultValue');
  });

  it('writes a quoted literal for a string, which is what the model declares', () => {
    // `resultValue?: string`, and lab-001 / lab-008 pass strings. `form:
    // 'number'` falls back to a quoted literal for anything that is not a
    // number, which is the same fall-through `emitField` takes, so the common
    // case is unchanged by terming the field.
    expect(outputs('4')).toEqual([
      { kind: 'literal', predicate: 'health:resultValue', value: '4' },
    ]);
  });

  it('writes a bare token for a number, integer and decimal alike', () => {
    // `emitField` has always taken its numeric branch for a numeric value, so
    // `4` was already a bare `4` and `4.2` a bare `4.2` — RDF 1.1 types those
    // as xsd:integer and xsd:decimal without the datatype being spelled out.
    // `form: 'literal'` would have quoted both and changed the graph.
    expect(outputs(4)).toEqual([{ kind: 'number', predicate: 'health:resultValue', value: 4 }]);
    expect(outputs(4.2)).toEqual([{ kind: 'number', predicate: 'health:resultValue', value: 4.2 }]);
  });

  it('writes one output per member, leaving the cap to the validator', () => {
    // Two values break sh:maxCount 1 and are written anyway: a shape can only
    // judge what reached the graph, so a term that dropped the second value
    // would put the judging back in the writer and leave the validator nothing
    // to object to.
    //
    // The other half of that division is asserted, not merely asserted ABOUT:
    // `tests/validator.test.ts > term-driven rules > reports a field carrying
    // more values than the vocabulary permits` runs this same record through
    // `validate()` and expects the violation. Without that, this test's name
    // makes a promise about a validator no test here can reach.
    expect(outputs(['4.2', '4.3'])).toEqual([
      { kind: 'literal', predicate: 'health:resultValue', value: '4.2' },
      { kind: 'literal', predicate: 'health:resultValue', value: '4.3' },
    ]);
  });

  it('writes nothing for a record that carries no result value', () => {
    expect(termFor('resultValue')?.outputsFor(LAB)).toEqual([]);
  });
});
