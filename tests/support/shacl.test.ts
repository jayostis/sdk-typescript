/**
 * A validator that answers when it cannot check is worse than no validator: a
 * pod of malformed records comes back certified clean, and every suite leaning
 * on the helper reports green while inheriting the wrong answer.
 */

import { describe, it, expect } from 'vitest';
import { serialize } from '../../src/serializer/turtle-serializer.js';
import { NAMESPACES } from '../../src/vocabularies/namespaces.js';
import { loadCascadeRecordFixture, loadFixture } from './fixtures.js';
import { parseDataset } from './graph.js';
import { assertCovered, shaclCheck } from './shacl.js';

describe('shaclCheck never certifies what it did not check', () => {
  it('refuses a record whose vocabulary we hold no shapes for', async () => {
    // Before the guard, a clinical:Medication validated against a graph holding
    // no clinical shape and returned conforms:true — indistinguishable from a
    // record that satisfies every clinical constraint.
    await expect(shaclCheck(loadCascadeRecordFixture('med-001').input)).rejects.toThrow(/clinical/);
  });

  it('refuses a record whose type we can judge but whose data we cannot', async () => {
    // The case a type check alone cannot see, and it is live. absent-001 is a
    // health:LabResultRecord — a type the vendored shapes do target — but
    // serialize() writes its LOINC code as clinical:loincCode, which no vendored
    // shape declares an sh:path for.
    //
    // This test retires itself: it goes red the day clinical shapes are vendored
    // or the day the predicate is settled (#8). Red here is a signal, not a bug.
    await expect(shaclCheck(loadCascadeRecordFixture('absent-001').input))
      .rejects.toThrow(/clinical:loincCode/);
  });

  it('refuses a predicate in a VENDORED vocabulary that no shape declares a path for', async () => {
    // Coverage used to mean "the IRI sits in a vendored namespace", and `health:`
    // is vendored, so lab-001's `health:notes` reached a shapes graph holding no
    // sh:path for it and came back conforms:true — the vacuous verdict, produced
    // by the guard that exists to refuse it. health.shapes.ttl declares
    // `health:reportNotes`; the only `notes` in it is inside a comment.
    //
    // Being in a vendored vocabulary was never the question. Being constrained
    // by a loaded shape is.
    await expect(shaclCheck(loadCascadeRecordFixture('lab-001').input))
      .rejects.toThrow(/health:notes/);
  });

  it('judges a predicate a vendored shape constrains from OUTSIDE its own vocabulary', () => {
    // The same rule failing the other way. core.shapes.ttl declares `sh:path
    // dct:title`, `dct:created` and `dct:description` on
    // cascade:ExportManifestShape, and `dcterms` was in no vendored namespace —
    // nor could it join one, having no shapes file in spec to vendor. Every
    // ExportManifest was therefore refused over three triples the vendored
    // shapes do constrain, under a remedy nobody could carry out.
    //
    // pod-002 is still refused, because dcterms:creator and
    // cascade:provenanceLayers genuinely have no sh:path anywhere in the graph.
    // That the refusal no longer names the other three is the whole of the fix.
    //
    // Asserted through assertCovered because pod-002 is an ExportManifest rather
    // than a health record, so shaclCheck's CascadeRecord is the wrong door.
    const record = loadFixture('pod-002').input;
    const check = () => assertCovered(parseDataset(serialize(record)), record);

    expect(check).toThrow(/dcterms:creator/);
    expect(check).not.toThrow(/dcterms:title|dcterms:created|dcterms:description/);
  });

  it('refuses a record with nothing on it to say what it is', () => {
    // Asserted through assertCovered directly because no record can reach
    // shaclCheck this way today: serialize() emits `a <type>` for everything in
    // TYPE_MAPPING and throws for anything else. It still failed OPEN — no types
    // found was read as nothing uncovered, and a subject with no type is exactly
    // what no sh:targetClass selects.
    const untyped = parseDataset(
      `<urn:uuid:untyped> <${NAMESPACES.cascade}dataAbsentReason> "not-performed" .`,
    );

    expect(() => assertCovered(untyped, { id: 'urn:uuid:untyped', type: 'LabResultRecord' }))
      .toThrow(/no rdf:type/);
  });
});

describe('shaclCheck answers about the record it was asked about', () => {
  it('does not swap verdicts between two records validated at once', async () => {
    // One SHACLValidator is shared across calls. If a future release awaits
    // inside validate(), the second setDataGraph lands before the first
    // validateAll and BOTH verdicts describe the second record. lab-008 conforms
    // and absent-002 does not, so crossing shows up as two equal verdicts.
    //
    // lab-008 rather than lab-001, which carries an unconstrained `health:notes`
    // and is now refused before it reaches the validator — see above. lab-008 is
    // the lab fixture whose every predicate a vendored shape declares a path for.
    const [conforming, violating] = await Promise.all([
      shaclCheck(loadCascadeRecordFixture('lab-008').input),
      shaclCheck(loadCascadeRecordFixture('absent-002').input),
    ]);

    expect(conforming.conforms).toBe(true);
    expect(violating.conforms).toBe(false);
  });
});
