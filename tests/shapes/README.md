# Vendored SHACL shapes

Copies of the shape files from [`spec`](https://github.com/the-cascade-protocol/spec),
read by tests only. Never imported by `src/`, never published.

| file | source |
|---|---|
| `core.shapes.ttl` | `spec/ontologies/core/v1/core.shapes.ttl` |
| `health.shapes.ttl` | `spec/ontologies/health/v1/health.shapes.ttl` |

Synced from `spec@5a56ab4`.

## Why these are vendored rather than read from a sibling checkout

This package is published standalone and its CI checks out `conformance` but not
`spec`. A test that read the shapes from `../../spec` would either fail on every
clean machine or skip itself whenever the sibling was missing — and a test that
skips when it cannot find its input proves nothing while reporting green. That
is the same reasoning recorded on `LAB_INTERPRETATION_CHECKSUM` in
`src/models/common.ts`.

`cascade-cli` vendors the same files for the same reason, and pairs them with
`scripts/sync-shapes-from-spec.sh` and `scripts/check-shapes-drift.mjs`. A copy
that can drift silently is worse than no copy: this directory needs the
equivalent drift check before it can be trusted over time.
