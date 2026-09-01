/**
 * health v2.8 / clinical v1.16 — `health:interpretation`: the ratified reading
 * of a result, carried beside the source's own verbatim code on
 * `health:interpretationSourceCode`.
 *
 * Termed for its VALUE SET and its CAP. `health:LabResultRecordShape`,
 * `clinical:LabResultShape` and `clinical:VitalSignShape` all bind it to the
 * same 74 entries — the HL7 v3 ObservationInterpretation codes, the
 * data-absent-reason codes, and the retained legacy words — at the same
 * `sh:maxCount 1`, and until a term carried them nothing shipped could see
 * either.
 *
 * The two rules catch different records and neither covers the other's.
 * `lab-010` carries `'quite high'`, the shapes reject it, and `validate()`
 * returned `valid: true`: a FALSE ACCEPT on a record the corpus declares
 * invalid. `['H', 'L']` is the same false accept from the other direction —
 * two ratified codes, so every member satisfies the list, and only the cap
 * has anything to say.
 *
 * `predicateByType` because a vital sign writes `clinical:interpretation` where
 * a lab result writes `health:interpretation`. The list is identical on all
 * three shapes, so `values` stays flat.
 *
 * The 74 entries are EXTRACTED from the vendored shape rather than typed out. A
 * value set nobody diffed against spec is the same hand-transcription defect
 * that makes `validate()` both too strict and too lax elsewhere, and a list this
 * long is where a typo would hide best. Regenerating it is a shapes query, not
 * a reading exercise.
 *
 * Both cases are here on purpose: `'H'` and `'high'` are separate entries, as
 * are `'High'` and `'Abnormal'`. clinical v1.15 widened the list to keep
 * pre-ratification records readable rather than silently rejecting them, and
 * folding the case here would re-reject what that widening admitted.
 *
 * @see spec/ontologies/health/v1/health.shapes.ttl  health:LabResultRecordShape
 */

import { defineTerm } from './term.js';
import { requirePredicate } from './predicate.js';

export const interpretation = defineTerm({
  key: 'interpretation',
  predicate: requirePredicate('interpretation'),
  predicateByType: { VitalSign: 'clinical:interpretation' },
  // `clinical:VitalSignShape` binds this list at `sh:severity sh:Warning`
  // (clinical.shapes.ttl:1581) where the two LAB shapes leave it at SHACL's
  // sh:Violation default. Deliberate, and the shape says why: emitted vital
  // data uses "elevated", which is in neither ratified set, so a Violation
  // would reject records that already exist. core v3.5's ratchet is that such
  // a value is reported and raised to Violation in a later clinical version
  // only after a release in which the warning is observably absent.
  //
  // Without this the SDK rejects a vital sign spec accepts-with-a-warning —
  // `valid` is computed from `errors` alone, so the severity IS the verdict.
  // The migration the shape asks for is `interpretation: 'H'` plus
  // `interpretationSourceCode: 'elevated'`, not a different word.
  severityByType: { VitalSign: 'warning' },
  // All THREE shapes that bind the value set cap the path beside it:
  // `health:LabResultRecordShape` (health.shapes.ttl:956),
  // `clinical:LabResultShape` (clinical.shapes.ttl:1087) and
  // `clinical:VitalSignShape` (clinical.shapes.ttl:1561). `maxCount` is flat,
  // so it can only be read as every shape's answer — and they agree, which is
  // what makes a flat 1 a declaration rather than an over-constraint on
  // whichever class this term was written for.
  //
  // Termed for the value set and left uncapped, this field had the vacuous pass
  // the branch exists to close still open on it: `interpretation: ['H', 'L']`
  // is two ratified codes, so the `values` loop passes both, nothing counted
  // them, and `validate()` returned `valid: true` on a graph the shapes reject.
  // A value set cannot see cardinality; only the cap can.
  //
  // Reported at `severityByType`'s grade like every other rule here: sh:severity
  // belongs to the property shape, not to one constraint inside it, so the cap
  // on a vital sign is a Warning exactly as its value set is.
  maxCount: 1,
  values: [
    'EX', 'HM', 'OBX', 'CAR', 'Carrier', 'B', 'D', 'U', 'W', '<', '>', 'AC', 'IE', 'QCF', 'TOX',
    'A', 'N', 'I', 'MS', 'NCL', 'NS', 'R', 'S', 'VS', 'AA', 'H', 'L', 'HH', 'LL', 'HX', 'LX',
    'H>', 'HU', 'E', 'L<', 'LU', 'ND', 'IND', 'NEG', 'POS', 'EXP', 'UNE', 'DET', 'SYN-R', 'NR',
    'RR', 'WR', 'SDD', 'SYN-S', 'unknown', 'asked-unknown', 'temp-unknown', 'not-asked',
    'asked-declined', 'masked', 'not-applicable', 'unsupported', 'as-text', 'error',
    'not-a-number', 'negative-infinity', 'positive-infinity', 'not-performed', 'not-permitted',
    'normal', 'high', 'low', 'abnormal', 'critical', 'Normal', 'High', 'Low', 'Abnormal',
    'Critical',
  ],
  rule: { form: 'literal' },
});
