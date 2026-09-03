/**
 * The two things every generator here does to an IRI, written once.
 *
 * FOUR BYTE-IDENTICAL COPIES OF `localNameOf` EXISTED, and a fifth that had
 * already drifted. `src/utils/code-keys.ts` splits on `#` alone and falls back
 * to the whole path segment where the others split on `#` or `/` — a different
 * answer for `.../v1/Foo`, arrived at by nobody deciding it. That is what four
 * copies do: the divergence is invisible because no two of them are read
 * together.
 *
 * NOT SHARED WITH `src/`, deliberately. Nothing under `scripts/` ships — a
 * consumer installs `dist` — so `src/` importing from here would put an
 * unpublished file on the runtime path. The runtime copies stay in `src/`; this
 * is for the generators, and the duplication across that boundary is the price
 * of the boundary.
 *
 * @module scripts/lib/iri
 */

/**
 * The local name: everything after the last `#` or `/`.
 *
 * Both separators, because spec uses both — `.../core/v1#dataProvenance` is
 * hash-delimited and a slash-delimited IRI would otherwise return the whole
 * thing. `Math.max` of the two indices is the last separator of either kind,
 * and `+ 1` is what makes a miss (`-1`) return the whole string rather than
 * dropping its first character.
 */
export function localNameOf(iri) {
  return iri.slice(Math.max(iri.lastIndexOf('#'), iri.lastIndexOf('/')) + 1);
}

/** The namespace: everything up to and including the last `#` or `/`. */
export function namespaceOf(iri) {
  return iri.slice(0, Math.max(iri.lastIndexOf('#'), iri.lastIndexOf('/')) + 1);
}

/**
 * Which context file owns each namespace, derived rather than assumed.
 *
 * WHAT THIS REPLACES. `src/converter/to-rdf.ts` read the vocabulary out of a
 * class IRI with `/\/([a-z]+)\/v\d+#/` — spec's URI shape written as an
 * assumption in code, in the module whose whole purpose is to stop encoding
 * spec by hand. It failed silently: a segment carrying a digit or a hyphen, or
 * any IRI shaped differently, fell through to `'core'`, and a record then
 * resolved against core's terms with its own vocabulary invisible. Unreachable
 * at the pinned revision and free to break the day spec adds a vocabulary.
 *
 * THE RULE. A context file owns the namespace it is ABOUT, and which one that
 * is falls out of its own terms: measured at the pin, each of the six
 * per-vocabulary contexts has **100%** of its terms in a single namespace,
 * while `cascade.jsonld` — the everything-context, 719 terms — never exceeds
 * 34% of any. So the owner is the context with the largest share, and the
 * margin is not close.
 *
 * That derives the judgement the old code made in a comment: core's terms are
 * published in both `core.jsonld` (141 terms) and `cascade.jsonld` (719), and
 * `core` is the one to resolve against. Picking `cascade` would hand a record
 * every vocabulary's terms at once, which is the merged-table failure the
 * per-vocabulary stack exists to prevent.
 *
 * AMBIGUITY IS REFUSED, not broken by iteration order. Two contexts with an
 * equal claim on one namespace means the rule no longer decides, and guessing
 * would pick whichever the filesystem listed first.
 *
 * @param {Record<string, Record<string, {predicate: string}>>} vocabularies
 * @returns {Record<string, string>} namespace -> vocabulary
 */
export function namespaceOwners(vocabularies) {
  /** @type {Record<string, {vocabulary: string, share: number}[]>} */
  const claims = {};

  for (const [vocabulary, terms] of Object.entries(vocabularies)) {
    const total = Object.keys(terms).length;
    if (total === 0) continue;

    const counts = {};
    for (const { predicate } of Object.values(terms)) {
      const ns = namespaceOf(predicate);
      if (ns) counts[ns] = (counts[ns] ?? 0) + 1;
    }

    for (const [ns, count] of Object.entries(counts)) {
      (claims[ns] ??= []).push({ vocabulary, share: count / total });
    }
  }

  const owners = {};

  for (const [ns, claimants] of Object.entries(claims)) {
    const ranked = [...claimants].sort((a, b) => b.share - a.share);
    const [best, runnerUp] = ranked;

    if (runnerUp && runnerUp.share === best.share) {
      throw new Error(
        `${ranked.filter((c) => c.share === best.share).map((c) => c.vocabulary).join(' and ')} `
        + `have an equal claim on ${ns}, so which one a record of that namespace resolves `
        + 'against would be decided by directory order. Nothing in the published contexts '
        + 'settles it; it has to be settled upstream.',
      );
    }

    owners[ns] = best.vocabulary;
  }

  return owners;
}
