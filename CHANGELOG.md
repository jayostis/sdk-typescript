# Changelog

## [Unreleased]

### Changed

- **Identity keys and set members are ordered by Unicode code point** (#96).
  core v3.6 states it normatively on `cascade:cascadeUri`: "Sort ascending by
  Unicode code point. (Code point, not locale collation: a locale-dependent
  order would make identity depend on the machine.)" `contentHashedUri` sorted
  identity keys with `localeCompare` and `canonicalFieldValue` sorted the members
  of a set-valued field with a bare `.sort()`; the first is locale collation and
  the second is UTF-16 code-unit order, and neither is the rule. Both now call
  `compareCodePoints`, exported from the package barrel so a consumer assembling
  its own identity string sorts the way this SDK does. Conformance's
  `keyOrderVectors` and `multiValuedFieldVectors/condition-member-order-astral-vs-bmp`
  (test-vectors.json 1.3, conformance#21) are wired into the suite and were
  observed red on three of them before the change.

  **This re-mints identifiers, so it is breaking.** Which ones was measured
  rather than asserted: `scripts/dump-identity-uris.mjs` mints every
  deterministic URI this SDK can produce over the shared fixture corpus — each
  object's full field set, that set reversed, every single field and every
  unordered pair, since a two-key identity string turns on exactly one
  comparison — and diffing a run before against a run after gives **60,305
  URIs, 10 moved**. All ten are inside
  `conformance/fixtures/deterministic-ids/test-vectors.json` and all ten are the
  vectors written to move: the astral key pair, the astral member, and the
  two pairs a collator gets wrong (`_under` against `Alpha`, `é` against `z`).
  Across the other 162 fixture files, **59,613 URIs, zero differences** — no
  identifier over terminology codes, dates, names or URIs moves.
- **The Node floor is 20.** `engines.node` is `>=20.0.0`, from `>=18.0.0`,
  and CI runs 20.x and 22.x. Node 18 has no `globalThis.crypto` without
  `--experimental-global-webcrypto`, so once `node:crypto` left the identity
  module (#95, below) the only synchronous, browser-safe randomness left on
  that runtime was `Math.random` — a downgrade from the `randomUUID()` it had.
  Node 18 reached end of life in April 2025; rather than ship a weaker path
  for it, the package stops claiming it. Nothing else in the API changes.

### Added

- **The package loads and runs in a browser, and CI proves it** (#95,
  D-BROWSER-1). `serialize()` and `deserialize()` reached the vendored n3
  through `createRequire` and a CommonJS `require()`, which no bundler can
  follow and no browser can resolve, and `deterministic-uri.ts` imported
  `node:crypto`; a Vite or webpack build of any page importing this package
  failed on `node:module`. The vendored parser is now `src/vendor/n3/n3.js`,
  one ES module bundled from n3's own source by `scripts/vendor-n3.mjs` —
  relative imports resolved, `buffer` answered by a declared shim on a
  streaming path nothing here takes — and both call sites import it statically.
  `tests/vendor-drift.test.ts` now holds the committed bundle byte-for-byte to
  what the script builds from the installed n3, so "unmodified" means
  "reproducible" and esbuild is an exact devDependency. `deterministicUuid`
  hashes with `src/utils/sha1.ts`, a synchronous pure-JS SHA-1 pinned to
  `node:crypto`'s output in `tests/sha1.test.ts` (D-BROWSER-1 as amended
  2026-09-04: identity stays synchronous), and the random fallback for a
  record with no content field and no `fallbackId` uses `crypto.randomUUID()`
  — every browser since early 2022, Node since 19 — or assembles a v4 UUID
  from `crypto.getRandomValues()` where only that exists; a platform with
  neither gets an error naming what is missing. The gate:
  `scripts/check-browser-bundle.mjs` (`npm run check:browser`, a CI step)
  bundles `src/index.ts` for a browser and fails on any `node:` builtin,
  `createRequire` or `require()` left on the way, then compiles `src/` with
  Node's types withheld (`tsconfig.browser.json`, through
  `scripts/lib/node-globals.mjs`) and fails on a bare `process`, `Buffer`,
  `__dirname` or `global` on any path, which a bundler passes through in
  silence — red against the epic head
  on three sites, green after — and `tests/browser-bundle.test.ts` runs the
  bundle in a bare vm context with no `process`, `Buffer` or `require`
  through `serialize`, `deserialize`, `toJsonLd`, `fromJsonLd` and
  `validate` on imm-001. `npm run build` now removes `dist/` whole before
  anything writes there (`scripts/clean-dist.mjs`), so a renamed module, a
  dropped ontology or a stale vendored file cannot survive from the build
  before; and `npm run check:browser` generates `src/spec/` first, as `test`
  and `typecheck` do.
- **The build writes down what it found.** `npm run generate` has always found
  real spec defects — a name two record classes claim, a range that is neither
  a code list nor a structured class, a JSON key that means a different
  predicate under a different context — and printed them to stdout, where they
  scrolled past; the cross-context conflicts survived only as a count. Each
  generator now records its findings through `scripts/lib/diagnostics.mjs`
  (deleting its own file at start, writing it at the end, so a crash leaves
  nothing stale), `scripts/collect-diagnostics.mjs` merges the three into
  `src/spec/diagnostics.json` — refusing a missing file, a repeated id, an id
  that is not `code:subject`, an enum value outside its enum, or a row filed
  under the wrong generator — and `scripts/render-diagnostics.mjs` renders it
  through `scripts/templates/diagnostics.md` into `src/spec/diagnostics.md`,
  grouped by owner (`spec` / `sdk` / `reconcile`) before severity, every row
  with its code, its files to open and a link into the answer key,
  `docs/spec-diagnostics.md`, which explains each of the eleven codes and is
  kept in sync with the codes the helper can emit by test. Seven detectors are
  new — `normative-language-in-comment`, `term-no-type-info`,
  `property-no-range`, `declared-predicate-not-in-ontology`,
  `record-class-no-published-name`, `deprecated-class-unresolved-successor`,
  `range-has-unrecognized-typed-members` — all `scripts/lib/detectors.mjs`
  functions over the graph, so a fixture can be handed to them; the four
  existing findings go through the same channel, and `term-cross-context-conflict`
  is now one row per key with its predicates rather than a transition count.
  Not a gate: the build exits 0 with findings present, and `copy-spec-data.mjs`
  leaves `src/spec/diagnostics*` out of `dist/`. Measured at spec `e77ba5e`:
  92 findings. (#92)
- **The zero-runtime-dependency claim is enforced instead of assumed.**
  `README.md` advertises a zero-dependency Turtle deserializer and
  `package.json` has no `dependencies` key at all, and nothing checked either —
  the property was a habit. `thirdPartyImports` in `tests/no-runtime-deps.ts`
  walks `src/**/*.ts` and reports `file -> specifier` for every import that
  needs installing; a relative path is admitted whatever its extension, so the
  JSON data asset is not a special case, and `node:` is the only prefix answered
  by the runtime rather than by `node_modules`. **Parsed, not grepped** — a
  dozen JSDoc `@example` blocks under `src/` show a consumer importing from
  `@the-cascade-protocol/sdk`, and a check that reported those would be switched
  off on its first run. Newly worth having because `@zazuko/env`, `clownface`,
  `n3` and `rdf-validate-shacl` are now devDependencies and are exactly what
  someone reaches for while working on the serializer: an import of one from
  `src/` builds, typechecks and passes every other suite. `CONTRIBUTING.md`
  states the rule beside the `npm ci` note. (#23)
- **`sh:minLength` is enforced, on the term that owns the predicate.** It had
  been declarable on a validator's constraints table and read by nothing, so a
  required field was satisfied by `""` — a rule the shapes state and
  `validate()` did not apply. Measured before it was placed: 30 `sh:property`
  blocks across the four vendored shape files declare an `sh:minLength`, over 28
  distinct predicates, and **every one is 1**, including the two predicates that
  appear in more than one shape. Invariant per predicate, so it is a fact about
  a predicate and lives on the term beside `sh:maxCount`, not per record type.
  Six terms carry it: `allergen`, `conditionName`, `medicationName`,
  `providerName`, `testName`, `vaccineName`; `relationship` makes seven.
  **CHARACTERS, NOT CONTENT** — SHACL measures the value node converted to
  string, so `"  "` is length 2 and conforms, and the check does not trim. A
  whitespace-only name is a real defect and `sh:pattern` is the constraint that
  would state it; no shape declares one, and rejecting it here would refuse
  records `pyshacl` accepts. (#51)
- **Per-record-type validators.** `CascadeEntityValidator` is an abstract class
  whose `Constraints<T>` is driven by the model interface: every non-optional
  own field must be declared with a `minCount`, and omitting one is a **compile
  error naming the field**. `validate()` forks on `record.type` — a type with a
  validator is judged entirely by it, a type without one takes the previous path
  unchanged — so the hardcoded `validateTypeSpecific` switch can be retired one
  record type at a time. `MedicationRecord` is migrated. This is the structure
  that makes a rule impossible to declare in a model and forget in a validator,
  which is how `givenName` came to be required by a switch, declared by a model,
  and required by no shape at all. (#51)
- **Three terms for published caps nothing was reading.** `clinical:unit` has
  `sh:maxCount 1` on `clinical:VitalSignShape`, `clinical:LabResultShape` and —
  as `health:unit` — `health:DailyVitalReadingShape`; `health:resultUnit` has it
  on `health:LabResultRecordShape`; `clinical:relationship` has it, plus an
  `sh:minCount 1` and an `sh:minLength 1`, on `health:FamilyHistoryRecordShape`.
  None was claimed by a term, so a record carrying two of any of them — which is
  what the faithful reader returns for a document with two such triples —
  validated clean. (#51)


- **`ValidationResult.info`** — findings the vocabulary grades `sh:Info`, in
  their own array rather than folded into `warnings`. The array is how a caller
  reads a verdict: everything in `errors` says `'error'` and everything in
  `warnings` says `'warning'`, so a third grade inside the second would be
  reachable only by filtering an array named for something else. `valid` is
  unchanged and still means "no errors"; code reading the two existing arrays is
  unaffected, except that an Info-graded finding stops arriving in `errors`.
- **`Severity`** — `'error' | 'warning' | 'info'`, matching SHACL's three, and
  the type of both `ValidationError.severity` and `TermSpec.severityByType`.
  `sh:Info` appears 59 times across the vendored shapes.

### Fixed

- **A coverage record with no `providerName` is no longer accepted.**
  `coverage:InsurancePlanShape` declares `sh:minCount 1` on
  `coverage:providerName` and judges records typed `CoverageRecord` as well as
  `InsurancePlan`, because both serialize to `a coverage:InsurancePlan` (#26).
  Only the `InsurancePlan` spelling was transcribed, so `validate()` returned
  `valid: true` where `pyshacl` returns `conforms: false` with "Insurance
  provider name is required". `src/models/coverage.ts` had declared the field
  non-optional all along; the validator was the only one of the three that
  disagreed. (#51)
- **A family history record is judged on both of its required fields.**
  `health:FamilyHistoryRecordShape` requires `health:conditionName` **and**
  `clinical:relationship`, each `sh:minCount 1` at `sh:Violation`. Only the
  first was enforced. (#51)
- **Five `Maps to` comments in the models named the wrong predicate.**
  `daily-snapshot.ts` `date` (twice), `family-history.ts` `relationship`,
  `procedure.ts` `cptCode` and `procedureStatus`. Documentation only — the
  serializer was correct throughout — but a wrong one sends a reader querying a
  predicate that is never written. (#51)


- **An insurance plan is `coverage:InsurancePlan`, written in the coverage
  vocabulary.** `TYPE_MAPPING` resolved both `InsurancePlan` and
  `CoverageRecord` to `rdfType: 'clinical:CoverageRecord'`, so this SDK could not
  emit a `coverage:InsurancePlan` subject at all and had written the deprecated
  class for every coverage record in every release since v1.3.0.
  **Eleven defects, not one, and they had to move together.** The class was one.
  Eight were predicates — `providerName`, `memberId`, `groupNumber`,
  `planName`, `planType`, `coverageType` and `subscriberId` written
  `clinical:` where the corpus says `coverage:`, and `sourceRecordId` written
  `health:`. Two were datatypes: `effectiveStart` and `effectiveEnd` carried
  `xsd:dateTime` where `coverage.ttl` ranges `xsd:date`, so the time component
  was a midnight-UTC placeholder. Fixing only the class would have been worse
  than the bug: `coverage:InsurancePlanShape` declares `sh:minCount 1` at
  `sh:Violation` on `coverage:providerName`, `coverage:memberId` and
  `coverage:coverageType`, so retyping the subject while still writing
  `clinical:` makes the shape see these records for the first time and report
  three violations plus two datatype violations, on records whose data is
  correct. All four `coverage-` conformance fixtures now match their
  `expectedOutput` graph in full. (#26)
- **Coverage records stop validating vacuously.** `coverage:InsurancePlanShape`
  is `sh:targetClass coverage:InsurancePlan`, so a subject typed
  `clinical:CoverageRecord` matched no target and every constraint the shape
  holds was skipped in silence — the four-value `sh:in` on `coverage:status`
  included. A plan with `status: "banana"` conformed. The same subject also
  entailed a class the document never declared: coverage v1.5 gives
  `coverage:status` `rdfs:domain coverage:InsurancePlan`, and asserting a
  property asserts its domain. `coverage.shapes.ttl` is vendored into
  `tests/shapes/` so the verdict is checkable at all. (#26)
- **The eight `coverage:` spellings are read as well as written.** They join
  the deserializer’s reverse mappings against the same JSON keys the
  `clinical:` and `health:` spellings already resolve to, so a plan written by
  this release reads back in full and `coverage:status` stops being a one-way
  trip. Without them the writer would have looked innocent while the round trip
  lost the record’s data at the other end. (#26)
- **`clinical:payorName` does NOT move, and that is load-bearing.** Coverage
  has no payor property distinct from `coverage:providerName`, which is
  `sh:maxCount 1`, so it is a legitimate clinical predicate on a plan.
  `coverage-001` expects it under `clinical:` on a `coverage:InsurancePlan`
  subject; a blanket “`clinical:` → `coverage:` on a plan” rewrite passes
  `coverage-002` and `-003` and breaks it. The eight that DO move are named
  individually in `TYPE_PREDICATE_OVERRIDES.InsurancePlan` for the same reason
  `sourceRecordId` could not be remapped globally: 35 fixtures across other
  record types carry it and keep `health:sourceRecordId`. (#26)
- **A patient profile's emergency contact, address and preferred pharmacy are
  written.** They never were. The three keys had a blank-node rule
  (`BLANK_NODE_TYPES` named them) and no entry in `PROPERTY_PREDICATES`, so
  `getPredicateForField` returned `undefined` and `emitField` exited at
  `if (!pred) return;` before any rule was consulted. Eighteen predicates and
  three nested nodes were absent from every profile this SDK has ever
  serialized — no error, no warning, no partial output. Everything else in
  `profile-002` serialized correctly, which is what kept it quiet. (#27)
- **They are read back as nested objects.** `emergencyContact`, `address` and
  `preferredPharmacy` join `NESTED_BLANK_NODE_FIELDS`, and their twelve child
  predicates join the deserializer's reverse mappings. Both halves in one
  change: three fields without the child spellings would have rebuilt each
  structure as `{}`, every child dropped in silence.
- **The JSON-LD path no longer empties the three structures.** `getContext()`
  is built from `PROPERTY_PREDICATES`, which deliberately holds no entry for a
  blank node's children, so the generated context defined `emergencyContact` /
  `address` / `preferredPharmacy` and none of their twelve children. Before
  this change `toJsonLd` hit `if (!pred) continue` and omitted the three
  fields; with them registered it emitted
  `"emergencyContact": { "contactName": "Maria Rivera", ... }` — a document
  that expands to `cascade:emergencyContact` pointing at a node with zero
  triples. The TTL path carried the data and the JSON-LD path lost it in
  silence. The twelve children are now defined in the context as top-level
  terms, matching `spec/contexts/v1/cascade.jsonld` exactly. (#27)
- **A scalar where a blank node is declared is an error rather than a silent
  drop.** `outputsForMember`'s `blankNode` case returned `[]` for anything
  that was not a nested object, so
  `serialize({ type: 'PatientProfile', address: '742 Evergreen Terrace' })`
  returned a document with no address triple — no error, no partial output. The
  flat form is a shape spec describes (`cascade:addressText`,
  `cascade:pharmacyAddress`) and TypeScript does not stop a JS caller reaching
  for it. It now throws, naming the field and the predicate. Thrown per member,
  so a mixed array fails rather than serializing its object members and
  discarding its scalar ones.
- **A declared blank-node child no longer stringifies an object into the
  graph.** `nestedOutputs` returns `[]` for a child object rather than stamping
  `[object Object]` into a literal, and a child with a DECLARED rule never
  reached it: `{ form: 'literal' }` did `String(member)`, so
  `address: { addressLine: { street: 'x' } }` wrote
  `cascade:addressLine "[object Object]"` — a literal that reads as data, is
  not, and that no shape can tell from a real one. An object under a scalar rule
  now throws, naming the field and the predicate: it is the mirror of the
  scalar-under-a-node case above and gets the same answer, per member, so a
  mixed array fails rather than half-writing.
- **The reader rebuilds every inline blank node, not the first.**
  `triplesToRecord` took `predTriples[0]`, so a document carrying two
  `cascade:emergencyContact` nodes came back with one. That field is the one
  `cascade:PatientProfileShape` declares UNCAPPED — a patient may name more than
  one person to call — and the writer already wrote both, so a pod this SDK
  produced could not be read back whole. What is lost that way cannot be caught
  downstream either: `validate()` judges what reached the record, so a truncated
  read returns `valid: true` on incomplete data. The arity stays the graph's —
  one node is still a bare object, N are an N-element array — and a capped field
  is not special-cased: two `cascade:address` nodes now come back as two and are
  REPORTED rather than quietly halved.
- **`clinicalSummary` writes all thirteen counts `RecordSummary` declares, not
  eight.** Declaring `children` made the term authoritative over the node, and
  the guard that drops an UNDECLARED key dropped a MISSING one just as quietly:
  `supplementCount`, `heartRateDays`, `bloodPressureDays`, `activityDays` and
  `sleepDays` are on the `RecordSummary` model, in `PROPERTY_PREDICATES`, in
  `INTEGER_FIELDS` and on `cascade:RecordSummaryShape`, and were dropped with no
  error. A manifest read in with `sleepDays` and re-serialized lost it.
- **The flat IRI form of `clinicalSummary` works again.**
  `ExportManifest.clinicalSummary` is typed `string` and documented "IRI of the
  `RecordSummary`", and `URI_FIELDS` has written
  `cascade:clinicalSummary <urn:uuid:...>` since core v3.4. The blank-node rule
  turned that type-correct call into a throw, while `wellnessSummary` beside it —
  typed identically — went on accepting it. A rule may now declare a
  `scalarRule` for the flat form of an object property; a field that has only
  the nested form keeps the throw.
- **`cascade:addressType` is written.** `cascade:AddressShape` declares it
  beside the six, with `sh:in ( "postal" "physical" "both" )`, and
  `spec/contexts/v1/cascade.jsonld` has always defined it. Undeclared as a child
  it was DROPPED rather than written, since a declared `children` writes nothing
  else. Added to the term, to the `Address` model, and — by derivation from the
  term — to the generated JSON-LD context and the deserializer's reverse map.
- **A nested child a term does not declare is written, and reported.**
  `childrenOf` filtered on the `children` map, so an undeclared key was dropped
  by the writer: the caller's value vanished with no error and the record
  reached `validate()` with nothing left to violate. It stopped the triple and
  not the defect. Every present key is now written — a declared child by its
  rule's form, an undeclared one by runtime type — and `validate()` reports it
  as `clinicalSummary.supplementTally`, naming the child and the predicate it
  went out under. Nothing in `tests/shapes/` is `sh:closed`, so SHACL returns
  `conforms: true` on such a graph and `validate()` is the only judge that can
  see it; `spec` issue jayostis/spec#2 asks for the shape to close. (#37)
- **`RecordSummary.dataProvenance` is written.** `cascade:RecordSummaryShape`
  declares it (`core.shapes.ttl:1085`) and `RecordSummary` reaches it through
  `CascadeEntity`, so a caller building a summary off the model had it dropped.
  Declared as `prefixedEnum` so a nested summary writes `cascade:EHRVerified`
  like the top-level writer, rather than the plain literal the pre-term nested
  path wrote.
- **`cascade:AddressShape`'s five simplified aliases are declared.** `city`,
  `state`, `country`, `postalCode` and `streetAddress`, which the shape accepts
  in as many words — *"Accepts both simplified aliases (city, state) and
  FHIR-aligned properties (addressCity, addressState)"*. With the term read as
  the legal set, an address carrying `city` would otherwise have been rejected:
  the SDK refusing what spec permits.
- **The reader returns a nested child no term declares.** `triplesToNestedObject`
  skipped every predicate missing from the reverse map, so this SDK could write
  a document it could not read back, and a read-modify-write deleted the key
  from somebody else's pod with nothing raised. The key is the local name where
  the writer would put that exact predicate back, and the full IRI otherwise —
  written in angle brackets, because `cascade:odd(name)` does not parse and
  abbreviating a foreign namespace into `cascade:` would write a different
  predicate. This reverses #27's decision to drop `cascade:contactEmail` on
  read: that reasoning turned on nothing reporting it, and `validate()` now
  does. The same drop at TOP level is untouched and filed as #38.
- **A term's rules are reported at the severity its shape declares.**
  `clinical:VitalSignShape` binds `interpretation`'s 74 codes at
  `sh:severity sh:Warning` where the two lab shapes leave them at SHACL's
  `sh:Violation` default — deliberately, because emitted vital data carries
  `"elevated"` and core v3.5's ratchet reports such a value rather than
  rejecting it. `validate()` emitted `error` for all three, and `valid` counts
  errors alone, so a vital sign spec accepts-with-a-warning came back
  `valid: false`. (#37)
- **A nested child keeps the namespace it was read in.** `health:notes` inside a
  `cascade:emergencyContact` node came back as `notes` and went out as
  `cascade:notes` — a different property, under a vocabulary that never declared
  it, with `@prefix health:` dropped from the header. `recoverableChildKey` was
  written to prevent exactly that and ran only on the branch that did not need
  it: `REVERSE_PREDICATE_MAP` was consulted first, so any predicate it
  recognised skipped the check. A short key is now usable only if the writer,
  asked what it would emit for that key on this node, returns the predicate that
  was read. (#37)
- **`sh:Info` is no longer reported as an error.** `cascade:address` and
  `cascade:preferredPharmacy` are `sh:maxCount 1` at `sh:severity sh:Info`
  (`core.shapes.ttl:136`, `:146`) — *"A postal address is helpful for care
  coordination"* — and `validate()` rejected a profile carrying two. Both terms
  now declare the grade their shape gives them.
- **Three terms carry the `sh:maxCount 1` their shape declares.**
  `cascade:dateOfBirth` and `cascade:biologicalSex` each declare it in the same
  `sh:property` block as the `sh:minCount 1` that got them termed
  (`core.shapes.ttl:42-43`, `:54`), and `health:interpretation` declares it on
  all three shapes that bind its 74 codes (`health.shapes.ttl:956`,
  `clinical.shapes.ttl:1087`, `:1561`). Only the minCount and the value set had
  been carried, so `validate()` reported a profile with NO date of birth and
  accepted one with two: `hasField` sees the field present, and with no cap
  nothing counted. The value set does not cover this and cannot —
  `biologicalSex: ['male', 'female']` and `interpretation: ['H', 'L']` are
  admitted members throughout, so every member passes the list and the record's
  only defect is how many there are. That is the vacuous pass this branch exists
  to close, and it was still open on three fields the branch had just termed.
  The writer is unchanged and still writes every value. (#37)
- **A blank node reachable only through `ruleByType` is readable.**
  `childPredicatesOf` and `blankNodeTermKeys` read `spec.rule` alone while
  `defineTerm` validates children across both, so such a node would have been
  written correctly and come back as the bare identifier `"_:b0"` with every
  child lost. Latent — no term declares a `ruleByType` — and closed before the
  first one does.

### Changed

- **`validate()` accepts records it previously rejected**, which is the only
  loosening in this release and the one thing a consumer may notice. A
  `LabResultRecord` with no `resultValue` or no `resultUnit`, and a `VitalSign`
  with no `unit`, are now valid. **No shape ever required them**: `pyshacl`
  returns zero results of any kind on those graphs, and the conformance corpus
  marks `absent-001`, `lab-011` and `lab-012` `shouldAccept: true` while this
  SDK refused all three. The requirement came from a hardcoded `switch` case and
  had no source in the vocabulary. Callers depending on `validate()` to catch a
  missing lab unit should not — it was never a Cascade rule. The `sh:maxCount 1`
  that sat in the same property block is still enforced, now off a term. (#3)



- **`Coverage['type']` narrows from `'CoverageRecord' | 'InsurancePlan'` to
  `'InsurancePlan'`, and `clinical:CoverageRecord` is now READ AND NEVER
  WRITTEN.** The class has been deprecated in favour of
  `coverage:InsurancePlan` since clinical v1.5 (`clinical.ttl:187`) and was
  retained for backward compatibility with existing EHR import data — for
  READING it. It joins `DEPRECATED_TYPE_ALIASES` beside the four classes
  clinical v1.13 deprecated, so `deserialize()` accepts a pod typed either way
  and nothing in `TYPE_MAPPING` can produce the old spelling. The pods that
  need the read side are the ones this SDK wrote, which is why refusing them
  was never an option. `'CoverageRecord'` also stays in `TYPE_TO_MAPPING_KEY`
  so a caller still holding the old JSON spelling can name it to
  `deserialize()`; it resolves to `coverage:InsurancePlan` like the other.
  **A caller who typed a record `'CoverageRecord'` gets a type error and a
  differently-classed document; that is the fix, not a side effect.** (#26)
- `PatientProfile.emergencyContact` widens from `EmergencyContact` to
  `MultiValue<EmergencyContact>`. **The type now describes what the SDK
  produces.** `cascade:PatientProfileShape` declares no `sh:maxCount` for this
  field where `address` and `preferredPharmacy` beside it are both capped at
  one, the writer has always written one node per member of an array, and the
  reader now returns every one. A profile carrying a single contact still reads
  back as a bare object, so nothing that handles one contact changes shape.

### Removed

- `contactPhone: 'vcard:hasTelephone'` and `contactEmail: 'vcard:hasEmail'` from
  `PROPERTY_PREDICATES`. **Not a behaviour change: neither row has ever been
  reachable.** Both are nested-only keys, and a blank node's children are built
  from the node's prefix and the JSON key rather than looked up in that table —
  no fixture, no serializer path and no record type has ever written either. A
  contact's phone is `cascade:contactPhone`, which is what `profile-002` expects
  and what `src/models/patient-profile.ts` documents. `cascade:contactEmail` is
  not resolved on read either: no ontology in `spec/` declares it — core.ttl
  gives `cascade:EmergencyContact` three properties and an email is not among
  them — and because `childrenOf` writes every key of a rebuilt object back
  out, reading one would make this SDK a WRITER of a predicate with no domain,
  no range and no shape. The `vcard` namespace declaration stays.
- The three now-dead `BLANK_NODE_TYPES` entries. `emitField` returns before that
  table for a field a term module owns, so the `rdf:type` of each node is stated
  once, in `src/terms/`.

### Internal

- **`spec` is read where it is checked out, and every copy is deleted.** Four
  shapes files lived in `tests/shapes/`, kept in step with upstream by
  `scripts/sync-shapes-from-spec.sh` and a 239-line `scripts/check-shapes-drift.mjs`.
  A copy that falls behind asserts last month's constraints while reporting
  green, and the drift check existed only because the copies did; both are gone,
  along with `vendored.json` and the `check:shapes-drift` npm script. Nothing in
  this repository is a `.ttl` file any more. `spec-sources.json` is the one place
  a spec path is written down and `tests/support/spec-sources.ts` its only
  reader, resolving an explicit path, then `CASCADE_SPEC_DIR`, then the `../spec`
  sibling — the order both upstream repositories document, and the order CI uses
  after cloning the revision `conformance/scripts/SPEC_PIN` pins. **REFUSES,
  NEVER SKIPS**: a suite that cannot find the shapes validates against an empty
  graph, and an empty graph conforms to everything, so every failure throws
  naming the path it tried and both ways to change it. `parseManifest` checks the
  manifest rather than casting it, so an entry with no `ontology` names the
  vocabulary and the key instead of throwing `ERR_INVALID_ARG_TYPE` out of
  `node:path`. (#58)
- **Three detectors stop the scheme coming back**, in `tests/spec-single-source.ts`:
  `turtleFiles` reports a Turtle file anywhere in the tree, `specPathLiterals`
  parses TypeScript and JavaScript for a string literal naming a spec path — a
  whole-literal `ontologies` included, so a path assembled a segment at a time is
  caught — and `vendoringNames` walks every file, matching paths as well as
  lines, so a re-added `.sh`, `.mjs` or npm script is a finding. Parsed rather
  than grepped for the path check: the ~20 `@see spec/ontologies/…` citations
  under `src/terms/definitions/` are the traceability this repository wants, and
  a text pattern would report every one. `CHANGELOG.md` and `VOCAB_VERSIONS` are
  spared at the call site as append-only records of what was true at a past
  release. (#58)
- **Contributors need a `spec` checkout now.** `CONTRIBUTING.md`, `AGENTS.md` and
  `README.md` said to clone `conformance` as a sibling and stopped there;
  following any of them verbatim left `npm test` throwing `no spec checkout at
  <path>`. All three now name `spec` as a required sibling and `CASCADE_SPEC_DIR`
  as the alternative. Nothing a consumer installs changes: `rdf-validate-shacl`
  is still a devDependency and no shapes file was ever in `package.json`'s
  `files`. (#58)
- **All six shapes files `spec` publishes are declared, not four.** `checkup` and `pots`
  were never vendored, so a record carrying their predicates was refused a verdict rather than
  judged. No fixture uses either today, so nothing changes verdict — what changes is that the
  gap is closed and cannot silently reopen: `undeclaredShapes` walks the checkout and fails the
  suite when `spec-sources.json` does not account for a shapes file spec publishes. Discovery
  finds; the manifest still decides, so taking a new vocabulary on stays a deliberate commit
  here rather than arriving with someone else's re-pin. (#31)
- **An empty `CASCADE_SPEC_DIR` no longer resolves to the cwd.** `??` falls back
  only on `null`/`undefined`, so an exported-but-empty `CASCADE_SPEC_DIR=` — what
  any shell or CI that passes an unset input straight through produces — survived
  to `resolve('')`, which is the cwd. The cwd is a directory, so the `../spec`
  sibling was never consulted and the refusal named this repository, a path
  nobody set, with a good checkout sitting beside it. `||` for all three names in
  the order: an empty string is not a choice of directory. (#58)
- **`release.yml` gets the pinned-spec clone too.** It checks out `conformance`
  as a sibling and runs `npm test` as the gate before `npm publish`, but never
  set `CASCADE_SPEC_DIR`, so after the change above every SHACL-importing suite
  threw at collection: pushing any `v*` tag went red and nothing could be
  published. `tests/workflows.test.ts` now asserts that every workflow running
  the suite supplies spec, by `CASCADE_SPEC_DIR` or by a sibling checkout — the
  parity was previously kept by hand across two files, which is how one of them
  missed it. (#58)
- `emergencyContact`, `address` and `preferredPharmacy` are declared as term
  modules — the first use of `{ form: 'blankNode' }`, and the first terms whose
  outputs nest. None declares a `nestedPrefix`: `childrenOf` defaults to
  `cascade` and this fixture family's child keys are already disambiguated in
  the JSON.
- `TermSpec.severityByType` — recordType to `'error'` / `'warning'`, defaulting
  to `'error'`. Per record type like `predicateByType` beside it, and NOT per
  rule: `sh:severity` belongs to the property shape, so one block's
  `sh:datatype`, `sh:maxCount` and `sh:in` all report at that block's severity
  (measured — a vital sign breaking all three returns three Warnings), and this
  governs every rule the term declares for the type.
- `validate()` partitions findings by `severity` rather than by which function
  produced them. Those four sources were positional — whatever `validateWarnings`
  returned was a warning — which a term reading severity off its shape breaks,
  since one walk now raises both. No existing finding changes bucket.
- `tests/terms/children-complete.test.ts` asserts that every `sh:path` on a
  termed blank node's shape is declared as a child of that term, resolving the
  shape from the term's own `rdfType` via `sh:targetClass`. With the children
  map read as the legal set, a term falling behind its shape stopped being a
  silent drop and became a false rejection; this is what catches it. Three such
  gaps were found by hand before it existed.

## [3.1.0] - 2026-08-28

Vocabulary sync: core 3.6 to 3.7, health 2.7 to 2.8, clinical 1.15 to 1.16,
coverage 1.4 to 1.5. 24 new terms.

**Minor, not major: purely additive.** No published type narrows, no record type
changes what it serializes to, and every graph this SDK wrote before still reads
back identically.

Every term here comes from a field-coverage measurement against real FHIR R4
exports: each one is an element a conformant server sends that the vocabulary
had nowhere to put, so an importer dropped it.

### Added

Clinical v1.16 — encounters:
- `encounterClassDisplay` and `encounterClassSystem`, the other two parts of the
  `Encounter.class` Coding. The code stays in `encounterClass` for round-trip;
  because the binding is only extensible, a local code such as `"5"` is
  unreadable without its display and unmappable without its system.
  `encounterClassSystem` is written as a plain string literal — the ontology
  ranges it `xsd:anyURI`, and the shape accepts `anyURI` OR `string` via `sh:or`
  precisely because serializers differ on which they write.
- `encounterReason` (0..*), `admitSource` and `dischargeDisposition`. None
  carries a value set: FHIR binds `reasonCode` and `admitSource` only PREFERRED
  and `dischargeDisposition` only EXAMPLE. The presence of `admitSource` is the
  structured signal separating an admission from an office visit, which was
  unrecoverable from a pod through v1.15.
- `EncounterParticipant` and `hasParticipant` (0..*), with `participantName`,
  `participantRole`, `participantRoleCode` (0..*) and `participantSpecialty`.
  Each participation serializes as an INLINE BLANK NODE, following the core
  v3.4 `clinicalSummary` / `wellnessSummary` precedent;
  `clinical:EncounterParticipantShape` omits `sh:nodeKind sh:IRI` so a
  serializer may write one for a structural sub-node. A visit routinely carries
  several participants in the same role, which the rejected flat
  role-qualified-predicate design could not represent at all.

Clinical v1.16 — identity and documents:
- `businessIdentifier` (0..*), typed on `CascadeEntity` because the ontology
  deliberately declares no `rdfs:domain`. Values are the FHIR token form
  `"{system}|{value}"` where the source states a system; this SDK round-trips
  the string verbatim and never splits, parses or invents one. Distinct from
  `sourceRecordId`, which holds the server-assigned logical id: the two id
  spaces do not join.
- `documentReferenceStatus`, `documentAuthorName` (0..*) and
  `authenticatorName`, registered as PREDICATES ONLY — their domain is
  `clinical:ClinicalDocument`, a class this SDK does not model, the same
  position the core v3.4 device-source terms are in. `DocumentReferenceStatus`
  is exported as a type.

Core v3.7 — pod attachments:
- `Attachment` model and the seven properties `hasAttachment` (0..*),
  `attachmentPath`, `attachmentMediaType`, `contentHash`, `hashAlgorithm`,
  `byteSize` and `attachmentTitle`.
- **An attachment is a subject with its own IRI, not a sub-node.**
  `cascade:HasAttachmentEdgeShape` declares `sh:nodeKind sh:IRI` so a record and
  its attachment can live in different files, so `hasAttachment` is an IRI edge.
  This is the one point on which core v3.7 and clinical v1.16 rule oppositely.
- This SDK models the metadata node only: it neither reads, writes, hashes nor
  verifies attachment bytes.

Coverage v1.5:
- `coverage:status` and the `CoverageStatus` type, closed to the four
  `fm-status` codes because the FHIR binding is REQUIRED and the shape
  constrains the value at `sh:Violation`. Written via a record-type override
  because the `status` key already resolves to `health:status`, and declared for
  `InsurancePlan` only — `coverage:status` has `rdfs:domain
  coverage:InsurancePlan`.

Health v2.8:
- SHACL only; no term for this SDK to model. The row moves because the version
  moved.

Core v3.8:
- `PatientReported` added to `ProvenanceType` and to the validator's
  `VALID_PROVENANCE_TYPES`. The second is the one that mattered: a value absent
  from that set is rejected at runtime, so bumping the row alone would have left
  this SDK failing a conformant record. No term modelled in this release
  changes.
- `PatientReported` is distinct from the existing `SelfReported` on the axis of
  who keyed the data in, not who it came from: `SelfReported` is the patient
  entering data directly, `PatientReported` is their own account recorded by
  another party or system (history related to a clinician, imported
  questionnaire responses). It is a direct subclass of `cascade:DataProvenance`
  under neither `ClinicalGenerated` nor `ConsumerGenerated`, since a patient's
  report reaches records through either setting.

### Fixed

- Blank-node labels are minted from a monotonic counter instead of
  `Date.now()` plus four random base-36 characters. The old scheme collides for
  two nodes created in the same millisecond, which was survivable when the only
  inline blank nodes were one summary per manifest, and is not now that an
  encounter carries several participations at once: a collision merged two
  participations, attributing one clinician's role to another's name.

### Known gaps

- `TYPE_MAPPING` resolves both `InsurancePlan` and `CoverageRecord` to
  `clinical:CoverageRecord`, so this SDK still cannot emit a
  `coverage:InsurancePlan` subject and coverage's own shapes never see these
  records. `coverage:status` is therefore a one-way trip: the class is lost on
  read, so re-serializing what came back writes `health:status`. Pinned by test
  rather than fixed, because retargeting the class is a migration.
- No conformance fixture exercises any of these 24 terms, so cross-implementation
  agreement with `sdk-python` and `cascade-cli` is unverified.

## [3.0.0] - 2026-08-15

Vocabulary sync: core 3.5 to 3.6, health 2.6 to 2.7, clinical 1.14 to 1.15.

**Major because one published type narrows and one record type changes what it
serializes to.** `VitalSign.interpretation` no longer accepts an arbitrary
string, and procedure records move to a different RDF class and name predicate.

### Changed (BREAKING)

- `VitalSign.interpretation` is now `VitalInterpretation`, not
  `VitalInterpretation | string`. The union was justified by
  `clinical:VitalSignShape` carrying no `sh:in`, which clinical v1.15 changes,
  and in the meantime TypeScript collapsed `VitalInterpretation | string` to
  `string`, so the type documented nothing and accepted anything. A source code
  in neither ratified value set goes verbatim on the new
  `interpretationSourceCode` with the nearest ratified reading on
  `interpretation`; that pairing is what makes narrowing lossless.
- Procedure records serialize as `clinical:Procedure` with
  `clinical:procedureName`, not `health:ProcedureRecord` with
  `health:procedureName`. No vocabulary has ever defined either health: spelling
  and no shape targeted them, so procedure records this SDK wrote ran against
  zero constraints. A consumer querying the old spellings must be updated.

### Added

Core v3.6:
- `cascade:dataAbsentReason`, registered and in the generated JSON-LD context.
  Why a record's primary VALUE is absent, with semantics that are exactly FHIR
  R4 `Observation.dataAbsentReason`. It was previously dropped on the floor by
  the serializer.
- `cascade:sourceSystem`, registered and in the generated context. It has been
  in the published context since core v3.0 and was never registered here, so
  the INGESTION axis could not round-trip while ORIGIN could.

Health v2.7 and clinical v1.15:
- `interpretationSourceCode`, registered in both spellings and typed on
  `VitalSign`. A lab writes the `health:` spelling and a vital the `clinical:`
  one, so the verbatim code always sits beside the interpretation it explains.
- `LAB_INTERPRETATION_VALUES` goes from 60 to 74 values, adding the 14
  data-absent-reason codes it lacked. `LAB_INTERPRETATION_CHECKSUM` re-pinned to
  `1ae24bf8ceccfa2a71d870bae21dc91cc7f906d736496ec23ca78b4181ba05b0`, shown
  failing against the previous digest before re-pinning.
- `healthProcedureName` registered, so a name carried only on the deprecated
  spelling survives serialization. It was silently dropped before, and a
  procedure record could serialize with no name at all.
- `tsconfig.typecheck.json` and an `npm run typecheck` script, wired into CI.
  `tsconfig.json` excludes test files and vitest does not typecheck, so a
  type-level assertion in a test was previously invisible to both `npm test` and
  `npm run build`. Widening `VitalSign.interpretation` back leaves all 604 tests
  passing and is caught only by this step, which is precisely why it exists.

### Cross-SDK note

The two SDKs disagreed about vital interpretation in opposite directions: this
one accepted any string, the Python SDK rejected anything outside the set. The
ratified shapes settle it as a severity split, and both SDKs implement that same
split in this round. `clinical:VitalSignShape` binds the value set at
`sh:Warning`, so an out-of-set value on a vital is REPORTED and the record stays
valid; the lab shapes bind it at `sh:Violation`. This SDK does not validate, so
it carries the stance in its types: the 74-value set is what a producer should
write, and `interpretationSourceCode` is where anything else goes.

## [2.0.0] - 2026-08-10

Vocabulary sync: core 3.4 → 3.5, health 2.5 → 2.6, clinical 1.13 → 1.14,
coverage 1.3 → 1.4, checkup 3.2 → 3.3.

**This is a major release because two published types change shape.** Neither
change can be made compatibly: `LabInterpretation` loses a member it should
never have had, and four code properties become 0..*. Reader code that assigns
either to a plain `string` no longer typechecks. Nothing changes at runtime for
data already written (every record that serialized before serializes
byte-identically now), so the migration is a type-level one. See "Migrating"
below.

### Changed (breaking)

- **`LabInterpretation` is now the ratified value set, derived from a runtime
  array.** `LAB_INTERPRETATION_VALUES` carries the 49 selectable codes of HL7 v3
  ObservationInterpretation 3.0.0 (`http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation`,
  the code system FHIR R4 binds `Observation.interpretation` to) in the code
  system's own order, plus the data-absent-reason code `"unknown"` and the ten
  retained legacy words: 60 values. The type is `typeof LAB_INTERPRETATION_VALUES[number]`,
  so the type and the runtime list cannot drift apart. The previous five-member
  union could not express a susceptibility (`S`/`I`/`R`), detection
  (`POS`/`NEG`/`DET`/`ND`/`IND`), reactivity (`RR`/`WR`/`NR`) or change
  (`B`/`D`/`U`/`W`) result, all of which are conformant FHIR that laboratories
  report routinely.
  - **`'elevated'` is gone.** It was a member of this union through 1.6.1 and was
    never accepted by any version of the SHACL shapes, so any record written with
    it has been failing validation all along. `'high'`, accepted by every version
    of the shapes, was missing from the union and is now present.
  - The list is pinned by a SHA-256 (`LAB_INTERPRETATION_CHECKSUM`) that
    `tests/interpretation-codes.test.ts` recomputes from the array and compares
    against a literal. A test that read the shape file was rejected deliberately:
    this package's CI checks out no `spec` sibling, so such a test would either
    fail on every clean machine or skip itself, and a test that skips when it
    cannot find its input reports green while proving nothing.
- **`labCategory`, `testCode`, `icd10Code` and `snomedCode` are 0..\*.** FHIR R4
  `Observation.category` is 0..* and `CodeableConcept.coding` is 0..*, and
  dual-coded problem-list entries and multi-coding lab observations are ordinary
  EHR output; a record that preserved every coding its source sent was being
  rejected for preserving it. The fields are typed `MultiValue<string>`, a new
  exported alias for `T | T[]`.
  - **Arity is preserved on both sides.** One value in produces one triple and
    reads back as a bare string; N values in produce N repeated-predicate triples
    and read back as an N-element array. This keeps every existing single-coded
    record round-tripping to exactly what it round-tripped to before, and it
    avoids reporting structure the graph does not carry. RDF has no "list of one"
    for a repeated predicate. `asArray()` is exported for callers that want one
    shape to iterate over.
  - Applied uniformly by field name, so `Condition`, `LabResult`, `VitalSign`,
    `Procedure`, `Encounter` and `MedicationAdministration` all move together.
    The serializer resolves the namespace per record type (a `VitalSign` writes
    `clinical:snomedCode`, a `Condition` writes `health:snomedCode`) but decides
    cardinality before it has any type context, and no shape still caps any of
    the four at one.
  - Emitted as repeated predicates, never an `rdf:List`: the vocabulary declares
    no order over codings and the shapes count triples.
- **`VitalInterpretation` is an alias of `LabInterpretation`**, and
  `VitalSign.interpretation` is typed `VitalInterpretation | string`.
  `clinical:VitalSignShape` puts no `sh:in` on the property, so the union
  documents the ratified codes without rejecting a value the validator accepts,
  the same idiom this SDK already uses for `vitalType`, `planType` and
  `coverageType`. Existing `VitalSign` code, including `'elevated'`, still
  compiles.
- **`SubscriberRelationship` is the full HL7 SubscriberPolicyholder code set**
  (`child`, `parent`, `spouse`, `common`, `other`, `self`, `injured`), which is
  what FHIR R4 binds `Coverage.relationship` to. Coverage v1.4 added `common` and
  `injured`; `parent` had been missing here since the type was introduced. A
  widening: the fields that use it are already `| string`.

### Added

- **`cascade:sourceIdentity` (core v3.5), the ORIGIN axis.** A canonical,
  transport-independent identity for the organization a record came from, so a
  FHIR export and a C-CDA document of the same health system agree. Registered as
  a predicate, carried in the generated JSON-LD context as a plain term, and
  typed on `CascadeEntity` because its `rdfs:domain` is `owl:Thing`. Values are
  scheme-prefixed `org:{slug}` / `ns:{namespace}` / `transport:{label}`. The
  accessor is a plain optional string: this SDK stores and round-trips the value
  and deliberately does not validate or derive the scheme, because minting a slug
  requires the source document that only an importer has, and rejecting an
  unrecognized value here would discard origin information a producer was
  entitled to write.
- `MultiValue<T>` and `asArray()` exports.
- `LAB_INTERPRETATION_VALUES`, `LAB_INTERPRETATION_CHECKSUM` and
  `OBSERVATION_INTERPRETATION_CODE_COUNT` exports.

### Fixed

- An empty code array now counts as no coding rather than as a coding, so
  `testCode: []` no longer suppresses the missing-coding warning on a record that
  carries no code.
- The Turtle serializer declares a namespace prefix for every member of a
  multi-valued code property, not only the first, so two codings from two code
  systems are both declared.

### Migrating from 1.6.x

- Replace `'elevated'` with a code the shapes accept. For a lab result that is
  `'H'` (or `'HH'` for a critically high value); the retained word `'high'` is
  also accepted but is not recommended for new writes.
- Reading one of the four code properties now yields `string | string[]`. Wrap
  the read in `asArray()`, for example `for (const code of asArray(condition.icd10Code))`,
  or narrow with `Array.isArray`. Writing is unchanged: a bare string still
  compiles and still produces one triple.
- Nothing needs to be rewritten on disk. Existing Turtle parses to the same
  values it parsed to before.

## [1.6.1] - 2026-08-04

No functional change. This release exists to exercise the tag-driven publishing
workflow end to end, since 1.6.0 was published manually before that workflow
existed and a tag for it would be rejected as a duplicate.

The published artifact is byte-equivalent in behaviour to 1.6.0; the only
difference is how it got to npm. From this release on, publishing is triggered
by pushing a `v*` tag and authenticated with OIDC, so no long-lived npm token
exists for this package and every release carries a provenance attestation.

## [1.6.0] - 2026-08-04

Vocabulary sync: core 3.3 → 3.4, health 2.4 → 2.5, clinical 1.9 → 1.13.

### Added
- **Pod export manifest (core v3.4).** `ExportManifest`, `RecordSummary` and `InteractionScenario` models, type mappings, and all 26 uncontested `cascade:` properties. `ExportManifest` is modelled on `dcat:Dataset` (its descriptive fields are Dublin Core terms, not Cascade inventions) and `RecordSummary` on `void:Dataset`, whose per-domain counts are `void:entities` subproperties in the ontology; `dcat` and `void` are now registered namespaces. An inline `cascade:RecordSummary` blank node is reconstructed on read rather than reported as a blank-node identifier.
- **Single-day wellness snapshots (health v2.5).** `DailyActivitySnapshot` and `DailySleepSnapshot` models with `activeEnergyKcal`, `exerciseMinutes`, `standHours` and `durationHours`. These are distinct from the 7-day aggregate `ActivitySnapshot` / `SleepSnapshot`; both forms are emitted and neither replaces the other.
- **Sleep quality individuals (health v2.5).** `SleepQuality` type and `SLEEP_QUALITY_VALUES`. `health:sleepQuality` is written and parsed as an IRI (`health:Good`), which is what emitters produce and what the shape's `sh:in` ranges over.
- **Wellness container classes (health v2.5).** `WELLNESS_CONTAINER_SUBCLASSES` and `isHealthProfileType()`, encoding the six containers' `rdfs:subClassOf health:HealthProfile` declarations. Use the helper rather than an equality check: a subject typed `health:SleepData` is a health profile.
- **Traversable graph edges (clinical v1.10–v1.12).** `hasEncounter`, `indicationReference`, `parsedIndicationReference` and `linkedCondition`, all IRI-valued. `indicationReference` is available on `Procedure` and `MedicationAdministration` as well as `Medication`, matching the domain widened in v1.11. `parsedIndicationReference` stays a separate field so a derived match can be presented differently from a stated one.
- `CascadeEntity`, the base for Cascade subjects that are not `cascade:HealthRecord` subclasses and therefore carry no required provenance. `CascadeRecord` extends it and still requires `dataProvenance` and `schemaVersion`.
- `SubjectBuilder.uriList()` (an `rdf:List` of IRIs) and `SubjectBuilder.decimal()` (a plain decimal literal).

### Changed
- **Readers accept the four classes deprecated in clinical v1.13; writers never emit them.** `clinical:LabResult`, `clinical:Condition`, `clinical:Allergy` and `clinical:Immunization` were deprecated, not removed, and existing pods contain them, so `deserialize()` accepts both spellings (including the unambiguous `clinical:` spellings of their properties) while `TYPE_MAPPING` carries no entry that could produce one.
- The deprecated `clinical:linkedConditionIds` literal is still read, so links written before v1.10 are not lost.
- Generic serialization emits decimals plain (`7.4`) rather than `"7.4"^^xsd:double`, matching every conformance fixture. RDF 1.1 already types a bare `7.4` as `xsd:decimal`. `SubjectBuilder.double()` is unchanged for callers that want the explicit form.
- `cascade:RecordSummary` counts serialize with their declared `^^xsd:integer` datatype.
- `serialize()`, `validate()`, `validateAll()`, `toJsonLd()`, `fromJsonLd()` and `deserialize()` accept `CascadeEntity` (a widening; every existing call still typechecks).
- VOCAB_VERSIONS updated: core=3.4, health=2.5, clinical=1.13.

### Fixed
- The Turtle parser now accepts `<>`, the empty relative IRI a pod export manifest uses to name itself. Manifests were previously unreadable.
- Multi-line `rdf:List` members are tokenized on any whitespace, not the space character alone, which had captured the trailing newline into each member.

## [1.5.0] - 2026-06-22

### Added
- `SocialHistoryRecord` model (`health:SocialHistoryRecord`) — consumer-reported social history (smoking, alcohol, exercise, occupation). DISTINCT from the EHR-extracted `ClinicalSocialHistoryRecord` (`clinical:SocialHistoryRecord`).
- `AdvisoryApplicationActivity` model (`cascade:AdvisoryApplicationActivity`) — PROV-O activity recording application of a Cascade Advisory Patch; carries `appliedTriplesCount`.
- `AIGenerationActivity` model (`cascade:AIGenerationActivity`) — LLM generation activity (sibling of `AIExtractionActivity`); adds `promptVersion`, `generationTemperature`, `trigger`, and reuses `extractionModel`/`extractionConfidence`/`sourceNarrativeSection`/`requiresUserReview`.
- `GenerationTrigger` type (`InitialGeneration` | `RegenerationAfterReclassification` | `AudienceRetargeting`).
- `ProxyAgent` model (`cascade:ProxyAgent`) — caregiver acting on a patient's behalf; `actsForPatient`, `proxyWebID`, `proxyRelationship`, `proxyScope`, `proxyGrantedAt`, `proxyRevokedAt`.
- `'AIAsserted'` provenance value (`cascade:AIAsserted`, subClassOf `cascade:ConsumerGenerated`) — ungrounded general-AI content; never to be confused with `AIExtracted`.
- PROPERTY_PREDICATES, TYPE_MAPPING, and TYPE_TO_MAPPING_KEY entries for all new classes/properties; JSON-LD context typing for `proxyGrantedAt`/`proxyRevokedAt` (xsd:dateTime), `appliedTriplesCount` (xsd:integer), `generationTemperature` (xsd:decimal).

### Changed
- VOCAB_VERSIONS updated: core=3.3, health=2.4, clinical=1.9 (coverage/checkup/pots unchanged).

## [1.3.0] - 2026-03-27

### Added
- `contentHashedUri(resourceType, contentFields, fallbackId?)` — deterministic content-hashed URI generator using CDP-UUID algorithm
- `deterministicUuid(input)` — CDP-UUID hash function. Cross-SDK: `deterministicUuid("hello") === "aaf4c61d-dcc5-58a2-9abe-de0f3b482cd9"`
- Typed convenience helpers: `patientUri()`, `immunizationUri()`, `observationUri()`, `conditionUri()`, `allergyUri()`, `medicationUri()`
- Cross-SDK conformance test vectors loaded from `conformance/fixtures/deterministic-ids/test-vectors.json`
- 16 new tests

## [1.2.0] - 2026-03-20

### Added
- `MedicationAdministration` model (`clinical:MedicationAdministration`) — single-event medication administration records (IV antibiotics, injections, etc.)
- `ImplantedDevice` model (`clinical:ImplantedDevice`) — permanent implanted medical devices (pacemakers, stents, cochlear implants)
- `ImagingStudy` model (`clinical:ImagingStudy`) — diagnostic imaging metadata (CT, MRI, X-ray, ultrasound) without DICOM payloads
- `ClaimRecord`, `BenefitStatement`, `DenialNotice` type mappings for coverage vocabulary (`coverage:` namespace)
- TYPE_MAPPING and TYPE_TO_MAPPING_KEY entries for all new types and coverage v1.3 classes
- PROPERTY_PREDICATES entries for all new clinical and coverage v1.3 properties
- Core v2.8 FHIR passthrough predicates: `layerPromotionStatus`, `fhirJson`, `sourceRecordDate`

### Changed
- VOCAB_VERSIONS updated: core=2.8, clinical=1.7, coverage=1.3

## 1.1.1 (2026-03-18)

### Added
- `Encounter` data model interface (`encounterType`, `encounterClass`, `encounterStatus`, `encounterStart`, `encounterEnd`, `providerName`, `snomedCode`)
- `Encounter` deserialization support — TYPE_MAPPING entry and predicate mappings for `clinical:*` encounter predicates
- `cptCode` and `procedureStatus` fields on `Procedure` model

### Fixed
- `deserialize(ttl, 'Procedure')` now works — rdfType corrected from `health:ProcedureRecord` to `clinical:Procedure`
- `deserialize(ttl, 'Encounter')` now works — was completely absent from SDK
- `clinical:performedDate`, `clinical:sourceRecordId`, `clinical:status`, `clinical:notes` predicates now map correctly via ADDITIONAL_REVERSE_MAPPINGS
- `Procedure.type` discriminant corrected from `'ProcedureRecord'` to `'Procedure'`

## 1.1.0 (2026-03-12)

### Added
- PodBuilder support for procedures and family-history records
- Shared utilities extracted to vocabularies module

### Fixed
- npm scope corrected to `@the-cascade-protocol`
- Publishing metadata (repository, homepage, bugs, files fields)

## 1.0.0 (2026-02-21)

### Added
- Core data model interfaces for all 13 Cascade Protocol types
- Turtle serializer with TurtleBuilder fluent API
- Turtle deserializer (zero runtime dependencies)
- JSON-LD conversion (toJsonLd/fromJsonLd)
- Vocabulary constants (NAMESPACES, TYPE_MAPPING, PROPERTY_PREDICATES)
- Bundled JSON-LD context with CONTEXT_URI
- Full conformance test suite passing all fixtures
