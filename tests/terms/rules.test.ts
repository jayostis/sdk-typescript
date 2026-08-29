/**
 * Every rule form produces the right outputs, and `SubjectBuilder.addAll`
 * writes each output kind exactly as the builder already writes it.
 *
 * Declared against SYNTHETIC terms defined here rather than real ones. No real
 * term exists yet, and the mechanism has to be provable on its own: these say
 * the rule vocabulary can express a distinction, NOT that the SDK writes the
 * right predicate for any given record. That second claim needs a fixture
 * serialized end to end.
 *
 * Every `key` below is a real entry in PROPERTY_PREDICATES, because a term may
 * not invent vocabulary: `predicateOf` is the only way a spec gets a predicate.
 */

import { describe, it, expect } from 'vitest';
import { defineTerm, predicateOf } from '../../src/terms/term.js';
import type { Output } from '../../src/terms/term.js';
import { TurtleBuilder, SubjectBuilder } from '../../src/serializer/turtle-builder.js';

const SCT_URI = 'http://snomed.info/sct/271649006';

describe('rule form: literal', () => {
  it('writes a plain literal with no datatype', () => {
    const term = defineTerm({
      key: 'conditionName',
      predicate: predicateOf('conditionName'),
      rule: { form: 'literal' },
    });

    expect(term.outputsFor({ type: 'Condition', conditionName: 'Hypertension' })).toEqual([
      { kind: 'literal', predicate: 'health:conditionName', value: 'Hypertension' },
    ]);
  });

  it('carries the declared datatype onto the output', () => {
    const term = defineTerm({
      key: 'byteSize',
      predicate: predicateOf('byteSize'),
      rule: { form: 'literal', datatype: 'xsd:integer' },
    });

    expect(term.outputsFor({ type: 'Attachment', byteSize: 1024 })).toEqual([
      {
        kind: 'literal',
        predicate: 'cascade:byteSize',
        value: '1024',
        datatype: 'xsd:integer',
      },
    ]);
  });
});

describe('rule form: many', () => {
  const term = defineTerm({
    key: 'snomedCode',
    predicate: predicateOf('snomedCode'),
    rule: { form: 'literal', many: true },
  });

  it('writes one output per member of an array', () => {
    expect(term.outputsFor({ type: 'Condition', snomedCode: ['38341003', '59621000'] })).toEqual([
      { kind: 'literal', predicate: 'health:snomedCode', value: '38341003' },
      { kind: 'literal', predicate: 'health:snomedCode', value: '59621000' },
    ]);
  });

  it('accepts a bare scalar as a one-member list', () => {
    expect(term.outputsFor({ type: 'Condition', snomedCode: '38341003' })).toEqual([
      { kind: 'literal', predicate: 'health:snomedCode', value: '38341003' },
    ]);
  });
});

describe('rule form: iri', () => {
  it('writes a uri output, not a quoted literal', () => {
    const term = defineTerm({
      key: 'hasEncounter',
      predicate: predicateOf('hasEncounter'),
      rule: { form: 'iri' },
    });

    expect(term.outputsFor({ type: 'VitalSign', hasEncounter: 'urn:uuid:enc-1' })).toEqual([
      { kind: 'uri', predicate: 'clinical:hasEncounter', value: 'urn:uuid:enc-1' },
    ]);
  });
});

describe('rule form: iriList', () => {
  it('writes one uriList output holding every member, in order', () => {
    const term = defineTerm({
      key: 'provenanceLayers',
      predicate: predicateOf('provenanceLayers'),
      rule: { form: 'iriList' },
    });

    expect(
      term.outputsFor({
        type: 'ExportManifest',
        provenanceLayers: ['cascade:DeviceGenerated', 'urn:uuid:layer-2'],
      }),
    ).toEqual([
      {
        kind: 'uriList',
        predicate: 'cascade:provenanceLayers',
        items: ['cascade:DeviceGenerated', 'urn:uuid:layer-2'],
      },
    ]);
  });
});

