/**
 * Convert spec's ontologies to JSON-LD and write them under `src/spec/`.
 *
 * WHY THIS EXISTS. Everything after #69 Phase 2 reads spec's own data out of the
 * installed package. A consumer installs `dist` and has no `spec` checkout, so
 * the data has to travel with the tarball — and today the only thing that
 * travels is a hand-committed transcription of it.
 *
 * ONTOLOGIES, NOT SHAPES. #76 as written converts `*.shapes.ttl`; this converts
 * `*.ttl`. That is deliberate and it is the half the record-type table needs:
 * the class question is answered ONLY by the ontologies. Measured against what
 * this SDK registers — ontologies 36/36, contexts 27/36, `sh:targetClass`
 * 27/36, contexts and shapes together 29/36. The shapes conversion joins this
 * script when #79 has something that reads a constraint.
 *
 * EXPANDED JSON-LD, no context. A context is a naming table for authoring; a
 * graph consumer wants the quads. Expanded form is a mechanical transform of
 * what the parser produced, needs no library to write, and cannot disagree with
 * the Turtle about what a term means — `tests/spec-data/ontology-jsonld.test.ts`
 * compares the two canonically.
 *
 * NOT THROUGH tsc. `npm run build` runs `tsc` and then the copy steps, because
 * tsc REPRINTS an imported JSON document rather than copying it — measured in
 * #76 at +10.9% and differing at byte 2 — and infers a structural type for
 * every node of it. Data files reach `dist/` by being copied.
 *
 * NOT COMMITTED. `src/spec/` is gitignored and built from the checkout every
 * time, so the artifact cannot be stale — there is no copy to fall behind. CI
 * clones the commit `conformance/scripts/SPEC_PIN` names and points
 * `CASCADE_SPEC_DIR` at it (`.github/workflows/ci.yml:68-76'), so every CI build
 * is built from pinned data with nobody having to remember anything.
 *
 * The build does NOT enforce the pin, deliberately. A revision check can only
 * fire on a developer's machine, where spec is routinely on a branch on purpose
 * — the reason `specRoot()` refuses to grow one
 * (`tests/support/spec-sources.ts:21-24`). `PROVENANCE.json` records the commit
 * each artifact was built from, so a build can be checked after the fact
 * without a gate that cries wolf at the people doing the work.
 */

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { normativeLanguageInComments } from './lib/detectors.mjs';
import { openFindings } from './lib/diagnostics.mjs';
import { specDataLayout } from './lib/spec-source.mjs';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The vendored parser, the same one `deserialize` reads pods with. */
const N3Parser = require(join(root, 'src/vendor/n3/N3Parser.js')).default;

const { ontologies: OUT, contexts: CONTEXTS, diagnostics: DIAGNOSTICS } = specDataLayout(root);

/**
 * Where `spec` is.
 *
 * A SECOND IMPLEMENTATION OF `specRoot()`, and it is written down rather than
 * hidden. `tests/support/spec-sources.ts` is the one module that knows, and it
 * is TypeScript in a project with `allowJs` off, so a build script cannot
 * import it without a `.d.mts` and a refactor of the module every SHACL suite
 * loads. Until that happens the duplication is REAL, so
 * `tests/spec-data/resolver-agreement.test.ts` asserts the two resolve the same
 * directory and fails if either moves. The manifest itself is not duplicated —
 * both read `spec-sources.json`, which is the thing #58 made single.
 */
function specRoot() {
  const manifest = JSON.parse(readFileSync(join(root, 'spec-sources.json'), 'utf-8'));
  const candidate = process.env.CASCADE_SPEC_DIR || join(root, '../spec');
  const absolute = resolve(candidate);

  const holdsSpec = Object.values(manifest)
    .every((entry) => existsSync(join(absolute, entry.ontology.split('/')[0] ?? '')));

  if (!holdsSpec) {
    throw new Error(
      `no spec checkout at ${absolute}: it holds no ontologies/ directory. Point `
      + 'CASCADE_SPEC_DIR at a spec checkout, or clone spec as the ../spec sibling of this '
      + 'repository. The build reads spec where it is checked out and keeps no copy.',
    );
  }

  return { root: absolute, manifest };
}

