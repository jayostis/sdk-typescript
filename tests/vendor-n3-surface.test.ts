/**
 * `src/vendor/n3/n3.d.ts` declares exactly what this SDK reaches, and no more.
 *
 * Its header promises that using anything beyond that surface is a compile
 * error, on purpose: it sends whoever adds the call to n3@2's real signature
 * rather than to a v1 guess. A declaration nobody calls — Parser options,
 * Writer `format`, `Term.language`, `Term.equals` — is that guess already typed
 * in, so a future `new Parser({ format: 'N-Quads' })` would compile without
 * anyone reading the v2 signature, which is the thing the header says the file
 * prevents.
 *
 * The `@ts-expect-error` lines are real only under `npm run typecheck`
 * (`tsconfig.typecheck.json` includes this file); vitest transpiles without
 * typechecking. Every line still runs, against the real n3@2 where each call
 * is valid — the assertion is about what this SDK claims to know, not about n3.
 */

import { describe, it, expect } from 'vitest';

import { Parser as N3Parser, Writer as N3Writer } from '../src/vendor/n3/n3.js';

const TURTLE = '<http://example.org/s> <http://example.org/p> "o" .';

describe('the vendored n3 declarations', () => {
  it('cover what to-rdf.ts and n3-adapter.ts call', () => {
    const [quad] = new N3Parser().parse(TURTLE);

    expect(quad?.object.termType).toBe('Literal');
    expect(quad?.object.value).toBe('o');
    expect(quad?.object.datatype?.value).toBe('http://www.w3.org/2001/XMLSchema#string');

    const writer = new N3Writer({ prefixes: { ex: 'http://example.org/' } });
    if (quad) writer.addQuad(quad);
    let document = '';
    writer.end((_error, result) => { document = result; });

    expect(document).toContain('ex:s ex:p "o"');
  });

  it('declare nothing the SDK does not reach', () => {
    const [quad] = new N3Parser().parse(TURTLE);
    const term = quad?.object;

    // @ts-expect-error -- Parser options are undeclared: both call sites construct it bare.
    new N3Parser({ format: 'N-Quads' });
    // @ts-expect-error -- Writer takes `prefixes` and nothing else.
    new N3Writer({ format: 'N-Quads' });
    // @ts-expect-error -- the adapter drops language tags, so no caller reads one.
    void term?.language;
    // @ts-expect-error -- no caller compares terms.
    void term?.equals(term);
  });
});
