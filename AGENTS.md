# AGENTS.md

TypeScript SDK for the Cascade Protocol, published as `@the-cascade-protocol/sdk`. Models, serializes and deserializes Cascade record types between Turtle and JSON.

## Start here

- `CLAUDE.md` -- architecture, the checklist for adding a vocabulary class, and the current known gaps class by class.
- `CONTRIBUTING.md` -- setup, what must be green, PR conventions.
- `README.md` -- user-facing API reference.

`CLAUDE.md` and this file describe the same repository. `CLAUDE.md` is loaded automatically by Claude Code; this file exists so any coding agent finds the same instructions.

## Protocol context

<https://cascadeprotocol.org/llms.txt> is the protocol index: install, quick start, data types, MCP server, security model, vocabulary versions, deployment sequence. About 95 lines, meant to be read in full.

Do **not** load `llms-full.txt` from that site. It is roughly 1.3 MB, larger than most working contexts, and as of 2026-08-20 its ontology section is known to be incomplete. Read the TTL files in [`spec`](https://github.com/the-cascade-protocol/spec) instead.

## Ground rules

- **Vocabulary is not authored here.** Read the class in `spec/ontologies/{name}/v1/{name}.ttl`, its constraints in the matching `.shapes.ttl`, and its fixtures in `conformance/fixtures/` before implementing anything.
- **Register every class in the deserializer as well as the serializer, and test a round trip.** A class that serializes but does not deserialize makes a pod full of records read as empty, and nothing reports it.
- **`conformance` and `spec` must both be sibling checkouts**, at `../conformance` and `../spec`. Suites resolve fixtures through the first and read the shapes out of the second; nothing in this repository holds a `.ttl` file. `CASCADE_SPEC_DIR` names `spec` somewhere else and is checked first — CI sets it. With neither, every SHACL suite refuses with `no spec checkout at <path>`, which is deliberate: shapes that fail to load conform to everything.
- **A green test is not always an executed test.** `tests/deserializer.test.ts` uses `if (!recordType) return;`, so an unmapped `dataType` passes without asserting. Prefer an explicit assertion to an early return, and confirm a new test reached its assertions.
- **`npm ci`, never a symlinked `node_modules`.** A symlink resolves packages back to whatever tree it points at, invalidating everything the suite then claims to have tested.

## What must be green

```bash
npm ci
npm run build
npm run typecheck
npm test
```

All four. CI runs them on Node 18.x and 22.x. `typecheck` is separate from `build` on purpose and vitest does not typecheck, so a type error can survive a green suite.

## Conventions

- Commits: `feat(sdk):`, `fix(sdk):`, naming the vocabulary version where relevant.
- Update `CHANGELOG.md` and bump `package.json` (minor for new class support). The pre-commit hook blocks `src/models/` and `src/vocabularies/` changes that do not update `VOCAB_VERSIONS`.
- Branch from `main`; open a PR rather than pushing to it.
- Name the conformance fixtures your change is proven against in the PR body. "Tests pass" and "these fixtures pass" are different claims.