describe('rule form: prefixedEnum', () => {
  it('resolves to a uri output with the prefix already applied', () => {
    // `sleepQuality: 'Good'` is `health:sleepQuality health:Good`. There is no
    // `prefixedEnum` output kind to go looking for: five rule forms, four
    // output kinds, and the mismatch is not an omission.
    const term = defineTerm({
      key: 'sleepQuality',
      predicate: predicateOf('sleepQuality'),
      rule: { form: 'prefixedEnum', prefix: 'health' },
    });

    expect(term.outputsFor({ type: 'DailySleepSnapshot', sleepQuality: 'Good' })).toEqual([
      { kind: 'uri', predicate: 'health:sleepQuality', value: 'health:Good' },
    ]);
  });
});

describe('rule form: blankNode', () => {
  it('writes a typed blank node whose children are the nested fields', () => {
    const term = defineTerm({
      key: 'clinicalSummary',
      predicate: predicateOf('clinicalSummary'),
      rule: { form: 'blankNode', rdfType: 'cascade:RecordSummary' },
    });

    expect(
      term.outputsFor({
        type: 'ExportManifest',
        clinicalSummary: { domain: 'clinical', earliestRecord: '2024-01-02' },
      }),
    ).toEqual([
      {
        kind: 'blankNode',
        predicate: 'cascade:clinicalSummary',
        rdfType: 'cascade:RecordSummary',
        children: [
          { kind: 'literal', predicate: 'cascade:domain', value: 'clinical' },
          { kind: 'literal', predicate: 'cascade:earliestRecord', value: '2024-01-02' },
        ],
      },
    ]);
  });
});

describe('a code is written where its own record type says to look for it', () => {
  // health:ConditionRecordShape declares sh:path health:snomedCode at
  // sh:Violation; four clinical shapes declare clinical:snomedCode. A code
  // written under the wrong one is still valid Turtle in a file that still
  // parses, and every query asking `?condition health:snomedCode ?code` comes
  // back empty. A code no query can find is worth what an absent code is worth.
  const snomed = defineTerm({
    key: 'snomedCode',
    predicate: predicateOf('snomedCode'),
    predicateByType: { VitalSign: 'clinical:snomedCode' },
    rule: { form: 'literal', many: true },
  });

  it('writes clinical:snomedCode for a VitalSign', () => {
    expect(snomed.outputsFor({ type: 'VitalSign', snomedCode: '271649006' })).toEqual([
      { kind: 'literal', predicate: 'clinical:snomedCode', value: '271649006' },
    ]);
  });

  it('writes the base health:snomedCode for anything else', () => {
    expect(snomed.outputsFor({ type: 'Condition', snomedCode: '38341003' })).toEqual([
      { kind: 'literal', predicate: 'health:snomedCode', value: '38341003' },
    ]);
  });

  it('selects the rule by record type too, not only the predicate', () => {
    const byRule = defineTerm({
      key: 'snomedCode',
      predicate: predicateOf('snomedCode'),
      rule: { form: 'literal' },
      ruleByType: { VitalSign: { form: 'iri' } },
    });

    expect(byRule.outputsFor({ type: 'VitalSign', snomedCode: SCT_URI })).toEqual([
      { kind: 'uri', predicate: 'health:snomedCode', value: SCT_URI },
    ]);
    expect(byRule.outputsFor({ type: 'Condition', snomedCode: SCT_URI })).toEqual([
      { kind: 'literal', predicate: 'health:snomedCode', value: SCT_URI },
    ]);
  });
});

describe('an absent value produces no outputs', () => {
  it('returns [] when the record lacks the field, and outputs when it carries it', () => {
    // Both halves on purpose: `[]` alone is satisfied by a term that produces
    // nothing at all, which is exactly the failure this is meant to catch.
    const term = defineTerm({
      key: 'interpretation',
      predicate: predicateOf('interpretation'),
      rule: { form: 'literal' },
    });

    expect(term.outputsFor({ type: 'LabResult', interpretation: 'High' })).toHaveLength(1);
    expect(term.outputsFor({ type: 'LabResult' })).toEqual([]);
  });

  it('makes sub.addAll([]) a no-op, so the caller needs no guard', () => {
    const before = new TurtleBuilder()
      .subject('<urn:uuid:rec-1>')
      .literal('health:testName', 'HbA1c')
      .done()
      .build();

    const unguarded = new TurtleBuilder()
      .subject('<urn:uuid:rec-1>')
      .literal('health:testName', 'HbA1c')
      .addAll([]);

    expect(unguarded.done().build()).toBe(before);
  });
});

