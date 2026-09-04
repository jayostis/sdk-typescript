/**
 * Merge every generator's findings into one `diagnostics.json`.
 *
 * STUB. `node scripts/collect-diagnostics.mjs <findingsDir> <outFile>` is the
 * invocation `tests/diagnostics/collector.test.ts` was written to: read
 * `build-spec-data.json`, `build-record-types.json` and `build-terms.json`
 * from `findingsDir` — every one of them must exist — refuse a repeated `id`,
 * an `id` that is not `` `${code}:${subject}` `` (an EQUALITY check, since a
 * subject may itself contain `:`), an `owner` outside `spec` / `sdk` /
 * `reconcile`, or a row whose `source` is not the file it sits in, exiting
 * non-zero and naming the reason on stderr; otherwise write
 * `{ commit, findings }` to `outFile` with the findings sorted by `id` and
 * `commit` read from `<findingsDir>/PROVENANCE.json`, `null` when there is none.
 *
 * Does nothing yet.
 */

process.exit(0);
