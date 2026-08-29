/**
 * `SubjectBuilder.addAll` — the seam between a term's outputs and the Turtle
 * writer.
 *
 * It must be a dispatcher and nothing else: one builder method per output kind,
 * arguments forwarded. Every test here is differential — the same content
 * written through `addAll` and through the builder method it should be calling,
 * compared as bytes. A second implementation of the writer would diverge and be
 * caught; a switch cannot.
 */

import { describe, it, expect } from 'vitest';

import { TurtleBuilder, SubjectBuilder } from '../src/serializer/turtle-builder.js';
import type { Output } from '../src/terms/term.js';

const SUBJECT = '<urn:uuid:rec-1>';

function viaAddAll(outputs: Output[]): string {
  return new TurtleBuilder().subject(SUBJECT).addAll(outputs).done().build();
}

function viaBuilder(write: (sub: SubjectBuilder) => void): string {
  const sub = new TurtleBuilder().subject(SUBJECT);
  write(sub);
  return sub.done().build();
}

describe('SubjectBuilder.addAll', () => {
  describe('each output kind writes what its builder method writes', () => {
    it('literal', () => {
      expect(
        viaAddAll([{ kind: 'literal', predicate: 'health:conditionName', value: 'Hypertension' }]),
      ).toBe(viaBuilder((sub) => sub.literal('health:conditionName', 'Hypertension')));
    });

    it('literal, with a datatype', () => {
      expect(
        viaAddAll([
          {
            kind: 'literal',
            predicate: 'cascade:byteSize',
            value: '1024',
            datatype: 'xsd:integer',
          },
        ]),
      ).toBe(viaBuilder((sub) => sub.literal('cascade:byteSize', '1024', 'xsd:integer')));
    });

    it('number, as a bare integer token', () => {
      expect(viaAddAll([{ kind: 'number', predicate: 'health:steps', value: 8432 }])).toBe(
        viaBuilder((sub) => sub.number('health:steps', 8432)),
      );
    });

    it('number, routed to decimal when it is not an integer', () => {
      expect(
        viaAddAll([{ kind: 'number', predicate: 'health:durationHours', value: 7.4 }]),
      ).toBe(viaBuilder((sub) => sub.decimal('health:durationHours', 7.4)));
    });

    it('boolean', () => {
      expect(viaAddAll([{ kind: 'boolean', predicate: 'clinical:status', value: true }])).toBe(
        viaBuilder((sub) => sub.boolean('clinical:status', true)),
      );
    });

    it('uri', () => {
      expect(
        viaAddAll([{ kind: 'uri', predicate: 'clinical:hasEncounter', value: 'urn:uuid:enc-1' }]),
      ).toBe(viaBuilder((sub) => sub.uri('clinical:hasEncounter', 'urn:uuid:enc-1')));
    });

    it('uriList', () => {
      const items = ['cascade:DeviceGenerated', 'urn:uuid:layer-2'];

      expect(viaAddAll([{ kind: 'uriList', predicate: 'cascade:provenanceLayers', items }])).toBe(
        viaBuilder((sub) => sub.uriList('cascade:provenanceLayers', items)),
      );
    });
  });

  describe('a blankNode output', () => {
    it('writes its type line and recurses into its children', () => {
      expect(
        viaAddAll([
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
        ]),
      ).toBe(
        viaBuilder((sub) =>
          sub.blankNode('cascade:clinicalSummary', (b) => {
            b.type('cascade:RecordSummary');
            b.literal('cascade:domain', 'clinical');
            b.number('cascade:recordCount', 42);
            b.boolean('cascade:complete', true);
            b.decimal('cascade:meanPerDay', 1.5);
          }),
        ),
      );
    });

    it('writes no type line at all when rdfType is absent', () => {
      // Not an empty `a`, which is unparseable and would fail the document.
      expect(
        viaAddAll([
          {
            kind: 'blankNode',
            predicate: 'cascade:clinicalSummary',
            children: [{ kind: 'literal', predicate: 'cascade:domain', value: 'clinical' }],
          },
        ]),
      ).toBe(
        viaBuilder((sub) =>
          sub.blankNode('cascade:clinicalSummary', (b) => {
            b.literal('cascade:domain', 'clinical');
          }),
        ),
      );
    });
  });

  describe('a list of outputs', () => {
    it('writes them into one subject block, in the order given', () => {
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

    it('writes nothing for an empty list, so a caller needs no guard', () => {
      // outputsFor returns [] for an absent field, and every call site passes
      // that straight through.
      const withEmpty = new TurtleBuilder()
        .subject(SUBJECT)
        .literal('health:testName', 'HbA1c')
        .addAll([]);

      expect(withEmpty.done().build()).toBe(
        viaBuilder((sub) => sub.literal('health:testName', 'HbA1c')),
      );
    });
  });
});