describe('sub.addAll writes what the builder already writes', () => {
  const SUBJECT = '<urn:uuid:rec-1>';

  function viaAddAll(outputs: Output[]): string {
    return new TurtleBuilder().subject(SUBJECT).addAll(outputs).done().build();
  }

  function viaBuilder(write: (sub: SubjectBuilder) => void): string {
    const sub = new TurtleBuilder().subject(SUBJECT);
    write(sub);
    return sub.done().build();
  }

  it('dispatches a literal output', () => {
    expect(
      viaAddAll([{ kind: 'literal', predicate: 'health:conditionName', value: 'Hypertension' }]),
    ).toBe(viaBuilder((sub) => sub.literal('health:conditionName', 'Hypertension')));
  });

  it('dispatches a datatyped literal output', () => {
    expect(
      viaAddAll([
        { kind: 'literal', predicate: 'cascade:byteSize', value: '1024', datatype: 'xsd:integer' },
      ]),
    ).toBe(viaBuilder((sub) => sub.literal('cascade:byteSize', '1024', 'xsd:integer')));
  });

  it('dispatches a uri output', () => {
    expect(
      viaAddAll([{ kind: 'uri', predicate: 'clinical:hasEncounter', value: 'urn:uuid:enc-1' }]),
    ).toBe(viaBuilder((sub) => sub.uri('clinical:hasEncounter', 'urn:uuid:enc-1')));
  });

  it('dispatches a uriList output', () => {
    const items = ['cascade:DeviceGenerated', 'urn:uuid:layer-2'];
    expect(viaAddAll([{ kind: 'uriList', predicate: 'cascade:provenanceLayers', items }])).toBe(
      viaBuilder((sub) => sub.uriList('cascade:provenanceLayers', items)),
    );
  });

  it('dispatches a blankNode output', () => {
    expect(
      viaAddAll([
        {
          kind: 'blankNode',
          predicate: 'cascade:clinicalSummary',
          rdfType: 'cascade:RecordSummary',
          children: [
            { kind: 'literal', predicate: 'cascade:domain', value: 'clinical' },
            { kind: 'literal', predicate: 'cascade:earliestRecord', value: '2024-01-02' },
          ],
        },
      ]),
    ).toBe(
      viaBuilder((sub) =>
        sub.blankNode('cascade:clinicalSummary', (b) => {
          b.type('cascade:RecordSummary');
          b.literal('cascade:domain', 'clinical');
          b.literal('cascade:earliestRecord', '2024-01-02');
        }),
      ),
    );
  });

  it('writes several outputs into one subject block, in order', () => {
    expect(
      viaAddAll([
        { kind: 'literal', predicate: 'health:snomedCode', value: '38341003' },
        { kind: 'literal', predicate: 'health:snomedCode', value: '59621000' },
        { kind: 'uri', predicate: 'clinical:hasEncounter', value: 'urn:uuid:enc-1' },
      ]),
    ).toBe(
      viaBuilder((sub) => {
        sub.literal('health:snomedCode', '38341003');
        sub.literal('health:snomedCode', '59621000');
        sub.uri('clinical:hasEncounter', 'urn:uuid:enc-1');
      }),
    );
  });
});

// ─── Findings from the review of #28 ────────────────────────────────────────

