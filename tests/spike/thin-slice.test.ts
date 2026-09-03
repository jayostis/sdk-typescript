import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Parser = require('../../src/vendor/n3/N3Parser.js').default;
const Writer = require('../../src/vendor/n3/N3Writer.js').default;
const canonize = require('rdf-canonize');

/** Load a vocabulary's context plus core, flattened. Prefixes and terms. */
function loadContext(vocab: string) {
  const terms: Record<string, any> = {};
  const prefixes: Record<string, string> = {};
  for (const f of ['core', vocab]) {
    const j = JSON.parse(readFileSync(`../spec/contexts/v1/${f}.jsonld`, 'utf8'));
    for (const [k, v] of Object.entries<any>(j['@context'] ?? {})) {
      if (k.startsWith('@')) continue;
      if (typeof v === 'string' && /^https?:\/\//.test(v)) prefixes[k] = v;
      else terms[k] = v;
    }
  }
  return { terms, prefixes };
}

const expand = (curie: string, prefixes: Record<string, string>) => {
  const [p, local] = curie.split(':');
  return prefixes[p] ? prefixes[p] + local : curie;
};

/** The entire thin slice: JSON -> quads, using nothing but the published context. */
function convertToRdf(input: Record<string, any>, vocab: string): string {
  const { terms, prefixes } = loadContext(vocab);
  const lines: string[] = [];
  const subj = `<${input.id}>`;
  for (const [k, val] of Object.entries(input)) {
    if (k === 'id' || val === undefined || val === null) continue;
    if (k === 'type') continue;
    const e = terms[k];
    if (!e) throw new Error(`no context entry for "${k}"`);
    const def = typeof e === 'string' ? { '@id': e } : e;
    const pred = `<${expand(def['@id'], prefixes)}>`;
    for (const v of Array.isArray(val) ? val : [val]) {
      let obj: string;
      if (def['@type'] === '@id') obj = `<${expand(String(v), prefixes)}>`;
      else if (typeof def['@type'] === 'string') obj = `"${v}"^^<${expand(def['@type'], prefixes)}>`;
      else if (typeof v === 'number') obj = `"${v}"^^<http://www.w3.org/2001/XMLSchema#integer>`;
      else if (typeof v === 'boolean') obj = `"${v}"^^<http://www.w3.org/2001/XMLSchema#boolean>`;
      else obj = JSON.stringify(String(v));
      lines.push(`${subj} ${pred} ${obj} .`);
    }
  }
  return lines.join('\n');
}

const nquads = (ttl: string) => {
  const quads = new Parser().parse(ttl);
  const w = new Writer({ format: 'N-Quads' });
  quads.forEach((q: any) => w.addQuad(q));
  let out = ''; w.end((_e: any, r: string) => { out = r; });
  return out;
};
const canon = async (ttl: string) =>
  canonize.canonize(await canonize.NQuads.parse(nquads(ttl)), { algorithm: 'RDFC-1.0' });

describe('thin slice — imm-001 from spec context alone', () => {
  const fx = JSON.parse(readFileSync('../conformance/fixtures/imm-001.json', 'utf8'));

  it('produces a graph, from the published context and nothing else', async () => {
    const mine = convertToRdf(fx.input, fx.vocabulary);
    const theirs = fx.expectedOutput.turtle;

    // drop the rdf:type triple from theirs — `type` mapping is out of this slice
    const a = (await canon(mine)).split('\n').filter(Boolean).sort();
    const b = (await canon(theirs)).split('\n').filter(Boolean)
      .filter((l) => !l.includes('22-rdf-syntax-ns#type')).sort();

    const onlyMine = a.filter((x) => !b.includes(x));
    const onlyTheirs = b.filter((x) => !a.includes(x));
    console.log(`  triples: mine=${a.length} fixture=${b.length} | agree=${a.length - onlyMine.length}`);
    console.log(`  MISMATCHES: ${onlyMine.length}`);
    for (let i = 0; i < onlyMine.length; i++) {
      console.log(`    mine  : ${onlyMine[i]}`);
      console.log(`    theirs: ${onlyTheirs[i]}`);
    }
    expect(a.length).toBeGreaterThan(10);
  });
});
