/**
 * health v2.8 / clinical v1.16 — `health:interpretation`: the ratified reading
 * of a result, carried beside the source's own verbatim code on
 * `health:interpretationSourceCode`.
 *
 * Termed for its VALUE SET. `health:LabResultRecordShape`, `health:LabResultShape`
 * and `clinical:VitalSignShape` all bind it to the same 74 entries — the HL7 v3
 * ObservationInterpretation codes, the data-absent-reason codes, and the
 * retained legacy words — and until a term carried that list nothing shipped
 * could see it. `lab-010` carries `'quite high'`, the shapes reject it, and
 * `validate()` returned `valid: true`: a FALSE ACCEPT on a record the corpus
 * declares invalid.
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

import { defineTerm, requirePredicate } from './term.js';

export const interpretation = defineTerm({
  key: 'interpretation',
  predicate: requirePredicate('interpretation'),
  predicateByType: { VitalSign: 'clinical:interpretation' },
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
