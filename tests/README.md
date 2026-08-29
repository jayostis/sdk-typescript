# tests/

Where a new test file goes.

| Directory | Holds | A test belongs here when |
| --- | --- | --- |
| `tests/` | One file per feature area — `serializer.test.ts`, `deserializer.test.ts`, `jsonld.test.ts`, `validator.test.ts`, one per vocabulary wave — or per public module, like `turtle-builder.test.ts`. | It exercises the SDK's public surface: a record in and Turtle or JSON-LD out, or one exported class on its own. |
| `tests/terms/` | The term modules: rule forms, and the registry invariants over them. | It is about what a term *declares* — a rule form's outputs, a predicate override, or a registry-wide invariant. Term logic is pure, so these need no serializer. |
| `tests/conformance/` | One file per fixture family, named for the prefix: `absent-001..003` → `absent.test.ts`, `lab-*` → `lab.test.ts`. | It drives a real fixture through `serialize()` and asserts on the resulting graph or its SHACL verdict. One family per file, so a family's fixtures are read together and a new one has an obvious home. |
| `tests/shapes/` | Vendored `.shapes.ttl` from `spec`, and nothing else. | Never. Re-sync it from `spec`; do not hand-edit. |
| `tests/support/` | Fixture loaders and other helpers shared between test files. | It is a helper, not a test. Files here carry no `.test.ts` suffix and vitest does not collect them. |

Two conventions that hold everywhere:

- **A detector is proven by making it speak.** Pointing a check only at a
  directory where it should stay silent proves nothing about the check, so hand
  it input where it must name something first, and point it at ourselves second.
  `tests/terms/registry.test.ts` builds a scratch directory to do exactly that.
- **A helper a test file needs lives beside it, un-suffixed.** `tests/terms/registry.ts`
  is imported by `tests/terms/registry.test.ts`; it is not itself collected.
- **One unit per file, and the top-level `describe` is its name.** Nested
  `describe`s are the cases, and an `it` says what the code does — `unbarrelled >
  names the term file a barrel left out`, so the runner output reads as a
  specification. Why the check exists, and what breaks without it, goes once on
  the `describe` rather than being restated in every `it`. A file testing two
  units is two files: `addAll` lives in `tests/turtle-builder.test.ts` and not
  beside `outputsFor`, because they are different modules.
