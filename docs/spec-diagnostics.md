# Spec diagnostics — answer key

The document every code in `src/spec/diagnostics.md` links to. The rendered file says *what* the build found; this says what each code *means*: what the finding is, which files to open and what to look for in them, why it is a judgment call rather than a mechanical fix, who owns it, and what change makes the row go away. It is committed, not generated; `tests/diagnostics/answer-key.test.ts` keeps its `### `code`` anchors equal to the codes `scripts/lib/diagnostics.mjs` can emit, so a new code without an entry fails the build, and an entry for a removed code does too. Every entry answers the same five questions in the same order.

> ### How to read a row
>
> Every finding in `src/spec/diagnostics.md` carries a **code** (the heading, linked here), a **subject** (the IRI, JSON key or `vocabulary:term` it is about), a **detail** (what is wrong), a **fix** (what to change, written to be pasted into a `spec` issue as-is), and one or more **📄 locations** — `spec:` paths are relative to a `spec` checkout, `sdk:` paths to this repository.
>
> **Severity** answers "what happens if nobody acts": `error` — conversion refuses a value today; `warning` — something is silently wrong or silently guessed at runtime; `info` — hygiene, or a question with no runtime consequence yet.
>
> **Owner** answers "whose change is it": `spec` — the fix is an edit to spec, paste the row there; `sdk` — this repository registered or assumed something spec never said; `reconcile` — a question has to be answered before anyone knows which. The rendered file is grouped by owner first for that reason.
>
> A row's **id** is `code:subject` and is stable across builds, so the same defect at two spec revisions is the same id.

### `record-class-name-collision`

**What it means.** Two record classes are published under the same JSON name in spec's contexts (the `claimants`). A JSON-LD context key can only mean one IRI, so one of the two has no usable published name — and this SDK's `recordTypeFor("<name>")` throws naming both rather than picking one.

**Where to look.** Each `spec:contexts/v1/<vocab>.jsonld` in the row's locations, at the key named by the subject; then the two class declarations in their ontologies. On the SDK side, `src/record-types/overrides.ts` (`NAME_OVERRIDES`) is where a spelling can be settled locally — and an override *hides* the collision from lookups, which is exactly why the row stays in this report after one exists. Detector: `scripts/build-record-types.mjs` (the `NAME_COLLISIONS` check, via `scripts/lib/duplicate-names.mjs`).

**Why it's a judgment call.** Which class keeps the short name is a naming decision only spec can make (`jayostis/spec#50` gap 3c). The SDK can refuse or override; it cannot decide.

**Owner / severity.** `spec` / `warning`.

**Goes away when** spec publishes distinct keys for the two classes.

### `unclassifiable-range`

**What it means.** A property's `rdfs:range` names a Cascade class that has neither members (subclasses or named individuals — the shape of a code list) nor any `rdfs:domain`-linked property (the shape of a structured class). The SDK cannot tell which it is, so `convertToRdf` refuses a value for that property (`src/converter/to-rdf.ts`, the `unclassifiableRangeFor` check) rather than guess. **The only code in this report that blocks conversion outright.**

**Where to look.** `spec:ontologies/<vocab>/v1/<vocab>.ttl` at the class in the subject, and at the property whose range it is (the fix text names it). Detector: `scripts/build-terms.mjs`, the `unclassifiableRanges` sweep and `specFixFor()`.

**Why it's a judgment call.** It is undecidable from the data: spec either forgot the fields or forgot the members, and each fix produces a different converter. Guessing would be the SDK inventing spec.

**Owner / severity.** `spec` / `error`.

**Goes away when** spec adds domain-linked properties (making it structured) or declares members (making it a code list).

### `term-value-not-iri`

**What it means.** A context term's value is prose, not an IRI — section headers written as term definitions (`"__comment_core": "=== Core Vocabulary (cascade:) ==="`, `jayostis/spec#48`). Written into a pod it would become a triple whose predicate is a sentence. The build skips and counts it instead of failing.

**Where to look.** `spec:contexts/v1/<file>.jsonld` at the key in the subject (`vocabulary:term`). Detector: `scripts/build-terms.mjs`, the `unresolvable` list.

**Why it's a judgment call.** It isn't — a typo-class defect. It is in the report because the build tolerates it silently, and "tolerated" is how a count reaches zero and nobody notices when it comes back.

**Owner / severity.** `spec` / `info`.

**Goes away when** the key is removed upstream. Zero at the current pin.

### `term-cross-context-conflict`

**What it means.** One JSON key resolves to different predicates in different context files — `notes` is `clinical:notes` under `clinical.jsonld` and `health:notes` under `health.jsonld` (the `predicates`). A single flat key→predicate map would pick one silently and write the wrong predicate for every record of the other class; this SDK keeps per-vocabulary tables in `terms.generated.ts` for exactly this reason. One row per key, however many contexts redeclare it.

