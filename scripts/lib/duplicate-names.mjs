/**
 * Which names more than one row claims, and which rows claim them.
 *
 * ONE CALLER TODAY, and the doc here used to claim two. It said
 * `scripts/build-terms.mjs` asked the same question, written in anticipation of
 * `#91` wiring it in; `#91` landed without doing so, and the term generator
 * still reports its 34 cross-context conflicts as a bare count with the
 * identities discarded (`#92`). Corrected rather than left standing: a
 * justification that names a caller which does not exist is the kind of claim
 * nobody re-checks, and it argued for a module on grounds that had quietly
 * stopped being true.
 *
 * IT IS STILL A MODULE, on narrower grounds. The question — a name claimed
 * twice is an ambiguity to report, not a duplicate to drop — is one every
 * generated name table will ask, and `#92`'s worklist is where the second
 * caller arrives. `scripts/lib/walk.mjs` sits here for the same reason.
 *
 * FILTERS, IT DOES NOT PARTITION — the distinction that matters, because
 * `src/record-types/index.ts` looks like it does the same thing and does not.
 * This DISCARDS every name claimed once and returns only the collisions, which
 * is what a report wants. `partitionNamesByClaimant` there KEEPS both halves,
 * because a runtime lookup has to answer for the uncontested names as well as
 * refuse on the contested ones. Two rules, and neither call site can use the
 * other's. See its doc comment for the other half of this note.
 *
 * NOT SHARED WITH `src/` EITHER WAY. Nothing under `scripts/` ships — a
 * consumer installs `dist` — so importing this into the runtime package would
 * put build tooling on the path `tests/no-runtime-deps.test.ts` exists to keep
 * clear. That, and not oversight, is why the two live apart.
 *
 * REPORTS, NEVER DECIDES. It has no idea whether a collision is settled
 * elsewhere: `src/record-types/overrides.ts` resolves the one collision spec
 * currently publishes, and this module cannot see that file and should not try
 * to — that was the option `#89` weighed and rejected, since a generator that
 * refused to write would stop every uncontested row over one contested name.
 * So the answer is data, handed back for the caller to warn about, carry into
 * a generated table, or refuse on.
 *
 * @module scripts/lib/duplicate-names
 */

/**
 * The names claimed more than once, each with its claimants in row order.
 *
 * `Among` is load-bearing: this returns a SUBSET of the names it was given, not
 * a verdict on each of them. A name claimed exactly once does not appear in the
 * result at all — it is not reported as fine, it is simply gone. A caller that
 * needs to know about those too wants a partition, and
 * `partitionNamesByClaimant` in `src/record-types/index.ts` is the one that
 * gives it.
 *
 * SORTED BY NAME, and claimants left in the order the rows arrived. Both halves
 * are for the generated artifacts this feeds: a table that reordered between
 * builds would show a diff on every run and the byte-identical regeneration
 * check in `tests/record-types/derivation.test.ts` would fail on nothing.
 *
 * An empty result is the ordinary case and means what it says — every name is
 * claimed at most once. It is not "no answer".
 *
 * @template TRow
 * @template TClaimant
 * @param {Iterable<TRow>} rows - The rows to check.
 * @param {(row: TRow) => string} nameOf - The name a row claims.
 * @param {(row: TRow) => TClaimant} [claimantOf] - Who claims it; the row itself
 *   by default, so a caller that wants an identifier — a class IRI, a
 *   vocabulary — asks for one rather than digging it back out.
 * @returns {{ name: string, claimants: TClaimant[] }[]}
 */
export function duplicateNamesAmong(rows, nameOf, claimantOf = (row) => /** @type {any} */ (row)) {
  const claimants = new Map();

  for (const row of rows) {
    const name = nameOf(row);
    claimants.set(name, [...(claimants.get(name) ?? []), claimantOf(row)]);
  }

  return [...claimants]
    .filter(([, who]) => who.length > 1)
    .map(([name, who]) => ({ name, claimants: who }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
