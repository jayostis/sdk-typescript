/**
 * Which names more than one row claims, and which rows claim them.
 *
 * ONE DETECTOR, BECAUSE TWO TABLES ASK THE SAME QUESTION. A JSON name must
 * identify exactly one thing: `scripts/build-record-types.mjs` maps a name to a
 * class and `scripts/build-terms.mjs` maps a key to a predicate, and in both a
 * second claimant is not a duplicate to be dropped but a genuine ambiguity that
 * something downstream has to be told about. Written twice, the two copies
 * would answer the same question in two shapes, and the fix for one — order the
 * claimants, keep the alias case, report rather than throw — would reach only
 * the copy whose bug was found. `scripts/lib/walk.mjs` exists for the same
 * reason and says so.
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
export function duplicateNames(rows, nameOf, claimantOf = (row) => /** @type {any} */ (row)) {
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
