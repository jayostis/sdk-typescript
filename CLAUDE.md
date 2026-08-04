# sdk-typescript — Agent Context

## Repository Purpose

TypeScript SDK for the Cascade Protocol.
Package: `@the-cascade-protocol/sdk`

## Key Architecture

- `src/models/` — TypeScript interfaces for each Cascade record type (one file per class)
- `src/vocabularies/namespaces.ts` — RDF predicate URIs and TYPE_MAPPING
- `src/jsonld/context.ts` — JSON-LD context definition
- `src/serializer/` — TTL → JSON serialization
- `src/deserializer/` — JSON → TTL deserialization
- `src/validator/` — SHACL validation support

## MANDATORY: Deployment Discipline

### Before implementing support for a new vocabulary class:

Check `spec/ontologies/{name}/v1/{name}.ttl` for the authoritative class definition.
Check `spec/ontologies/{name}/v1/{name}.shapes.ttl` for required properties and constraints.
Check `conformance/fixtures/` for the canonical test fixtures that your implementation must pass.

### When adding a new vocabulary class, you MUST:

- [ ] Add `src/models/{class-name}.ts` — TypeScript interface matching all TTL properties
- [ ] Add predicate URIs to `src/vocabularies/namespaces.ts` (PROPERTY_PREDICATES)
- [ ] Add to TYPE_MAPPING with correct `rdfType` from the TTL
- [ ] Add to serializer and deserializer
- [ ] Add to `src/jsonld/context.ts`
- [ ] Export from `src/index.ts`
- [ ] Verify all conformance fixtures for this class pass
- [ ] Update `VOCAB_VERSIONS` — bump the entry for the vocabulary you just implemented
- [ ] Update CHANGELOG.md
- [ ] Bump `package.json` version (minor bump for new class support)
- [ ] Install hooks if not done: `sh scripts/install-hooks.sh`

The pre-commit hook will block commits to `src/models/` or `src/vocabularies/` without updating `VOCAB_VERSIONS`.

### Current vocabulary versions

Check `VOCAB_VERSIONS` at the repo root. Compare against `spec/VOCAB_VERSIONS` to see what's behind.

### Known gaps (as of 2026-08-04)

See `VOCAB_VERSIONS` comments. Remaining items:
- **Core v2.8**: `fhirResourceType` is still unregistered. `layerPromotionStatus`, `fhirJson` and `sourceRecordDate` are present.
- **Health v2.0/v2.5**: the eight history-container object properties (`restingHeartRateHistory`, `dailyActivityHistory`, ...) and the reading classes they range over are unmodelled. The six wellness containers are registered as constants only; this SDK does not serialize a `health:HealthProfile`.
- **Blank-node reads**: only `clinicalSummary` / `wellnessSummary` are reconstructed into nested objects. The patient-profile sub-structures (`emergencyContact`, `address`, `preferredPharmacy`) serialize as blank nodes but come back as blank-node identifiers.
- **Conformance coverage**: the fixture-driven harnesses load a subset of the fixture families. `dailyvital-`, `device-`, `encounter-`, `medadmin-`, `imaging-`, `social-`, `proxy-`, `claim-`, `benefit-` and `denial-` are not exercised by any test.
- **Silent skips**: `tests/deserializer.test.ts` uses `if (!recordType) return;`, so an unmapped `dataType` reports a pass without asserting anything. Prefer an explicit assertion over an early return.

Resolved since the 2026-03-20 list: the clinical v1.7 models, the coverage v1.3 classes, and the `checkup:`/`pots:` JSON-LD context entries all exist.

## Commit Conventions

```
feat(sdk): add {ClassName} model (clinical v1.7)
feat(sdk): add Core v2.8 FHIR passthrough properties
fix(sdk): {description}
```

## Related Repositories

- **spec** — Authoritative TTL/shapes. Read these when implementing new classes.
- **conformance** — Test fixtures. Your implementation must pass these before releasing.
- **cascade-cli** — Reference implementation of serialization patterns.