/**
 * One RDF term as expanded JSON-LD.
 *
 * A plain literal gets no `@type`: in RDF 1.1 every simple literal IS an
 * `xsd:string`, and n3 supplies the datatype implicitly. Writing it out would
 * put an explicit type on every label and comment in the corpus and make the
 * document disagree with the Turtle it came from about nothing.
 */
function termToJsonLd(term) {
  if (term.termType === 'NamedNode') return { '@id': term.value };
  if (term.termType === 'BlankNode') return { '@id': `_:${term.value}` };

  const datatype = term.datatype?.value ?? '';

  if (term.language) return { '@value': term.value, '@language': term.language };
  if (datatype && datatype !== 'http://www.w3.org/2001/XMLSchema#string') {
    return { '@value': term.value, '@type': datatype };
  }
  return { '@value': term.value };
}

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

/**
 * The one predicate deliberately not carried, on #76's precedent for `sh:name`.
 *
 * 940 comments, 129K of text — 25% of the payload and most of the gzip, for
 * prose no engine reads. `tests/spec-data/ontology-jsonld.test.ts` asserts every
 * other quad survives and that this is the ONLY predicate absent, so the
 * omission is a declaration rather than a silence.
 *
 * WHAT IS LOST, named rather than waved past. Some of those comments state a
 * rule in RFC 2119 language — MUST / SHOULD / VALUE FORM — and for some of them
 * the comment is the only place the rule is written at all:
 * `cascade:sourceIdentity` specifies a scheme-prefixed value form in 3,978
 * characters that no shape encodes. Nothing mechanical is lost, because prose
 * was never actionable; what is lost is a reader of the shipped artifact
 * finding it. Those rules wanting a machine-readable form is a spec question,
 * and dropping the prose here does not make it one bit more or less true.
 *
 * HOW MANY is not written here, on purpose: a count in a comment is never
 * re-measured (this one said "28" for a corpus that had 9 under the uppercase
 * rule and 33 case-insensitively). `normativeLanguageInComments` measures it
 * on every build and records each subject as a `normative-language-in-comment`
 * finding — see `docs/spec-diagnostics.md`.
 */
const OMITTED = 'http://www.w3.org/2000/01/rdf-schema#comment';

/**
 * Quads to an expanded JSON-LD node array.
 *
 * SORTED, at every level, and MINIFIED. The artifact is gitignored and built
 * from the pinned checkout, so nobody reads its diff and indentation buys
 * nothing — 558K pretty against 416K minified, for the same graph. Sorting is
 * not cosmetic though: it makes the build REPRODUCIBLE, so two builds of one
 * spec commit are byte-identical and a change in the output means a change in
 * the input.
 */
function toExpandedJsonLd(quads) {
  const nodes = new Map();

  for (const quad of quads) {
    const id = quad.subject.termType === 'BlankNode'
      ? `_:${quad.subject.value}`
      : quad.subject.value;

    const node = nodes.get(id) ?? { '@id': id };
    nodes.set(id, node);

    // `rdf:type` is `@type` in expanded form, and its objects are bare IRIs
    // rather than node references. A converter that emitted it as an ordinary
    // predicate would round-trip to the same graph and be read by nothing that
    // looks for a type.
    if (quad.predicate.value === RDF_TYPE && quad.object.termType === 'NamedNode') {
      node['@type'] = [...(node['@type'] ?? []), quad.object.value];
      continue;
    }

    const key = quad.predicate.value;
    if (key === OMITTED) continue;

    node[key] = [...(node[key] ?? []), termToJsonLd(quad.object)];
  }

  return [...nodes.values()]
    .sort((a, b) => a['@id'].localeCompare(b['@id']))
    .map((node) => {
      const sorted = { '@id': node['@id'] };
      if (node['@type']) sorted['@type'] = [...node['@type']].sort();

      for (const key of Object.keys(node).filter((k) => !k.startsWith('@')).sort()) {
        sorted[key] = node[key];
      }
      return sorted;
    });
}

