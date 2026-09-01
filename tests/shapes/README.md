# Vendored SHACL shapes

Copies of the shape files from [`spec`](https://github.com/the-cascade-protocol/spec),
read by tests only. Never imported by `src/`, never published.

| file | source |
|---|---|
| `core.shapes.ttl` | `spec/ontologies/core/v1/core.shapes.ttl` |
| `health.shapes.ttl` | `spec/ontologies/health/v1/health.shapes.ttl` |
| `clinical.shapes.ttl` | `spec/ontologies/clinical/v1/clinical.shapes.ttl` |
| `coverage.shapes.ttl` | `spec/ontologies/coverage/v1/coverage.shapes.ttl` |

Synced from `spec@b73b28c`.

A deliberate subset, not a mirror. `tests/support/shacl.ts` refuses to return a
SHACL verdict for a graph these shapes are silent on — a type no `sh:targetClass`
selects, or a predicate no `sh:path` declares — rather than reporting the vacuous
`conforms: true` a graph with no matching shape produces. Adding a vocabulary
here is what makes it checkable.

**The unit of coverage is a declaration, not a vocabulary.** `shacl.ts` reads the
`sh:targetClass` and `sh:path` IRIs out of the loaded graph and asks whether the
record's types and predicates are among them. A file constrains neither less nor
more than the vocabulary it is named for, and both directions occur here:
`core.shapes.ttl` declares `sh:path dct:title` — `dcterms:` has no shapes file in
spec and can never be vendored — while `health:notes` sits in a vendored
vocabulary and no shape declares a path for it.

## `vendored.json` — the one list

`vendored.json` is the table above in machine-readable form, and the only place
the set is written down:

```json
{ "core.shapes.ttl": { "specPath": "core/v1" } }
```

`specPath` is the `ontologies/` subdirectory spec publishes the file at, and is
the only field. There used to be a `prefix` naming the namespace the file was
taken to constrain, and coverage was decided from it; a namespace is the wrong
grain for that question, and deriving it from the shapes graph instead removed
the field as a thing that can be wrong.

Three consumers read it, so **to vendor a vocabulary, edit this file and
re-run the sync script. Nothing else.**

| consumer | what it takes from the manifest |
|---|---|
| `scripts/sync-shapes-from-spec.sh` | which files to copy, and from where |
| `scripts/check-shapes-drift.mjs` | which files must be present, and their upstream path |
|  `tests/support/shacl.ts` | which files to load |

These were four hand-maintained lists, and nothing enforced agreement between
them. Both directions failed quietly: a file synced but not registered with the
drift check was reported as `ORPHAN … spec publishes no such file` — false, and
it pointed the reader at the wrong repository — and a namespace registered in
`tests/support/shacl.ts` without its file let a record through to a shapes
graph holding nothing for it, producing the vacuous `conforms: true` the guard
exists to refuse. One list removes the class rather than documenting it.

## Why these are vendored rather than read from a sibling checkout

This package is published standalone and its CI test job checks out
`conformance` but not `spec`. A test that read the shapes from `../../spec`
would either fail on every clean machine or skip itself whenever the sibling was
missing — and a test that skips when it cannot find its input proves nothing
while reporting green. That is the same reasoning recorded on
`LAB_INTERPRETATION_CHECKSUM` in `src/models/common.ts`.

## Keeping the copies honest

A copy that can drift silently is worse than no copy. Two scripts guard this
directory, and `cascade-cli` pairs the same files with the same two:

```bash
npm run check:shapes-drift          # 0 match · 1 drifted · 2 cannot check
bash scripts/sync-shapes-from-spec.sh   # re-copy, then update the revision above
```

Both find `spec` as a sibling of this repo by default. Elsewhere, set
`CASCADE_SPEC_DIR` — one name, honoured by both — or pass `--spec <dir>` to the
drift check.

`bash`, not `sh`: the sync script is `#!/usr/bin/env bash` and uses `BASH_SOURCE`
and `[[`, which are errors under dash.

The drift check runs in CI as the `shapes-drift` job, which is the only place
`spec` is checked out. Exit 2 means the check could not run at all, which is an
infrastructure fault rather than drift. Exit 1 is a copy that no longer matches
spec, and the run prints the remedy for each problem it found rather than one
shared line — **an orphan is not fixed by re-syncing.** The sync script only
copies the files the manifest lists and has no delete step, so a file left behind
after a vocabulary was dropped from `vendored.json` survives a re-sync and comes
back red next run; `git rm` it, or add it to the manifest if it belongs there. A
constraint that changed upstream may turn a passing assertion red after a
re-sync — that is the check working, not a regression.
