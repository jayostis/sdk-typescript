/**
 * `sh:message` and `sh:severity` reach the report unaltered.
 *
 * Compared against what the shapes graph DECLARES, read at test time by
 * `declaredProperty`, never against a string literal retyped here: a
 * paraphrase in the engine would satisfy a literal that happened to match,
 * and a reword upstream would fail one that no longer did, with no behaviour
 * change either way. `validate()` hands the message on to callers as its own,
 * so a message altered here is a message altered everywhere.
 */

import { describe, it, expect } from 'vitest';

import { declaredProperty } from '../support/declared.js';
import { quadsOf, engineOverSpec, CASCADE, HEALTH, SH } from './harness.js';

const IMMUNIZATION_SHAPE = `${HEALTH}ImmunizationRecordShape`;
const HAS_ATTACHMENT_EDGE = `${CASCADE}HasAttachmentEdgeShape`;

/** An immunization carrying the three fields the shape requires, plus whatever is given. */
const immunization = (extra: string): string =>
  `<urn:uuid:report-0001> a health:ImmunizationRecord ; cascade:dataProvenance cascade:ClinicalGenerated ; `
  + `cascade:schemaVersion "1.3" ; ${extra} .`;

describe('evaluate', () => {
  describe('a result on a property shape that declares both', () => {
    it('carries the shape\'s message and severity as declared', () => {
      const declared = declaredProperty(IMMUNIZATION_SHAPE, `${HEALTH}vaccineName`);
      // The helper's own guard: a shape declaring neither would make the
      // assertions below compare undefined against undefined.
      expect(declared.message).toBeDefined();
      expect(declared.severity).toBe(`${SH}Violation`);

      const report = engineOverSpec(quadsOf(immunization('health:vaccineName ""')));

      expect(report.results).toHaveLength(1);
      expect(report.results[0]).toMatchObject({
        sourceConstraintComponent: `${SH}MinLengthConstraintComponent`,
        message: declared.message,
        severity: declared.severity,
      });
    });
  });

  describe('a result on a property shape that declares no message', () => {
    it('carries no message rather than an invented one', () => {
      const declared = declaredProperty(IMMUNIZATION_SHAPE, `${HEALTH}vaccineCode`);
      expect(declared.message).toBeUndefined();

      const report = engineOverSpec(quadsOf(
        immunization('health:vaccineName "x" ; health:vaccineCode "CVX-1", "CVX-2"'),
      ));

      expect(report.results).toHaveLength(1);
      expect(report.results[0]?.sourceConstraintComponent).toBe(`${SH}MaxCountConstraintComponent`);
      expect(report.results[0]?.message).toBeUndefined();
      expect(report.results[0]?.severity).toBe(declared.severity);
    });
  });

  describe('a result on a root property shape at sh:Warning', () => {
    // `cascade:HasAttachmentEdgeShape` is a `sh:PropertyShape` with no node
    // shape above it, selected by `sh:targetSubjectsOf`, graded Warning. A
    // severity read only off `sh:property` blank nodes, or defaulted to
    // Violation, is wrong here in a way `conforms` cannot show.
    it('carries sh:Warning and its message', () => {
      const declared = declaredProperty(HAS_ATTACHMENT_EDGE, `${CASCADE}hasAttachment`);
      expect(declared.severity).toBe(`${SH}Warning`);
      expect(declared.message).toBeDefined();

      const report = engineOverSpec(quadsOf('ex:s a ex:Untargeted ; cascade:hasAttachment "not-an-iri" .'));

      expect(report.results).toHaveLength(1);
      expect(report.results[0]).toMatchObject({
        sourceConstraintComponent: `${SH}NodeKindConstraintComponent`,
        severity: declared.severity,
        message: declared.message,
      });
    });
  });
});