/** The spec commit these artifacts were built from, or null outside a checkout. */
function provenanceOf(specDir) {
  try {
    return {
      repo: 'the-cascade-protocol/spec',
      // `git -C` rather than a chdir: the build must not depend on where it was
      // launched from, and `execFileSync` keeps the path out of a shell.
      commit: require('node:child_process')
        .execFileSync('git', ['-C', specDir, 'rev-parse', 'HEAD'], { encoding: 'utf-8' })
        .trim(),
      builtAt: new Date().toISOString().slice(0, 10),
    };
  } catch {
    // A checkout with no `.git` — a tarball, a vendored copy in CI — is not an
    // error, but it must not silently produce artifacts claiming a provenance
    // they do not have.
    return { repo: 'the-cascade-protocol/spec', commit: null, builtAt: new Date().toISOString().slice(0, 10) };
  }
}

// Opened before anything that can fail — `specRoot()` refuses a missing
// checkout — and closed after everything is written: a crash between the two
// leaves no findings file, which is what the collector needs to tell "did not
// finish" from "found nothing". Opened AFTER it, a refused checkout would
// leave the previous run's file for the collector to merge as this run's.
const findings = openFindings({ source: 'build-spec-data', dir: DIAGNOSTICS });

const { root: specDir, manifest } = specRoot();
const vocabularies = Object.keys(manifest).sort();

