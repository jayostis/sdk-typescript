import { describe, it, expect } from 'vitest';
import { loadFixture, loadCascadeRecordFixture } from './fixtures.js';

describe('the two loaders disagree on purpose', () => {
  it('takes a container as an entity and refuses it as a record, naming the loader that fits', () => {
    // Why there are two. pod-001 is an ldp:BasicContainer — a directory listing,
    // no dataProvenance, because nobody reported a directory. It is a real
    // fixture and loadFixture must take it; a cast to CascadeRecord would hand
    // it to something expecting an observation, and serialize() would throw
    // `Unknown record type: BasicContainer` somewhere unrelated (#6).
    expect(loadFixture('pod-001').input.type).toBe('BasicContainer');

    expect(() => loadCascadeRecordFixture('pod-001'))
      .toThrow(/is not a record fixture[\s\S]*Use loadFixture/);
  });
});
