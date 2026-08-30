# tests/

Where a new test file goes.

| Directory | Holds | A test belongs here when |
| --- | --- | --- |
| `tests/` | One file per feature area — `serializer.test.ts`, `deserializer.test.ts`, `jsonld.test.ts`, `validator.test.ts`, one per vocabulary wave — or per public module, like `turtle-builder.test.ts`. | It exercises the SDK's public surface: a record in and Turtle or JSON-LD out, or one exported class on its own. |
| `tests/terms/` | The term modules: rule forms, and the registry invariants over them. | It is about how a term SERIALIZES a field — a rule form's outputs, a predicate override, or a registry-wide invariant. Term logic is pure, so these need no serializer. |
| `tests/rules/` | One file per SHACL constraint component — `max-count.test.ts`, `value-set.test.ts`, `min-count.test.ts`. | It is about a rule the vocabulary states, and it belongs here because a rule spans three layers: what a term declares, what the writer does with it (usually nothing, on purpose), and what `validate()` reports. Split across `tests/terms/`, `tests/serializer.test.ts` and `tests/validator.test.ts`, each third can only *claim* the other two exist. Constructed records; `tests/rules/records.ts` builds them. |
| `tests/conformance/` | One file per fixture family, named for the prefix: `absent-001..003` → `absent.test.ts`, `lab-*` → `lab.test.ts`. | It drives a real fixture through `serialize()` and asserts on the resulting graph or its SHACL verdict. One family per file, so a family's fixtures are read together and a new one has an obvious home. |
| `tests/shapes/` | Vendored `.shapes.ttl` from `spec`, and nothing else. | Never. Re-sync it from `spec`; do not hand-edit. |
| `tests/support/` | Fixture loaders and other helpers shared between test files. | It is a helper, not a test. Files here carry no `.test.ts` suffix and vitest does not collect them. |

Conventions that hold everywhere. **An issue may name what to assert; how a test
is written is decided here**, so read this before writing one rather than
copying the shape of whatever file you opened first.

- **A test may only claim what it can assert.** A name or a comment that
  describes what happens somewhere else is a promise nothing keeps: a pure term
  test cannot see `validate()`, so `leaving the cap to the validator` said
  something no assertion in that file backed, and the validator half turned out
  not to exist. Where a reference is genuinely needed, NAME THE TEST that covers
  it — `tests/rules/max-count.test.ts > names the field, the count and the cap`
  — so the reference breaks when the thing does. This is also why
  `tests/rules/` is keyed on the rule rather than the module: with all three
  layers in one file, the promise and the assertion cannot drift apart.
- **A test can stop covering its subject without going red.** `writes every
  value of an array` used `resultValue`, which was termed three commits later —
  a termed field forks above the type-driven chain, so the loop under test was
  never entered again and the assertion passed on a path it no longer reached.
  When a test depends on a field having NO rule, say so at the call site and
  check `termFor` before trusting it. Mutation is what finds these: break the
  line the test is for, and if the suite stays green the test is not testing it.
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
- **A comment earns its place by changing what the reader does.** Not by being
  true, and not by being well argued. The test: would someone who skipped it
  write something different from someone who read it? A fact that lives OUTSIDE
  this file passes — what an `sh:in` list contains, two different sets sharing
  one name, a spelling `spec` and the corpus disagree on. The strongest case is a
  test that is *absent*: nothing but prose can say why a question was not asked,
  and without it someone will "fix" the gap. Restating the assertion fails.
  Defending the decision fails too — that argument is scoped to one change, so it
  belongs in the commit message or the PR, where it rots honestly instead of
  outliving the thing it justified. **Anything true only of a branch — "red at
  HEAD", "green until the fork lands" — is in this second class and always
  wrong here**; it is already recorded in the commit and the PR checklist with
  its SHAs, and it becomes false on merge.
- **Never derive the expected value from the code under test.** Write the
  predicate, the datatype, the local name out by hand. Reading `snomedCode`'s
  predicate from `PROPERTY_PREDICATES` to assert what the serializer wrote makes
  the test agree with the table by construction, and a re-namespaced predicate
  then passes unnoticed — the exact defect the test exists to catch. The reason
  is written up once on the `cascade` accessor in `tests/support/graph.ts`.
- **Every path through a test asserts something.** No `if (…) return;` that
  reports a pass without having looked — `tests/deserializer.test.ts` still does
  this for an unmapped `dataType`, and a skip that reports green is worse than a
  failure, because nothing ever tells you it stopped checking. Where a case
  genuinely cannot be judged, assert that it cannot: `shaclCheck` refuses a graph
  the vendored shapes are silent on rather than returning a vacuous
  `conforms: true`.
- **Assert on the graph, not on the Turtle text.** Two writers spell the same
  graph differently — a repeated predicate and an object list are the same
  triples and different bytes — so a string comparison fails on a difference that
  is not one, and `toContain` passes on a substring that proves nothing about
  what else the document says. `triples()` in `tests/support/graph.ts` is the
  tool where both sides are ground; a graph carrying blank nodes needs traversal
  instead. The one thing text can say that a parsed graph cannot is that a
  document *fails* to parse — an undeclared `@prefix` is invisible to
  `toContain` and fatal to a reader.
