/**
 * What `clinical:MedicationShape` says about a medication, as data.
 *
 * Every line is transcribed from one `sh:property` block of
 * `spec/ontologies/clinical/v1/clinical.shapes.ttl`; nothing here is inferred.
 *
 * SEPARATE FROM THE MODEL, deliberately. `src/models/medication.ts` compiles to
 * `export {};` — an interface emits nothing — and every import of it across
 * `src/` is an `import type`, so a model costs a consumer nothing at runtime.
 * A class in that file would make it emit code and turn `src/index.ts`'s
 * `export type` into a real export, changing what the package ships. The rules
 * live one directory down instead, reached by whatever walks them and by
 * nothing that only wants the type.
 *
 * `Constraints<Medication>` FORCES a `minCount: 1` for every field the
 * interface marks required, so a field added to the model without a rule here
 * is a compile error naming the field. That is the drift this layer exists to
 * stop — `givenName` was required by a switch, declared by a model, and
 * required by no shape at all, and nothing put those three claims in one place.
 *
 * `minLength` is DECLARED AND NOT YET ENFORCED. `CascadeEntityValidator`
 * currently checks presence and arity only; carrying the value now means the
 * transcription is complete when the check arrives, rather than a third of a
 * property block being silently dropped in the meantime.
 *
 * @see spec/ontologies/clinical/v1/clinical.shapes.ttl  clinical:MedicationShape
 * @module models/validators
 */

import { CascadeEntityValidator } from '../../validator/entity-validator.js';
import type { Constraints, Finding, RecordFields } from '../../validator/entity-validator.js';
import type { Medication } from '../medication.js';

export class MedicationValidator extends CascadeEntityValidator<Medication> {
  readonly type = 'MedicationRecord' as const;

  additionalConstraints(): Constraints<Medication> {
    return {
      // clinical.shapes.ttl:759 — the only field the shape requires.
      // NO maxCount: the term carries it. A cap is true of the predicate
      // wherever it appears; a minCount is true of this record type only.
      medicationName: { minCount: 1, minLength: 1 },

      // THE SHAPE DOES NOT REQUIRE THIS AND THE MODEL DOES.
      // `clinical:MedicationShape` gives `clinical:status` an `sh:maxCount 1`
      // and no `sh:minCount`, so a medication without one conforms. The model
      // declares `isActive: boolean`, non-optional, which is what obliges the
      // `minCount: 1` below — `Constraints<Medication>` will not compile
      // without it.
      //
      // Recorded rather than resolved. It is the same disagreement as
      // `givenName` on a patient profile (#47): a requirement this SDK asserts
      // that the vocabulary does not, and the fix is either to relax the model
      // or to add the `sh:minCount` upstream. Until someone decides, the model
      // wins here, because the alternative is a validator that silently
      // disagrees with the interface a caller is programming against.
      isActive: { minCount: 1, maxCount: 1 },

      // Capped and not required. Each is one `sh:maxCount 1` in the same shape.
      dose: { maxCount: 1 },
      route: { maxCount: 1 },
      frequency: { maxCount: 1 },
      prescriber: { maxCount: 1 },
      rxNormCode: { maxCount: 1 },
      indication: { maxCount: 1 },

      // NOT courseOfTherapyType. Its value set binds one list on one shape, so
      // it is a fact about the predicate rather than about this record type,
      // and it lives in `src/terms/definitions/course-of-therapy-type.ts`.
      // Only the four predicates that bind DIFFERENT lists per shape (#45)
      // would belong here.
    };
  }

  /**
   * A medication should carry at least one standard code.
   *
   * THE CASE A PER-FIELD CONSTRAINT CANNOT STATE, and the reason this hook
   * exists. The rule is a disjunction over three fields — any of `loincCode`,
   * `testCode` or `snomedCode` satisfies it — so no `Constraint` on any one of
   * them says it. Declaring `minCount: 1` on all three would demand all three;
   * declaring it on none says nothing.
   *
   * A WARNING, not an error. No shape requires a coding, and `validate()`
   * computes `valid` from errors alone, so filing this as an error would refuse
   * a conformant record. It is reported because a record without one is
   * interoperable with nothing.
   *
   * Reported against `loincCode` because a finding needs a field to hang on and
   * that is the one a clinical record most often means. That is a presentation
   * choice, not a claim that `loincCode` specifically is missing.
   */
  protected override crossFieldFindings(rec: RecordFields): readonly Finding[] {
    const present = (field: string): boolean => {
      const value = rec[field];
      if (value === undefined || value === null) return false;
      return Array.isArray(value) ? value.length > 0 : true;
    };

    if (present('loincCode') || present('testCode') || present('snomedCode')) return [];

    return [
      {
        field: 'loincCode',
        message:
          'Missing loincCode or snomedCode on clinical record; standard coding ' +
          'improves interoperability',
        severity: 'warning',
      },
    ];
  }
}
