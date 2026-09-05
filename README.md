# @the-cascade-protocol/sdk

TypeScript SDK for the Cascade Protocol -- a developer-first framework for patient-owned health data.

## Installation

```bash
npm install @the-cascade-protocol/sdk
```

## Quick Start

```typescript
import type { Medication } from '@the-cascade-protocol/sdk';
import { serialize, deserializeOne, toJsonLd } from '@the-cascade-protocol/sdk';

// Create a medication record
const med: Medication = {
  id: 'urn:uuid:med-001',
  type: 'MedicationRecord',
  medicationName: 'Lisinopril',
  isActive: true,
  dose: '20 mg',
  frequency: 'once daily',
  dataProvenance: 'ClinicalGenerated',
  schemaVersion: '1.3',
};

// Serialize to Turtle (RDF)
const turtle = serialize(med);

// Deserialize back to a typed record
const parsed = deserializeOne<Medication>(turtle, 'MedicationRecord');

// Convert to JSON-LD
const jsonld = toJsonLd(med);
```

## Features

- **21 data model interfaces** -- Medication, Condition, Allergy, LabResult, VitalSign, Immunization, Procedure, FamilyHistory, Coverage, PatientProfile, ActivitySnapshot, SleepSnapshot, HealthProfile, Encounter, MedicationAdministration, ImplantedDevice, ImagingStudy, ClaimRecord, BenefitStatement, DenialNotice, AppealRecord
- **Turtle serializer** -- Produces conformance-tested RDF/Turtle output with typed literals, URI references, and RDF lists
- **Turtle deserializer** -- Zero-dependency parser for Cascade Protocol Turtle documents
- **Runs in a browser** -- The public entry point bundles for a browser target with any ordinary bundler (Vite, esbuild, webpack) and reaches no Node global on any path; CI proves both on every push
- **JSON-LD conversion** -- Convert records to/from JSON-LD format with bundled context
- **Vocabulary constants** -- NAMESPACES, TYPE_MAPPING, and PROPERTY_PREDICATES for all Cascade Protocol ontologies
- **TurtleBuilder** -- Fluent API for constructing custom Turtle documents

## API Reference

### Serialization

```typescript
import { serialize, serializeMedication } from '@the-cascade-protocol/sdk';

// Generic serializer (dispatches by record.type)
const turtle = serialize(anyRecord);

// Type-specific serializers also available
const turtle = serializeMedication(med);
```

Available type-specific serializers: `serializeMedication`, `serializeCondition`, `serializeAllergy`, `serializeLabResult`, `serializeVitalSign`, `serializeImmunization`, `serializeProcedure`, `serializeFamilyHistory`, `serializeCoverage`, `serializePatientProfile`, `serializeActivitySnapshot`, `serializeSleepSnapshot`.

### Deserialization

```typescript
import { deserialize, deserializeOne } from '@the-cascade-protocol/sdk';
import type { Medication } from '@the-cascade-protocol/sdk';

// Parse all medications from a Turtle document
const meds = deserialize<Medication>(turtleString, 'MedicationRecord');

// Parse a single record (returns null if not found)
const med = deserializeOne<Medication>(turtleString, 'MedicationRecord');
```

Supported type strings: `MedicationRecord`, `ConditionRecord`, `AllergyRecord`, `LabResultRecord`, `ImmunizationRecord`, `VitalSign`, `ProcedureRecord`, `FamilyHistoryRecord`, `CoverageRecord`, `PatientProfile`, `ActivitySnapshot`, `SleepSnapshot`.

### JSON-LD

```typescript
import { toJsonLd, fromJsonLd, getContext, CONTEXT_URI } from '@the-cascade-protocol/sdk';

// Convert to JSON-LD
const doc = toJsonLd(medication);
// { "@context": "https://...", "@id": "urn:uuid:...", "@type": "health:MedicationRecord", ... }

// Convert back from JSON-LD
const record = fromJsonLd<Medication>(doc);

// Get the full JSON-LD context object
const context = getContext();
```

### Vocabulary Constants

```typescript
import { NAMESPACES, TYPE_MAPPING, PROPERTY_PREDICATES } from '@the-cascade-protocol/sdk';

// Namespace URIs
NAMESPACES.cascade  // "https://ns.cascadeprotocol.org/core/v1#"
NAMESPACES.health   // "https://ns.cascadeprotocol.org/health/v1#"
NAMESPACES.clinical // "https://ns.cascadeprotocol.org/clinical/v1#"

// Type mappings
TYPE_MAPPING.medications.rdfType  // "health:MedicationRecord"

// Property predicates
PROPERTY_PREDICATES.medicationName  // "health:medicationName"
```

### TurtleBuilder

```typescript
import { TurtleBuilder } from '@the-cascade-protocol/sdk';

const turtle = new TurtleBuilder()
  .prefix('cascade', 'https://ns.cascadeprotocol.org/core/v1#')
  .prefix('health', 'https://ns.cascadeprotocol.org/health/v1#')
  .prefix('xsd', 'http://www.w3.org/2001/XMLSchema#')
  .subject('<urn:uuid:custom-001>')
    .type('health:MedicationRecord')
    .literal('health:medicationName', 'Aspirin')
    .boolean('health:isActive', true)
    .dateTime('health:startDate', '2024-01-01T00:00:00Z')
    .done()
  .build();
```

## Data Models

All models extend the `CascadeRecord` base interface:

```typescript
interface CascadeRecord {
  id: string;                    // URN UUID (e.g., "urn:uuid:...")
  type: string;                  // RDF type name
  dataProvenance: ProvenanceType; // Source classification
  schemaVersion: string;          // Version string (e.g., "1.3")
  sourceRecordId?: string;        // Link to source system record
  notes?: string;                 // Free-text notes
}
```

## Conformance

This SDK passes all Cascade Protocol conformance test fixtures. The serializer produces output that matches the expected Turtle format for all standard record types. Conformance fixtures are maintained in the [conformance/fixtures](../conformance/fixtures/) directory.

## Development

Clone `conformance` and `spec` as siblings of this repository first. The suites read conformance fixtures from `../conformance/fixtures/` and the SHACL shapes out of a `spec` checkout — no `.ttl` file is copied in here, so without them `npm test` refuses with `no spec checkout at <path>`. `CASCADE_SPEC_DIR` names a `spec` checkout kept somewhere else and is checked before the `../spec` sibling.

```bash
# Build
npm run build

# Run tests
npm test

# Watch mode
npm run test:watch
```

## License

Apache-2.0
