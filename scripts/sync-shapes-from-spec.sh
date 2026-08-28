#!/usr/bin/env bash
# Copy the SHACL shapes the tests load from `spec` into tests/shapes/.
#
# Only the vocabularies the suites actually load are vendored — a deliberate
# subset, not a mirror.
#
# WHAT TO EDIT TO ADD ONE. tests/shapes/vendored.json, and nothing else. This
# script, scripts/check-shapes-drift.mjs and tests/support/shacl.ts all read that
# one file, so the copy, the drift check and the SHACL coverage guard cannot
# disagree by construction. They used to hold four hand-maintained lists: adding
# a vocabulary here but not to the drift check reported `ORPHAN ... spec
# publishes no such file`, which was false and pointed at the wrong repo, and
# adding a namespace to rdf.ts without its file let a record through to a shapes
# graph holding nothing for it — the vacuous conforms:true the guard exists to
# refuse.
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
MANIFEST="$DEST/vendored.json"

[[ -d "$SPEC" ]] || { echo "Error: no spec checkout at $SPEC — set CASCADE_SPEC_DIR" >&2; exit 1; }
[[ -f "$MANIFEST" ]] || { echo "Error: no manifest at $MANIFEST" >&2; exit 1; }

# One "<file> <specPath>" line per vendored shape. `node -p` runs as CommonJS,
# so require() is available whatever "type" package.json declares.
PLAN="$(node -p "Object.entries(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))).map(([n, v]) => n + ' ' + v.specPath).join('\n')" "$MANIFEST")"

# An empty manifest would make the loop a no-op and this script report success
# having copied nothing — the same "0 files, looks like a pass" failure
# check-shapes-drift.mjs exits 2 for.
[[ -n "$PLAN" ]] || { echo "Error: $MANIFEST lists no shapes to copy" >&2; exit 1; }

while read -r name specPath; do
  cp "$SPEC/ontologies/$specPath/$name" "$DEST/$name"
  echo "copied $name"
done <<< "$PLAN"

echo "synced from spec@$(git -C "$SPEC" rev-parse --short HEAD 2>/dev/null || echo unknown)"
echo "next: update the revision in tests/shapes/README.md, then check-shapes-drift"
