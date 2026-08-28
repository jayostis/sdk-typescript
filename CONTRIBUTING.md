# Contributing to sdk-typescript

The TypeScript SDK for the Cascade Protocol, published as `@the-cascade-protocol/sdk`. It models each Cascade record type, maps it to RDF predicates, and serializes and deserializes between Turtle and JSON. Contributions are typically support for a vocabulary class the SDK does not model yet, a serialization fix, or test coverage for a fixture family nothing currently exercises.

## Before you start

- All open issues: <https://github.com/search?q=org%3Athe-cascade-protocol+is%3Aissue+is%3Aopen>
- Good first issues: <https://github.com/search?q=org%3Athe-cascade-protocol+is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22>

The "Known gaps" section of `CLAUDE.md` lists, specifically, which classes are unmodelled and which fixture families no test loads. Those are the openings.

## Development setup

**`conformance` must be cloned as a sibling directory**, not inside this one. Several suites resolve fixtures at `../../conformance/fixtures/`, and CI reproduces that layout exactly.

```
<parent>/
  sdk-typescript/
  conformance/
```

```bash
git clone https://github.com/the-cascade-protocol/sdk-typescript.git
git clone https://github.com/the-cascade-protocol/conformance.git
cd sdk-typescript

npm ci        # not npm install, and never a symlinked node_modules:
              # a symlink resolves packages back to whatever tree it points at,
              # which silently invalidates everything the suite then claims to test
npm run build
```

Install the hooks once: `sh scripts/install-hooks.sh`. The pre-commit hook blocks commits to `src/models/` or `src/vocabularies/` without updating `VOCAB_VERSIONS`.

### Debugging a test

Install the recommended **Vitest** extension — VS Code offers it on first open, from `.vscode/extensions.json`. It puts Run and Debug next to every `describe` and `it`, and reads vitest's own discovery, so a moved or renamed suite needs no configuration on your side.

A breakpoint is not tied to the test you launch from. Set one anywhere in `src/`, debug the test that exercises it, and execution stops there.

Two things to know if the debugger misbehaves, both learned the hard way:

- **Breakpoints never bind.** Vitest runs each file in a worker thread by default and the debugger can fail to attach. Running single-threaded fixes it — `--poolOptions.threads.singleThread`, or `--pool=forks --poolOptions.forks.singleFork` for a plainer target.
- **"Step into" silently steps over.** That is `smartStep`, which skips code that does not map cleanly to source — which, against vitest's on-the-fly TypeScript transpile, is most of it. Turn it off.

There is deliberately no `launch.json` in this repository. One existed, pinned a suite by filename, and went stale the first time that file moved.

## What must be green before review

```bash
npm ci
npm run build
npm run typecheck
npm test
```

All four. CI runs them on Node 18.x and 22.x, so a change that relies on newer runtime behavior fails there even when it passes locally.

`npm run typecheck` is separate from `npm run build` on purpose, and vitest does not typecheck. A change that compiles under the build config can still be a type error, and the suite will not tell you.

**Watch for tests that pass without asserting.** `tests/deserializer.test.ts` contains `if (!recordType) return;`, so an unmapped `dataType` reports a pass having checked nothing. If you add a class and its test goes green immediately, confirm the test actually reached its assertions before believing it.

## Commit messages

```
feat(sdk): add {ClassName} model (clinical v1.7)
feat(sdk): add Core v2.8 FHIR passthrough properties
fix(sdk): {description}
```

## Opening a pull request

1. Branch from `main`.
2. Build, typecheck and test, on Node 18 as well as 22 if you can.
3. Update `CHANGELOG.md` and bump `package.json` (minor for new class support).
4. Push and open a PR. `.github/PULL_REQUEST_TEMPLATE.md` fills in with the checklist; keep the items and tick them.
5. Name in the PR body the conformance fixtures your change is proven against. "Tests pass" is not the same claim as "these fixtures pass", and only the second one is evidence.

### Adding support for a new vocabulary class

Read the class definition in `spec/ontologies/{name}/v1/{name}.ttl`, its required properties in the matching `.shapes.ttl`, and its fixtures in `conformance/fixtures/` before writing anything.

- [ ] `src/models/{class-name}.ts` -- interface matching every TTL property
- [ ] Predicate URIs in `src/vocabularies/namespaces.ts` (`PROPERTY_PREDICATES`)
- [ ] `TYPE_MAPPING` entry with the correct `rdfType` from the TTL
- [ ] Registered in **both** the serializer and the deserializer
- [ ] `src/jsonld/context.ts`
- [ ] Exported from `src/index.ts`
- [ ] Conformance fixtures for the class pass
- [ ] `VOCAB_VERSIONS` bumped for the vocabulary you implemented
- [ ] `CHANGELOG.md`, and `package.json` version

**Test a round trip, not just a serialize.** Serializing correctly while the deserializer does not know the type is the failure mode that reads a pod full of records as an empty pod, and nothing reports it.

## Vocabulary changes

**Vocabulary is never authored here.** Classes and properties come from [`spec`](https://github.com/the-cascade-protocol/spec), and fixtures proving them come from [`conformance`](https://github.com/the-cascade-protocol/conformance). If your change needs a class that does not exist yet, it starts in `spec`: read [`spec/CONTRIBUTING.md`](https://github.com/the-cascade-protocol/spec/blob/main/CONTRIBUTING.md) for the full seven-step propagation sequence. This repository is step 5, and it is gated by step 3.

Record identity must match across SDKs: the same input derives the same URI in the TypeScript SDK, the Python SDK and the CLI. Do not change URI derivation here alone.

## Protocol context

<https://cascadeprotocol.org/llms.txt> is the protocol index: install, quick start, data types, MCP server, security model, vocabulary versions, deployment sequence. About 95 lines, meant to be read in full.

Do not load `llms-full.txt` from that site. It is roughly 1.3 MB, larger than most working contexts, and as of 2026-08-20 its ontology section is known to be incomplete. Read the TTL files in `spec` instead.

## Questions?

Open an issue on this repository, or a [discussion on `spec`](https://github.com/the-cascade-protocol/spec/discussions) for questions about the vocabulary itself.