// Removed rather than overwritten: a vocabulary dropped from the manifest must
// not leave its artifact behind, where every consumer would go on reading it.
//
// THE TWO DIRECTORIES THIS SCRIPT OWNS, not `src/spec/` whole. Everything under
// `src/spec/` is generated, but not all of it by this script:
// `src/spec/derived/` is written by `build-record-types.mjs` and
// `build-terms.mjs`, which run AFTER this one and read what it writes. Wiping
// the parent would delete their output too — harmless in `npm run generate`,
// where they run next, and not harmless anywhere a test rebuilds only the data
// (`tests/record-types/derivation.test.ts`, `tests/spec-data/ontology-jsonld.test.ts`),
// which would leave a sibling test file importing a module that no longer
// exists.
rmSync(OUT, { recursive: true, force: true });
rmSync(CONTEXTS, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
mkdirSync(CONTEXTS, { recursive: true });

let total = 0;

/** subject IRI -> the rule-stating comments on it and the vocabularies carrying them, folded across files. */
const normative = new Map();

for (const vocabulary of vocabularies) {
  const source = join(specDir, manifest[vocabulary].ontology);

  if (!existsSync(source)) {
    throw new Error(
      `spec-sources.json names ${manifest[vocabulary].ontology} for "${vocabulary}", and `
      + `${source} does not exist. Either the checkout is at a revision that does not publish `
      + 'it, or the manifest entry has outlived the file.',
    );
  }

  const quads = new N3Parser().parse(readFileSync(source, 'utf-8'));

  if (quads.length === 0) {
    throw new Error(
      `${source} parsed to zero quads. An empty ontology answers every question with "absent", `
      + 'which is indistinguishable from a class that does not exist.',
    );
  }

  // Over the raw quads, subject and object intact: `toExpandedJsonLd` is where
  // the predicate is dropped, and this has to read the comment before that.
  for (const [subject, { comments }] of normativeLanguageInComments(quads)) {
    const entry = normative.get(subject) ?? normative.set(subject, { comments: [], vocabularies: new Set() }).get(subject);
    entry.comments.push(...comments);
    entry.vocabularies.add(vocabulary);
  }

  const json = JSON.stringify(toExpandedJsonLd(quads));
  writeFileSync(join(OUT, `${vocabulary}.jsonld`), `${json}\n`, 'utf-8');
  total += quads.length;
  const omitted = quads.filter((q) => q.predicate.value === OMITTED).length;
  console.log(
    `  ${vocabulary.padEnd(10)} ${String(quads.length - omitted).padStart(5)} quads`
    + ` (${omitted} rdfs:comment omitted)`,
  );
}

// The contexts are carried VERBATIM, not converted. They are already JSON-LD,
// and they are the published name→IRI mapping — the thing #4 proposes making
// normative — so a byte-identical copy is the only form that cannot disagree
// with what spec publishes. #76 item 3.
const contexts = readdirSync(join(specDir, 'contexts/v1')).filter((f) => f.endsWith('.jsonld'));

if (contexts.length === 0) {
  throw new Error(
    `no contexts under ${join(specDir, 'contexts/v1')}. A missing context is not an empty one: `
    + 'every record class would come back unnamed, which reads as "this SDK registers nothing".',
  );
}

for (const file of contexts) {
  cpSync(join(specDir, 'contexts/v1', file), join(CONTEXTS, file));
}
console.log(`  contexts   ${String(contexts.length).padStart(5)} files, verbatim`);

writeFileSync(
  join(OUT, 'PROVENANCE.json'),
  `${JSON.stringify({ ...provenanceOf(specDir), vocabularies }, null, 2)}\n`,
  'utf-8',
);

/** A comment, bounded, so a 3,978-character rule does not become the whole row. */
const TEXT_LIMIT = 400;
const bounded = (text) => (text.length > TEXT_LIMIT ? `${text.slice(0, TEXT_LIMIT)}…` : text);

// ONE ROW PER SUBJECT, however many of its comments match and however many
// files they are spread across — three subjects in the corpus carry more than
// one `rdfs:comment` — so `${code}:${subject}` stays unique. Blank-node
// subjects never reach here. `reconcile`, not `spec`: whether a prose rule
// was meant to be checkable at all is spec's question before it is spec's fix.
for (const [subject, { comments, vocabularies: carriers }] of [...normative].sort(([a], [b]) => a.localeCompare(b))) {
  const carriedBy = [...carriers].sort();
  findings.record({
    code: 'normative-language-in-comment',
    severity: 'info',
    owner: 'reconcile',
    subject,
    detail: `${comments.length} rdfs:comment(s) on ${subject} state a rule in RFC 2119 language that `
      + `no SHACL shape encodes: "${bounded(comments[0])}"`,
    specFix: 'The rule exists only as prose and names no shape. Decide whether it is meant to be '
      + "enforced: if so, encode it as a SHACL constraint in the vocabulary's shapes file; if not, "
      + 'say it is advisory.',
    text: comments.map(bounded),
    location: carriedBy.flatMap((vocabulary) => [
      `spec:${manifest[vocabulary].ontology}`,
      ...(manifest[vocabulary].shapes ? [`spec:${manifest[vocabulary].shapes}`] : []),
    ]),
  });
}

if (normative.size > 0) {
  console.log(
    `  NOTE: ${normative.size} subject(s) carry an rdfs:comment stating a rule in RFC 2119 language `
    + 'that no shape encodes (normative-language-in-comment):\n'
    + [...normative.keys()].sort().map((subject) => `    ${subject}`).join('\n'),
  );
}

const recorded = findings.close();

const bytes = [OUT, CONTEXTS].flatMap((dir) => readdirSync(dir).map((f) => join(dir, f)))
  .reduce((sum, file) => sum + readFileSync(file).length, 0);

console.log(
  `build-spec-data: ${vocabularies.length} ontologies, ${total} quads, `
  + `${(bytes / 1024).toFixed(0)}K -> src/spec; ${recorded} finding(s) -> src/spec/diagnostics/build-spec-data.json`,
);
