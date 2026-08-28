# Vendored SHACL shapes

Copies of the shape files from [`spec`](https://github.com/the-cascade-protocol/spec),
read by tests only. Never imported by `src/`, never published.

| file | source | constrains |
|---|---|---|
| `core.shapes.ttl` | `spec/ontologies/core/v1/core.shapes.ttl` | `cascade:` |
| `health.shapes.ttl` | `spec/ontologies/health/v1/health.shapes.ttl` | `health:` |

Synced from `spec@678ae0d`.

A deliberate subset, not a mirror. `tests/support/rdf.ts` refuses to return a
SHACL verdict for a graph these shapes are silent on — an uncovered type, or a
predicate from a vocabulary not vendored here — rather than reporting the
vacuous `conforms: true` a graph with no matching shape produces. Adding a
vocabulary here is what makes it checkable.

## `vendored.json` — the one list

`vendored.json` is the table above in machine-readable form, and the only place
the set is written down:

```json
{ "core.shapes.ttl": { "specPath": "core/v1", "prefix": "cascade" } }
```

`specPath` is the `ontologies/` subdirectory spec publishes the file at.
`prefix` is the key in the SDK's own `NAMESPACES` for the namespace those
shapes constrain — core publishes its terms under `cascade:`.

Three consumers read it, so **to vendor a vocabulary, edit this file and
re-run the sync script. Nothing else.**

| consumer | what it takes from the manifest |
|---|---|
| `scripts/sync-shapes-from-spec.sh` | which files to copy, and from where |
| `scripts/check-shapes-drift.mjs` | which files must be present, and their upstream path |
| `tests/support/rdf.ts` | which files to load, and which namespaces a verdict may cover |

These were four hand-maintained lists, and nothing enforced agreement between
them. Both directions failed quietly: a file synced but not registered with the
drift check was reported as `ORPHAN … spec publishes no such file` — false, and
it pointed the reader at the wrong repository — and a namespace registered in
`rdf.ts` without its file let a record through to a shapes graph holding
nothing for it, producing the vacuous `conforms: true` the guard exists to
refuse. One list removes the class rather than documenting it.

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
`spec` is checked out. Exit 1 there means these copies are stale and need
re-syncing; exit 2 means the check could not run at all, which is an
infrastructure fault rather than drift. A constraint that changed upstream may
turn a passing assertion red after a re-sync — that is the check working, not a
regression.
