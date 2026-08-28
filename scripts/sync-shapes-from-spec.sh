#!/usr/bin/env bash
# Copy the SHACL shapes the tests load from `spec` into tests/shapes/.
#
# Only the vocabularies the suites actually load are vendored — a deliberate
# subset, not a mirror. Add one here when a suite starts loading it.
#
# After syncing:  node scripts/check-shapes-drift.mjs && npm test
# A constraint that changed in spec may turn a passing assertion red. That is
# the check working, not a regression.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# CASCADE_SPEC_DIR is the name scripts/check-shapes-drift.mjs reads, and the name
# it prints when it cannot find spec. Two names for one location is how someone
# syncs from one checkout and then drift-checks against a different one.
SPEC="${CASCADE_SPEC_DIR:-$ROOT/../spec}"
DEST="$ROOT/tests/shapes"

[[ -d "$SPEC" ]] || { echo "Error: no spec checkout at $SPEC — set CASCADE_SPEC_DIR" >&2; exit 1; }

for vocab in core health; do
  cp "$SPEC/ontologies/$vocab/v1/$vocab.shapes.ttl" "$DEST/$vocab.shapes.ttl"
  echo "copied $vocab.shapes.ttl"
done

echo "synced from spec@$(git -C "$SPEC" rev-parse --short HEAD 2>/dev/null || echo unknown)"
echo "next: update the revision in tests/shapes/README.md, then check-shapes-drift"
