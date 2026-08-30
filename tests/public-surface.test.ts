/**
 * A type named in the package's public surface can be IMPORTED from it.
 *
 * `ValidationError.severity` is typed `Severity`, and `ValidationError` is
 * re-exported from the entry point. A consumer writing an exhaustive `switch`
 * over `err.severity`, or a helper that takes one, therefore needs a name the
 * entry point never exposed — so they inline the union instead, and nothing
 * tells them when a fourth grade is added.
 *
 * `Output` is re-exported for exactly this reason (`src/index.ts`), on the same
 * argument: an argument type of a shipped class is public whether or not it is
 * listed, and `exports` allows no deep import to reach around and name it.
 *
 * THIS FILE ONLY PROVES ANYTHING UNDER `npm run typecheck`. vitest transpiles
 * without typechecking, so the import below is erased before the runtime
 * assertion runs; `tsconfig.typecheck.json` is what compiles it, and this file
 * is listed in that config's `include`.
 */

import { describe, it, expect } from 'vitest';

import { validate, type Severity, type ValidationError } from '../src/index.js';

describe('the validator types', () => {
  it('exports Severity by the name ValidationError uses', () => {
    // A value declared `Severity` and assigned to the field: the two are only
    // interchangeable if the exported name is the one the interface refers to,
    // which is the whole claim.
    const grade: Severity = 'warning';
    const finding: ValidationError = { field: 'interpretation', message: 'reported', severity: grade };

    expect(finding.severity).toBe('warning');
  });

  it('covers every grade a result can carry', () => {
    // Exhaustive over the union rather than over an example: if a fourth grade
    // is added, this stops compiling here rather than at a consumer.
    const label = (grade: Severity): string => {
      switch (grade) {
        case 'error':
          return 'blocks';
        case 'warning':
          return 'reported';
        case 'info':
          return 'noted';
      }
    };

    expect(['error', 'warning', 'info'].map((g) => label(g as Severity))).toEqual([
      'blocks',
      'reported',
      'noted',
    ]);
  });

  it('is the same union validate() actually produces', () => {
    const result = validate({ id: '', type: 'AllergyRecord' } as never);
    const grades: Severity[] = result.errors.map((e) => e.severity);

    expect(grades.every((g) => g === 'error')).toBe(true);
  });
});