**Where to look.** Every context file in the row's locations, at the key in the subject. Detector: `scripts/build-terms.mjs`, the `conflicts` list. One exemption: a key whose every IRI is a live record class is `record-class-name-collision`'s row and is not repeated here; any other collision — two plain classes, a deprecated record class against a live one — has no other row and is reported.

**Why it's a judgment call.** The reuse is deliberate — the same word means different things per vocabulary — and a JSON-LD 1.0 context cannot scope a key by the type of the record it appears in. It is not a mistake in either file; it is a limit of how spec publishes. `jayostis/spec#4` proposes JSON-LD 1.1 type-scoped terms, which would let one key mean one thing per class. The fix is upstream design, not a rename.

**Owner / severity.** `spec` / `warning`.

**Goes away when** spec adopts type-scoped terms, or renames one side.

### `normative-language-in-comment`

**What it means.** An `rdfs:comment` states a rule in RFC 2119 language (MUST / SHOULD / SHALL / REQUIRED / RECOMMENDED / MAY / OPTIONAL, or "VALUE FORM") that no SHACL shape encodes. This SDK does not carry `rdfs:comment` into `src/spec/` — a quarter of the payload, prose no engine reads — so the rule reaches no consumer; and upstream, nothing can check it either. `cascade:sourceIdentity` specifies a scheme-prefixed value form in 3,978 characters that exists nowhere else.

**Where to look.** `spec:ontologies/<vocab>/v1/<vocab>.ttl` at the `rdfs:comment` of the subject; then `spec:ontologies/<vocab>/v1/<vocab>.shapes.ttl` to confirm nothing encodes it. Detector: `scripts/build-spec-data.mjs`, over the raw quads before the predicate is dropped; uppercase words only, one row per subject.

**Why it's a judgment call.** Prose rules may be advisory on purpose. Only spec can say whether a given "MUST" was meant to be checkable; an SDK that encoded it would be inventing a constraint nobody ratified.

**Owner / severity.** `reconcile` / `info`.

**Goes away when** spec encodes the rule as a shape — or declares it advisory, in which case the row stays until there is a way to mark a comment as advisory (a follow-up, not this issue).

### `term-no-type-info`

**What it means.** A property term has no `@type` in any context that publishes it and no `rdfs:range` in the ontology — nothing anywhere says what shape its value takes. Conversion still succeeds: the SDK infers a datatype from the JavaScript value (`src/converter/to-rdf.ts`, the fall-through after the range check), with nothing in spec behind the choice.

**Where to look.** `spec:ontologies/<vocab>/v1/<vocab>.ttl` at the property in the subject, and each context in the row's locations at the keys the detail names. Detector: `scripts/build-terms.mjs`, in the context loop, one row per predicate.

**Why it's a judgment call.** The guess is usually right — a string becomes `xsd:string` — so nothing fails, until a shape expects `xsd:dateTime` and receives an untyped literal. That is `jayostis/spec#46` (`administrationDate` had a range the context never carried). Whether the fix is an `rdfs:range` or a context `@type` is spec's call; the SDK must not pick a type on spec's behalf.

**Owner / severity.** `spec` / `warning`.

**Goes away when** spec adds `rdfs:range` to the property or `@type` to the term.

### `property-no-range`

**What it means.** Spec declares a property — object, datatype or annotation — with no `rdfs:range` at all, whether or not any context uses it. `reachedBy` lists the context keys that do; empty means nothing shipped reaches it yet.

**Where to look.** `spec:ontologies/<vocab>/v1/<vocab>.ttl` at the subject. Detector: `scripts/build-terms.mjs`, a sweep over the ontology graph; deprecated properties excluded.

**Why it's a judgment call.** It mostly isn't — ontology hygiene. The rows with a non-empty `reachedBy` overlap with `term-no-type-info` and are the ones worth doing first; the rest are debt with no consequence yet.

**Owner / severity.** `spec` / `info`.

**Goes away when** `rdfs:range` is added, or the property is deprecated.

### `declared-predicate-not-in-ontology`

**What it means.** `src/vocabularies/namespaces.ts` registers a predicate in a Cascade namespace that no spec ontology declares. Two forms, told apart by `owner`: **`sdk`** — no spec context carries it either, so spec has never heard of it and this SDK invented it; **`reconcile`** — a context does carry it but the ontology does not, so spec disagrees with itself. Scoped to the namespaces some ontology file declares as its `owl:Ontology`: draft namespaces spec ships no ontology for (`evidence:`, `workbench:`, …) and borrowed vocabulary (`foaf:`, `dcterms:`, …) are out of scope by that fact and never appear here — and a draft vocabulary comes into scope the day its ontology lands, with no list to update.

**Where to look.** `sdk:src/vocabularies/namespaces.ts` at the `PROPERTY_PREDICATES` entry for the subject, then `src/models/` for any interface field that writes that key; confirm absence in `spec:ontologies/<vocab>/v1/<vocab>.ttl` and `spec:contexts/v1/*.jsonld`. Detector: `scripts/build-terms.mjs`, cross-referencing `namespaces.ts` (expanded with its own prefix table) against the ontology graph.

