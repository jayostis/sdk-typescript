# Changelog

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
