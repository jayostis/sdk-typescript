# tests/

Where a new test file goes.

| Directory | Holds | A test belongs here when |
| --- | --- | --- |
| `tests/` | One file per feature area — `serializer.test.ts`, `deserializer.test.ts`, `jsonld.test.ts`, `validator.test.ts`, and one per vocabulary wave. | It exercises the SDK's public surface end to end: a record in, Turtle or JSON-LD out. |
| `tests/terms/` | The term modules: rule forms, and the registry invariants over them. | It is about what a term *declares* — a rule form's outputs, a predicate override, or a registry-wide invariant. Term logic is pure, so these need no serializer. |
| `tests/shapes/` | Vendored `.shapes.ttl` from `spec`, and nothing else. | Never. Re-sync it from `spec`; do not hand-edit. |
| `tests/support/` | Fixture loaders and other helpers shared between test files. | It is a helper, not a test. Files here carry no `.test.ts` suffix and vitest does not collect them. |

Two conventions that hold everywhere:

- **A detector is proven by making it speak.** Pointing a check only at a
  directory where it should stay silent proves nothing about the check, so hand
  it input where it must name something first, and point it at ourselves second.
  `tests/terms/registry.test.ts` builds a scratch directory to do exactly that.
- **A helper a test file needs lives beside it, un-suffixed.** `tests/terms/registry.ts`
  is imported by `tests/terms/registry.test.ts`; it is not itself collected.