**Why it's a judgment call.** For `sdk` rows: drop the registration, or propose the property upstream? A value nobody can write against the published contexts is dead weight — but it may encode a need spec should hear about. For `reconcile` rows: which half of spec is right.

**Owner / severity.** `sdk` (or `reconcile`) / `warning`.

**Goes away when** the registration is removed — with its model field — or spec adopts the property.

### `record-class-no-published-name`

**What it means.** A class marked `cascade:RecordClass` has no JSON name in any context; the SDK falls back to the IRI's local name. Records of this class cannot be authored in JSON-LD by name against the published contexts.

**Where to look.** `spec:contexts/v1/<vocab>.jsonld` — the file that should carry the name — and `spec:ontologies/<vocab>/v1/<vocab>.ttl` at the class. Detector: `scripts/build-record-types.mjs`, where the published name falls back to the local name.

**Why it's a judgment call.** The local name is often exactly what spec would have published — which is why this stayed silent for nine classes at an earlier pin — but "often" is luck, and a name the SDK chose is a name spec never agreed to (`jayostis/spec#50` gap 3a).

**Owner / severity.** `spec` / `warning`.

**Goes away when** spec adds the context entry. Zero at the current pin.

### `deprecated-class-unresolved-successor`

**What it means.** A deprecated record class points, via `rdfs:seeAlso`, at nothing that is a live record class — or has no `rdfs:seeAlso` at all. The SDK records succession in `DERIVED_CLASSES[].supersedes` so a reader of old records knows which class replaced this one; this row means that link is lost.

**Where to look.** `spec:ontologies/<vocab>/v1/<vocab>.ttl` at the deprecated class; for each `rdfs:seeAlso` target, check that it is a class, that it carries `cascade:RecordClass`, and that the IRI is spelled as the successor declares it. Detector: `scripts/build-record-types.mjs`, the `supersedes` loop, per class, record population only.

**Why it's a judgment call.** An external target (`fhir:Coverage`) alongside a live one is fine and is not reported; only zero live successors is. Whether the deprecated class should point somewhere, or is retired with no successor on purpose, is spec's to say.

**Owner / severity.** `spec` / `warning`.

**Goes away when** `rdfs:seeAlso` names a live record class, or the class is un-deprecated.

### `range-has-unrecognized-typed-members`

**What it means.** A Cascade range class has member nodes typed directly to it — but not `owl:NamedIndividual`, and not `rdfs:subClassOf` — a third way of publishing a code list that `membersOf()` in this SDK does not recognize. Today it is latent: no context term reaches the range. The day one does, the class would be misreported as `unclassifiable-range`, with a fix text asking spec to add members it has already published.

**Where to look.** `spec:ontologies/<vocab>/v1/<vocab>.ttl` at the range and at the nodes in `members`; `sdk:scripts/build-terms.mjs` `membersOf()` for the two forms it does recognize (`cascade:DataProvenance`'s subclasses, `cascade:ConsentScope`'s named individuals). Detector: a sweep over every Cascade `rdfs:range` object.

**Why it's a judgment call.** Is the third form intentional — then the SDK should learn it — or a spec inconsistency — then spec should type the members `owl:NamedIndividual` like `cascade:ConsentScope` does? Either answer is a one-line fix; the wrong one bakes a misread into the classifier.

**Owner / severity.** `reconcile` / `info`.

**Goes away when** spec adds `owl:NamedIndividual`, or `membersOf()` learns the form and this check is updated to match.

### `target-class-not-in-ontology`

**What it means.** A shape declares `sh:targetClass` for a class that no ontology this SDK ships declares as an `owl:Class` or `rdfs:Class`. A conforming record is typed to a declared class, so the shape selects none of them: every constraint it states is enforced on nobody, and a record of the class the shape was written for validates clean against it. This is the assertion `spec/validation/index.md` §6 says a consumer that vendors shapes owes.

**Where to look.** The `spec:ontologies/<vocab>/v1/<vocab>.shapes.ttl` in the row's locations at the `sh:targetClass`, then `spec:ontologies/<vocab>/v1/<vocab>.ttl` for the class — at the current pin the two rows are classes checkup v3.0 removed (`checkup:PatientProfile`, `checkup:VitalSignsTrend`) whose shapes were not. Detector: `scripts/build-shapes.mjs`, `indexShapes()`, over every named shape's `sh:targetClass` against the merged ontology graph.

**Why it's a judgment call.** A misspelling wants the target corrected; a class the ontology removed wants the shape removed or retargeted at the successor; a class spec meant to declare wants the ontology fixed. Each is a one-line change and only spec knows which.

**Owner / severity.** `spec` / `warning`.

**Goes away when** the ontology declares the class, or the shape names one it does.