describe('rule form: number', () => {
  // `emitField` writes a numeric field as a BARE token — `health:steps 8432`,
  // not `health:steps "8432"`. The quoted form is an xsd:string where every
  // fixture has an xsd:integer, so the migration needs a form that says bare.
  it('writes an integer as a bare token, not a quoted literal', () => {
    const term = defineTerm({
      key: 'steps',
      predicate: predicateOf('steps'),
      rule: { form: 'number' },
    });

    expect(term.outputsFor({ type: 'DailyActivitySnapshot', steps: 8432 })).toEqual([
      { kind: 'number', predicate: 'health:steps', value: 8432 },
    ]);
  });

  it('writes a decimal as a bare token too', () => {
    const term = defineTerm({
      key: 'durationHours',
      predicate: predicateOf('durationHours'),
      rule: { form: 'number' },
    });

    expect(term.outputsFor({ type: 'DailySleepSnapshot', durationHours: 7.4 })).toEqual([
      { kind: 'number', predicate: 'health:durationHours', value: 7.4 },
    ]);
  });

  it('falls back to a quoted literal for a non-numeric value, as emitField does', () => {
    const term = defineTerm({
      key: 'steps',
      predicate: predicateOf('steps'),
      rule: { form: 'number' },
    });

    expect(term.outputsFor({ type: 'DailyActivitySnapshot', steps: 'many' })).toEqual([
      { kind: 'literal', predicate: 'health:steps', value: 'many' },
    ]);
  });
});

describe('rule form: boolean', () => {
  it('writes a bare true/false, not a quoted literal', () => {
    const term = defineTerm({
      key: 'isActive',
      predicate: predicateOf('isActive'),
      rule: { form: 'boolean' },
    });

    expect(term.outputsFor({ type: 'Condition', isActive: true })).toEqual([
      { kind: 'boolean', predicate: 'clinical:status', value: true },
    ]);
  });

  it('falls back to a quoted literal for a non-boolean value, as emitField does', () => {
    const term = defineTerm({
      key: 'isActive',
      predicate: predicateOf('isActive'),
      rule: { form: 'boolean' },
    });

    expect(term.outputsFor({ type: 'Condition', isActive: 'yes' })).toEqual([
      { kind: 'literal', predicate: 'clinical:status', value: 'yes' },
    ]);
  });
});

describe('a blankNode rule with no rdfType', () => {
  const term = defineTerm({
    key: 'clinicalSummary',
    predicate: predicateOf('clinicalSummary'),
    rule: { form: 'blankNode' },
  });

  const record = { type: 'ExportManifest', clinicalSummary: { domain: 'clinical' } };

  it('leaves rdfType off the output rather than carrying an empty one', () => {
    expect(term.outputsFor(record)).toEqual([
      {
        kind: 'blankNode',
        predicate: 'cascade:clinicalSummary',
        children: [{ kind: 'literal', predicate: 'cascade:domain', value: 'clinical' }],
      },
    ]);
  });

  it('writes no rdf:type line, matching the guard serializeBlankNode already has', () => {
    const viaTerm = new TurtleBuilder()
      .subject('<urn:uuid:rec-1>')
      .addAll(term.outputsFor(record))
      .done()
      .build();

    const untyped = new TurtleBuilder()
      .subject('<urn:uuid:rec-1>')
      .blankNode('cascade:clinicalSummary', (b) => {
        b.literal('cascade:domain', 'clinical');
      })
      .done()
      .build();

    expect(viaTerm).toBe(untyped);
  });
});

