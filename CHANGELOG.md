# Changelog

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
