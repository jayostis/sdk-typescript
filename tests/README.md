# tests/

Where a new test file goes.

| Directory | Holds | A test belongs here when |
| --- | --- | --- |
| `tests/` | One file per feature area — `serializer.test.ts`, `deserializer.test.ts`, `jsonld.test.ts`, `validator.test.ts`, one per vocabulary wave — or per public module, like `turtle-builder.test.ts`. | It exercises the SDK's public surface: a record in and Turtle or JSON-LD out, or one exported class on its own. |
| `tests/terms/` | The term modules: rule forms, and the registry invariants over them. | It is about how a term SERIALIZES a field — a rule form's outputs, a predicate override, or a registry-wide invariant. Term logic is pure, so these need no serializer. |
| `tests/rules/` | One file per SHACL constraint component — `max-count.test.ts`, `value-set.test.ts`, `min-count.test.ts`. | It is about a rule the vocabulary states, and it belongs here because a rule spans three layers: what a term declares, what the writer does with it (usually nothing, on purpose), and what `validate()` reports. Split across `tests/terms/`, `tests/serializer.test.ts` and `tests/validator.test.ts`, each third can only *claim* the other two exist. Constructed records; `tests/rules/records.ts` builds them. |
| `tests/conformance/` | One directory per fixture family, one file per fixture inside it — `profile/profile-004-missing-dob.test.ts`. Families not yet migrated are still one file for the whole family (`absent.test.ts`, `lab.test.ts`, `coverage.test.ts`); both shapes are collected. | It drives a real fixture through the SDK and asserts on the resulting graph or its verdict. **One file per fixture**, named `<fixture-id>-<slug>.test.ts`, so a failing file names the fixture before anyone opens it and a new fixture has one obvious home. A family with no coverage yet has no directory rather than an empty one. |
| `tests/support/` | Fixture loaders, the `spec` resolver (`spec-sources.ts`), and other helpers shared between test files. | It is a helper, not a test. Files here carry no `.test.ts` suffix and vitest does not collect them. |

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
  tool where both sides are ground. A graph carrying blank nodes needs
  `graphDifference`, which canonicalises both sides so a blank node is named from
  the graph's own shape rather than from the order it was parsed in — or
  traversal, which follows an edge without ever naming the node it lands on.
  Prefer traversal when the failure message matters: a canonical diff says a line
  differs, a traversal says which structure lost which field. The one thing text
  can say that a parsed graph cannot is that a document *fails* to parse — an
  undeclared `@prefix` is invisible to `toContain` and fatal to a reader.
- **The seven questions belong to the contract, not to the fixture.**
  `followsTheFixtureContract` in `tests/support/fixture-contract.ts` asks every
  fixture the same things — written in both formats and the two agreeing, read
  back from both, and judged by both validators — so strengthening a question
  strengthens every fixture at once, and a fixture cannot quietly ask less than
  its siblings. It registers its `it`s in the CALLER's describe and opens none of
  its own, which is load-bearing: the identity question reads `task.suite?.name`,
  and a nested describe would have it compare the helper's title instead and go
  vacuous while still passing. What stays hand-written beside it is what is true
  of THAT fixture — which rule it breaks, on which predicate — because the
  contract can only say the verdicts line up, never which one was right.
- **Everything the contract needs comes from the call site, and none of it is an
  opt-out.** No table keyed by fixture id: a reader sees the fixture, the contract
  line, and beside it whatever that line needed to know. The one thing supplied
  so far is a predicate-to-field mapping, because a SHACL result names an
  `sh:path` and `validate()` names a JSON key and nothing can bridge those but a
  human. There is deliberately NO argument meaning "skip this question" — an
  unmapped violation is REPORTED rather than passed, since otherwise omitting a
  mapping row would be an exemption available to every fixture and most
  attractive to the one with the most to hide.
- **Never let a JSON-LD test reach the network.** `toJsonLd` writes
  `"@context": CONTEXT_URI`, a reference, so expanding its output means resolving
  that URL — and a parser left to itself FETCHES it. The deployed copy has
  drifted from `getContext()`: the same corpus scores 6 of 90 equivalent against
  the network and 56 of 90 against this build. A fetching test is therefore
  judging a website rather than the SDK, fails offline and in a sandboxed CI, and
  looks exactly as correct. `quadsFromJsonLd` in `tests/support/graph.ts` serves
  `getContext()` for that one URL and throws for any other.