describe('the children of a blank node match what serializeBlankNode writes', () => {
  const term = defineTerm({
    key: 'clinicalSummary',
    predicate: predicateOf('clinicalSummary'),
    rule: { form: 'blankNode', rdfType: 'cascade:RecordSummary' },
  });

  const record = {
    type: 'ExportManifest',
    clinicalSummary: {
      type: 'RecordSummary',
      id: 'urn:uuid:summary-1',
      domain: 'clinical',
      recordCount: 42,
      complete: true,
      meanPerDay: 1.5,
    },
  };

  it('skips type and id instead of inventing a triple for each', () => {
    const [output] = term.outputsFor(record);
    const children = (output as Extract<Output, { kind: 'blankNode' }>).children;

    expect(children.map((child) => child.predicate)).toEqual([
      'cascade:domain',
      'cascade:recordCount',
      'cascade:complete',
      'cascade:meanPerDay',
    ]);
  });

  it('keeps numbers and booleans bare rather than stringifying them', () => {
    expect(term.outputsFor(record)).toEqual([
      {
        kind: 'blankNode',
        predicate: 'cascade:clinicalSummary',
        rdfType: 'cascade:RecordSummary',
        children: [
          { kind: 'literal', predicate: 'cascade:domain', value: 'clinical' },
          { kind: 'number', predicate: 'cascade:recordCount', value: 42 },
          { kind: 'boolean', predicate: 'cascade:complete', value: true },
          { kind: 'number', predicate: 'cascade:meanPerDay', value: 1.5 },
        ],
      },
    ]);
  });

  it('serializes byte-identically to the existing writer', () => {
    const viaTerm = new TurtleBuilder()
      .subject('<urn:uuid:rec-1>')
      .addAll(term.outputsFor(record))
      .done()
      .build();

    const viaBuilder = new TurtleBuilder()
      .subject('<urn:uuid:rec-1>')
      .blankNode('cascade:clinicalSummary', (b) => {
        b.type('cascade:RecordSummary');
        b.literal('cascade:domain', 'clinical');
        b.number('cascade:recordCount', 42);
        b.boolean('cascade:complete', true);
        b.decimal('cascade:meanPerDay', 1.5);
      })
      .done()
      .build();

    expect(viaTerm).toBe(viaBuilder);
  });
});

describe('an iriList rule carries its prefix onto every member', () => {
  // The one IRI_LIST_FIELDS entry the SDK actually writes is `provenanceLayers`,
  // which `emitField` maps item by item to `cascade:${item}`. Dropping the
  // prefix writes `<DeviceGenerated>` — a relative IRI.
  const term = defineTerm({
    key: 'provenanceLayers',
    predicate: predicateOf('provenanceLayers'),
    rule: { form: 'iriList', prefix: 'cascade' },
  });

  it('qualifies each bare local name', () => {
    expect(
      term.outputsFor({
        type: 'ExportManifest',
        provenanceLayers: ['DeviceGenerated', 'UserEntered'],
      }),
    ).toEqual([
      {
        kind: 'uriList',
        predicate: 'cascade:provenanceLayers',
        items: ['cascade:DeviceGenerated', 'cascade:UserEntered'],
      },
    ]);
  });

  it('leaves members alone when the rule declares no prefix', () => {
    const bare = defineTerm({
      key: 'deviceSources',
      predicate: predicateOf('deviceSources'),
      rule: { form: 'iriList' },
    });

    expect(bare.outputsFor({ type: 'ExportManifest', deviceSources: ['urn:uuid:dev-1'] })).toEqual([
      { kind: 'uriList', predicate: 'cascade:deviceSources', items: ['urn:uuid:dev-1'] },
    ]);
  });
});

describe('sub.addAll writes the bare-token output kinds', () => {
  const SUBJECT = '<urn:uuid:rec-1>';

  it('dispatches a number output to sub.number', () => {
    expect(
      new TurtleBuilder()
        .subject(SUBJECT)
        .addAll([{ kind: 'number', predicate: 'health:steps', value: 8432 }])
        .done()
        .build(),
    ).toBe(new TurtleBuilder().subject(SUBJECT).number('health:steps', 8432).done().build());
  });

  it('dispatches a non-integer number output to sub.decimal', () => {
    expect(
      new TurtleBuilder()
        .subject(SUBJECT)
        .addAll([{ kind: 'number', predicate: 'health:durationHours', value: 7.4 }])
        .done()
        .build(),
    ).toBe(new TurtleBuilder().subject(SUBJECT).decimal('health:durationHours', 7.4).done().build());
  });

  it('dispatches a boolean output to sub.boolean', () => {
    expect(
      new TurtleBuilder()
        .subject(SUBJECT)
        .addAll([{ kind: 'boolean', predicate: 'clinical:status', value: true }])
        .done()
        .build(),
    ).toBe(new TurtleBuilder().subject(SUBJECT).boolean('clinical:status', true).done().build());
  });
});
