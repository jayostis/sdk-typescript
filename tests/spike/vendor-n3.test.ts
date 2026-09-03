import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Parser = require('../../src/vendor/n3/N3Parser.js').default;
const Writer = require('../../src/vendor/n3/N3Writer.js').default;

describe('vendored n3 loads and parses under ESM', () => {
  it('parses a Cascade turtle document', () => {
    const ttl = `@prefix health: <https://ns.cascadeprotocol.org/health/v1#> .
<urn:uuid:x> a health:ImmunizationRecord ;
    health:vaccineName "COVID-19" ;
    health:snomedCode <http://snomed.info/sct/1> , <http://snomed.info/sct/2> .`;
    const quads = new Parser().parse(ttl);
    console.log('  quads parsed:', quads.length);
    expect(quads.length).toBe(4);
  });

  it('handles the comma object list the hand-written parser corrupts (#71)', () => {
    const ttl = `@prefix h: <http://x/> .
<urn:a> h:code <http://c/1> , <http://c/2> .`;
    const objs = new Parser().parse(ttl).map((q: any) => q.object.value);
    console.log('  comma objects:', JSON.stringify(objs));
    expect(objs).toEqual(['http://c/1', 'http://c/2']);
  });

  it('writes turtle back out', () => {
    const quads = new Parser().parse('<urn:a> <http://p/x> "v" .');
    const w = new Writer({ prefixes: { p: 'http://p/' } });
    quads.forEach((q: any) => w.addQuad(q));
    w.end((_e: unknown, out: string) => console.log('  written:', JSON.stringify(out.trim())));
    expect(quads.length).toBe(1);
  });
});
