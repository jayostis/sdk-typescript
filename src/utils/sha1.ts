/**
 * SHA-1 over a string's UTF-8 bytes, synchronously, with nothing imported.
 *
 * WHY THIS EXISTS. `deterministicUuid` in `./deterministic-uri.ts` is the
 * identity of every record this SDK mints, and it is synchronous by contract:
 * cascade-cli and the desktop app call it inline, and the cross-SDK vectors
 * are stated for a function that returns a string. `node:crypto`'s `createHash`
 * gave it that for free and is a Node builtin no browser bundle can resolve
 * (D-BROWSER-1). The browser's `crypto.subtle.digest` exists everywhere but is
 * async-only, so using it would have changed the identity API to keep the
 * package loading. D-BROWSER-1 as amended on 2026-09-04 settles it: a small
 * pure-JS SHA-1 with byte-identical output, so identity stays synchronous and
 * the package stays bundleable.
 *
 * WHAT IT IS NOT. Not a security primitive — SHA-1 is broken for that, and this
 * SDK never uses it for one. It is a stable, well-specified function from a
 * string to 160 bits, chosen years ago by the shared CDP-UUID algorithm, which
 * MUST NOT change without a cross-SDK coordination step. This file inherits
 * that: its output is pinned to `node:crypto`'s in `tests/sha1.test.ts`, on
 * the inputs where SHA-1 implementations go wrong — the padding boundaries at
 * 55, 56 and 64 bytes, and multi-byte UTF-8.
 *
 * FIPS 180-4 §6.1, written out. `TextEncoder` does the UTF-8, and it is the
 * one platform API this touches: global in every browser and in Node since 11.
 *
 * @module utils/sha1
 */

/** `Math.pow(2, 32)` as a constant, for reading a 64-bit length into two words. */
const TWO_32 = 0x100000000;

/**
 * The SHA-1 digest of `input`'s UTF-8 encoding, as 40 lowercase hex characters.
 *
 * Identical to `createHash('sha1').update(input).digest('hex')` for every
 * string: Node encodes a string argument as UTF-8 by default, and so does this.
 */
export function sha1Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const bitLength = bytes.length * 8;

  // Pad: a 1 bit, zeros to 56 mod 64, then the length as 64 bits big-endian.
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / TWO_32));
  view.setUint32(paddedLength - 4, bitLength >>> 0);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  const w = new Uint32Array(80);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(offset + t * 4);
    for (let t = 16; t < 80; t++) {
      const x = w[t - 3]! ^ w[t - 8]! ^ w[t - 14]! ^ w[t - 16]!;
      w[t] = (x << 1) | (x >>> 31);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let t = 0; t < 80; t++) {
      let f: number;
      let k: number;
      if (t < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (t < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (t < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[t]!) >>> 0;
      e = d;
      d = c;
      c = (b << 30) | (b >>> 2);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  return [h0, h1, h2, h3, h4].map((word) => word.toString(16).padStart(8, '0')).join('');
}
