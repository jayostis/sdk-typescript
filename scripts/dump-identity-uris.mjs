/**
 * Dump every deterministic URI this SDK mints over the shared conformance
 * fixture corpus, as a stable, sorted, line-per-URI text stream.
 *
 * WHY IT EXISTS. A change to the identity comparator is a change to the shape
 * of every identifier the SDK can produce, and "no URI moves" is a claim about
 * the whole corpus, not about the handful of records a test file pins. This
 * script makes that claim checkable: run it before a comparator change, run it
 * after, diff the two files, and the diff count IS the number of identities the
 * change moved. Zero is the only acceptable answer for a corpus that contains no
 * astral-plane character; the astral vectors in `conformance` are separately
 * expected to move, and they are not part of this corpus.
 *
 * WHAT IT ENUMERATES. Every JSON fixture under `conformance/fixtures`, walked
 * recursively into every nested object. For each object it collects the entries
 * whose value is a string or an array of strings — the shape `contentHashedUri`
 * accepts — and mints:
 *
 *   - the full field set, in the object's own key order;
 *   - the full field set with the key order REVERSED, which must mint the same
 *     URI and is therefore a live check that the sort is doing its job;
 *   - every single field on its own;
 *   - every unordered PAIR of fields, which is where a comparator is actually
 *     exercised: a two-key identity string is decided by exactly one comparison.
 *
 * The pairwise enumeration is the point. A per-fixture whole-object dump would
 * compare each key list only in the one arrangement the fixture happens to use;
 * pairs put every key in the corpus on both sides of a comparison.
 *
 * Output is sorted, so two runs are diffable directly and the order in which the
 * filesystem hands over fixtures cannot show up as a difference.
 *
 * Usage: node scripts/dump-identity-uris.mjs > before.txt
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contentHashedUri } from '../dist/utils/deterministic-uri.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(here, '../../conformance/fixtures');

function jsonFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...jsonFiles(p));
    else if (name.endsWith('.json')) out.push(p);
  }
  return out;
}

function objects(node, acc) {
  if (Array.isArray(node)) {
    for (const v of node) objects(v, acc);
  } else if (node && typeof node === 'object') {
    acc.push(node);
    for (const v of Object.values(node)) objects(v, acc);
  }
  return acc;
}

const isStringy = (v) =>
  typeof v === 'string' || (Array.isArray(v) && v.length > 0 && v.every((m) => typeof m === 'string'));

const lines = [];
for (const file of jsonFiles(fixturesDir)) {
  const rel = relative(fixturesDir, file);
  let doc;
  try {
    doc = JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    continue; // a fixture that is not JSON is not this script's business
  }
  const type = typeof doc?.dataType === 'string' ? doc.dataType : 'Record';
  let n = 0;
  for (const obj of objects(doc, [])) {
    const entries = Object.entries(obj).filter(([, v]) => isStringy(v));
    if (entries.length === 0) continue;
    const emit = (tag, pairs) => {
      const uri = contentHashedUri(type, Object.fromEntries(pairs));
      // `contentHashedUri` documents a third tier: when no content field survives
      // and no fallbackId is given it returns `crypto.randomUUID()`, which is a
      // version-4 UUID and differs between two runs of UNCHANGED code. Every
      // deterministic URI here is version 5 by construction (`deterministicUuid`
      // writes the '5' literally). Recording the tier rather than the value keeps
      // those rows in the corpus — their reachability is itself worth diffing —
      // without filling the diff with noise that means nothing.
      // The version nibble is the first character of the THIRD hyphen-separated
      // group, after the `urn:uuid:` prefix.
      const version = uri.slice('urn:uuid:'.length).split('-')[2]?.[0];
      lines.push(`${rel}\t${n}\t${tag}\t${version === '5' ? uri : '<random-fallback>'}`);
    };
    emit('all', entries);
    emit('all-reversed', [...entries].reverse());
    for (let i = 0; i < entries.length; i++) {
      emit(`one:${entries[i][0]}`, [entries[i]]);
      for (let j = i + 1; j < entries.length; j++) {
        emit(`pair:${entries[i][0]}+${entries[j][0]}`, [entries[i], entries[j]]);
      }
    }
    n++;
  }
}

lines.sort();
process.stdout.write(lines.join('\n') + '\n');
process.stderr.write(`${lines.length} deterministic URIs\n`);
