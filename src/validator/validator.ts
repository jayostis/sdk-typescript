import type { CascadeEntity, ProvenanceType } from '../models/common.js';
import { CURRENT_SCHEMA_VERSION } from '../vocabularies/namespaces.js';
import { allTerms, termFor } from '../terms/index.js';

// ─── Public Types ───────────────────────────────────────────────────────────

export interface ValidationError {
  readonly field: string;
  readonly message: string;
  readonly severity: 'error' | 'warning';
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly ValidationError[];
  readonly warnings: readonly ValidationError[];
}

// ─── Internal Constants ─────────────────────────────────────────────────────

const VALID_PROVENANCE_TYPES: ReadonlySet<string> = new Set<ProvenanceType>([
  'ClinicalGenerated',
  'DeviceGenerated',
  'SelfReported',
  'AIExtracted',
  'AIGenerated',
  'AIAsserted',
  'EHRVerified',
  // core v3.8. Without this row the validator REJECTS a conformant value, which
  // is the one failure mode a hardcoded enum has: the type union alone would
  // have let it through at compile time and this set would have failed it at
  // runtime.
  'PatientReported',
]);

const RECOGNIZED_DATA_TYPES: ReadonlySet<string> = new Set([
  'MedicationRecord',
  'ConditionRecord',
  'AllergyRecord',
  'LabResultRecord',
  'VitalSign',
  'ImmunizationRecord',
  'ProcedureRecord',
  'FamilyHistoryRecord',
  'CoverageRecord',
  'InsurancePlan',
  'PatientProfile',
  'ActivitySnapshot',
  'SleepSnapshot',
  'SocialHistoryRecord',
  'AdvisoryApplicationActivity',
  'AIGenerationActivity',
  'ProxyAgent',
  // core v3.4 — pod export manifest
  'ExportManifest',
  'RecordSummary',
  'InteractionScenario',
  // health v2.5 — single-day wellness snapshots
  'DailyActivitySnapshot',
  'DailySleepSnapshot',
]);

const VALID_CONDITION_STATUSES: ReadonlySet<string> = new Set([
  'active', 'resolved', 'remission', 'inactive',
]);

const VALID_VITAL_TYPES: ReadonlySet<string> = new Set([
  'heartRate', 'bloodPressureSystolic', 'bloodPressureDiastolic',
  'respiratoryRate', 'temperature', 'oxygenSaturation',
  'weight', 'height', 'bmi',
]);

const VALID_IMMUNIZATION_STATUSES: ReadonlySet<string> = new Set([
  'completed', 'entered-in-error', 'not-done',
]);

// prov:Agent / prov:Activity classes — NOT cascade:HealthRecord subclasses, so
// they carry no dataProvenance/schemaVersion. Required fields follow each SHACL
// shape (e.g. ProxyAgentShape) instead.
const AGENT_AND_ACTIVITY_TYPES: ReadonlySet<string> = new Set([
  'ProxyAgent',
  'AdvisoryApplicationActivity',
  'AIGenerationActivity',
  // core v3.4 — the pod export manifest classes are a dcat:Dataset, a
  // void:Dataset and a prov:Entity respectively, NOT cascade:HealthRecord
  // subclasses. They describe an export rather than reporting an observation,
  // so demanding a cascade:dataProvenance on them would invent a requirement
  // no shape states. Required fields follow each SHACL shape instead.
  'ExportManifest',
  'RecordSummary',
  'InteractionScenario',
]);

const AGENT_ACTIVITY_REQUIRED_FIELDS: Readonly<Record<string, readonly string[]>> = {
  ProxyAgent: ['actsForPatient', 'proxyRelationship', 'proxyGrantedAt'],
  AIGenerationActivity: ['extractionModel', 'trigger'],
  AdvisoryApplicationActivity: [],
  // cascade:ExportManifestShape: title, created and schemaVersion are
  // sh:minCount 1. An untitled, undated export cannot be presented to a user
  // and a consumer cannot tell whether it is current.
  ExportManifest: ['title', 'created', 'schemaVersion'],
  // cascade:RecordSummaryShape: domain is sh:minCount 1.
  RecordSummary: ['domain'],
  // cascade:InteractionScenarioShape: title and involvedResources are
  // sh:minCount 1. A scenario that names no resources states a risk exists but
  // gives a consumer nothing to check it against.
  InteractionScenario: ['title', 'involvedResources'],
};

// Types that should ideally have coding system references
const CLINICAL_TYPES_WANTING_CODES: ReadonlySet<string> = new Set([
  'MedicationRecord',
  'ConditionRecord',
  'LabResultRecord',
  'VitalSign',
  'ImmunizationRecord',
  'ProcedureRecord',
]);

// ─── Internal Helpers ───────────────────────────────────────────────────────

type RecordFields = Record<string, unknown>;

function hasField(rec: RecordFields, field: string): boolean {
  const val = rec[field];
  if (val === undefined || val === null) return false;
  // A 0..* property (health v2.6, clinical v1.14) may be an array. An empty one
  // serializes to zero triples, so it is an absent value, not a present one:
  // treating `testCode: []` as a coding would suppress the missing-coding
  // warning on a record that carries no coding.
  if (Array.isArray(val)) return val.length > 0;
  return true;
}

function hasNonEmptyString(rec: RecordFields, field: string): boolean {
  const val = rec[field];
  return typeof val === 'string' && val.trim().length > 0;
}

function hasNumber(rec: RecordFields, field: string): boolean {
  return typeof rec[field] === 'number';
}

// ─── Validation Logic ───────────────────────────────────────────────────────

function validateBase(record: CascadeEntity): ValidationError[] {
  const errors: ValidationError[] = [];

  // 1. id must be present and non-empty
  if (!record.id || record.id.trim().length === 0) {
    errors.push({ field: 'id', message: 'id must be present and non-empty', severity: 'error' });
  }

  // 2. type must be a recognized DataType
  if (!record.type || !RECOGNIZED_DATA_TYPES.has(record.type)) {
    errors.push({
      field: 'type',
      message: `type "${record.type ?? ''}" is not a recognized DataType`,
      severity: 'error',
    });
  }

  // prov:Agent / prov:Activity classes are not data records: they carry no
  // schemaVersion/dataProvenance. Validate their shape-required fields instead.
  if (record.type && AGENT_AND_ACTIVITY_TYPES.has(record.type)) {
    const rec: RecordFields = { ...record };
    for (const field of AGENT_ACTIVITY_REQUIRED_FIELDS[record.type] ?? []) {
      if (!hasField(rec, field)) {
        errors.push({ field, message: `${record.type} requires ${field}`, severity: 'error' });
      }
    }
    return errors;
  }

  // 3. schemaVersion must be present
  if (!record.schemaVersion || record.schemaVersion.trim().length === 0) {
    errors.push({
      field: 'schemaVersion',
      message: 'schemaVersion must be present',
      severity: 'error',
    });
  }

  // 4. dataProvenance must be a valid ProvenanceType
  if (!record.dataProvenance || !VALID_PROVENANCE_TYPES.has(record.dataProvenance)) {
    errors.push({
      field: 'dataProvenance',
      message: `dataProvenance "${record.dataProvenance ?? ''}" is not a valid ProvenanceType`,
      severity: 'error',
    });
  }

  return errors;
}

function validateWarnings(record: CascadeEntity): ValidationError[] {
  const warnings: ValidationError[] = [];
  const rec: RecordFields = { ...record };

  // Schema version warning
  if (record.schemaVersion && record.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    warnings.push({
      field: 'schemaVersion',
      message: `schemaVersion "${record.schemaVersion}" does not match current version "${CURRENT_SCHEMA_VERSION}"`,
      severity: 'warning',
    });
  }

  // Missing coding references on clinical types
  if (CLINICAL_TYPES_WANTING_CODES.has(record.type)) {
    const hasLoinc = hasField(rec, 'loincCode') || hasField(rec, 'testCode');
    const hasSnomed = hasField(rec, 'snomedCode');

    if (!hasLoinc && !hasSnomed) {
      warnings.push({
        field: 'loincCode',
        message: 'Missing loincCode or snomedCode on clinical record; standard coding improves interoperability',
        severity: 'warning',
      });
    }
  }

  return warnings;
}

function validateTypeSpecific(record: CascadeEntity): ValidationError[] {
  const errors: ValidationError[] = [];
  const rec: RecordFields = { ...record };

  switch (record.type) {
    case 'MedicationRecord': {
      if (!hasNonEmptyString(rec, 'medicationName')) {
        errors.push({
          field: 'medicationName',
          message: 'medicationName is required for MedicationRecord',
          severity: 'error',
        });
      }
      if (!hasField(rec, 'isActive')) {
        errors.push({
          field: 'isActive',
          message: 'isActive is required for MedicationRecord',
          severity: 'error',
        });
      }
      break;
    }

    case 'ConditionRecord': {
      if (!hasNonEmptyString(rec, 'conditionName')) {
        errors.push({
          field: 'conditionName',
          message: 'conditionName is required for ConditionRecord',
          severity: 'error',
        });
      }
      const status = rec['status'];
      if (typeof status !== 'string' || !VALID_CONDITION_STATUSES.has(status)) {
        errors.push({
          field: 'status',
          message: `status "${String(status ?? '')}" must be a valid ConditionStatus (active, resolved, remission, inactive)`,
          severity: 'error',
        });
      }
      break;
    }

    case 'AllergyRecord': {
      if (!hasNonEmptyString(rec, 'allergen')) {
        errors.push({
          field: 'allergen',
          message: 'allergen is required for AllergyRecord',
          severity: 'error',
        });
      }
      break;
    }

    case 'LabResultRecord': {
      if (!hasNonEmptyString(rec, 'testName')) {
        errors.push({
          field: 'testName',
          message: 'testName is required for LabResultRecord',
          severity: 'error',
        });
      }
      if (!hasField(rec, 'resultValue')) {
        errors.push({
          field: 'resultValue',
          message: 'resultValue is required for LabResultRecord',
          severity: 'error',
        });
      }
      if (!hasNonEmptyString(rec, 'resultUnit')) {
        errors.push({
          field: 'resultUnit',
          message: 'resultUnit is required for LabResultRecord',
          severity: 'error',
        });
      }
      break;
    }

    case 'VitalSign': {
      const vitalType = rec['vitalType'];
      if (typeof vitalType !== 'string' || !VALID_VITAL_TYPES.has(vitalType)) {
        errors.push({
          field: 'vitalType',
          message: `vitalType "${String(vitalType ?? '')}" must be a valid VitalType`,
          severity: 'error',
        });
      }
      if (!hasNumber(rec, 'value')) {
        errors.push({
          field: 'value',
          message: 'value is required for VitalSign and must be a number',
          severity: 'error',
        });
      }
      if (!hasNonEmptyString(rec, 'unit')) {
        errors.push({
          field: 'unit',
          message: 'unit is required for VitalSign',
          severity: 'error',
        });
      }
      break;
    }

    case 'ImmunizationRecord': {
      if (!hasNonEmptyString(rec, 'vaccineName')) {
        errors.push({
          field: 'vaccineName',
          message: 'vaccineName is required for ImmunizationRecord',
          severity: 'error',
        });
      }
      const status = rec['status'];
      if (status !== undefined && typeof status === 'string' && !VALID_IMMUNIZATION_STATUSES.has(status)) {
        errors.push({
          field: 'status',
          message: `status "${status}" must be a valid ImmunizationStatus`,
          severity: 'error',
        });
      }
      break;
    }

    case 'CoverageRecord':
    case 'InsurancePlan': {
      if (!hasNonEmptyString(rec, 'providerName')) {
        errors.push({
          field: 'providerName',
          message: 'providerName is required for Coverage records',
          severity: 'error',
        });
      }
      break;
    }

    case 'PatientProfile': {
      if (!hasNonEmptyString(rec, 'givenName')) {
        errors.push({
          field: 'givenName',
          message: 'givenName is required for PatientProfile',
          severity: 'error',
        });
      }
      if (!hasNonEmptyString(rec, 'familyName')) {
        errors.push({
          field: 'familyName',
          message: 'familyName is required for PatientProfile',
          severity: 'error',
        });
      }
      break;
    }

    // ActivitySnapshot, SleepSnapshot, ProcedureRecord, FamilyHistoryRecord
    // have no additional type-specific required field validations beyond base
    default:
      break;
  }

  return errors;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** Validate a single CascadeRecord for structural correctness. */
/**
 * Too many values for a field whose vocabulary caps them.
 *
 * The first check here that is not hand-transcribed. Every rule above restates
 * a constraint `spec` already declares — `sh:minCount`, `sh:in` — retyped from
 * a shapes file nothing diffs it against, which is why they drift in both
 * directions at once: `resultValue` is required here and has no `sh:minCount`
 * anywhere, while `health:interpretation`'s value set is unchecked and
 * `lab-010` is accepted with a value the shapes reject.
 *
 * This reads the cap off the term instead, so one declaration answers both the
 * writer and the validator. `termFor` is undefined for every field no module
 * claims, which is nearly all of them: this reports on the handful that are
 * termed and stays silent on the rest. Silent is the honest answer for a field
 * whose cardinality nothing in this SDK knows — the alternative is guessing at
 * 1 and rejecting conformant records, which is the defect above, reproduced.
 *
 * The COUNT is what the graph would carry, not what the JSON looks like: a bare
 * scalar is one value and an array is its length, because `emitField` writes one
 * triple per member either way. An absent field is nothing to count.
 */
function validateAgainstTerms(record: CascadeEntity): ValidationError[] {
  const errors: ValidationError[] = [];
  const rec: RecordFields = { ...record };

  // Rules about a value that is PRESENT. Walking the record is enough.
  for (const [field, value] of Object.entries(rec)) {
    const term = termFor(field);
    if (!term) continue;
    if (value === undefined || value === null) continue;
    const members = Array.isArray(value) ? value : [value];

    // An absent maxCount is UNCONSTRAINED, not unknown — `cascade:PatientProfileShape`
    // declares none for `cascade:emergencyContact`, so a profile may name several
    // people to call. Reading it as 1 would reject a conformant record.
    if (term.maxCount !== undefined && members.length > term.maxCount) {
      errors.push({
        field,
        message:
          `${field} carries ${members.length} values; the vocabulary permits ` +
          `at most ${term.maxCount}`,
        severity: 'error',
      });
    }

    // Every member, not just the first: a 0..* coded field can be wrong in its
    // second value, and reporting only the first would be the same partial
    // answer the reader used to give.
    if (term.values) {
      for (const member of members) {
        if (typeof member !== 'string' || term.values.includes(member)) continue;
        errors.push({
          field,
          message: `${field} "${member}" is not one of the ${term.values.length} values the vocabulary admits`,
          severity: 'error',
        });
      }
    }
  }

  // Rules about a value that is ABSENT, which no walk of the record can reach.
  // Per record type: an sh:minCount sits inside one node shape, so a field
  // required of a PatientProfile means nothing on a lab result.
  for (const term of allTerms()) {
    const required = ownEntry(term.minCountByType, record.type);
    if (required === undefined || required < 1) continue;
    if (hasField(rec, term.key)) continue;

    errors.push({
      field: term.key,
      message: `${term.key} is required for ${record.type}`,
      severity: 'error',
    });
  }

  return errors;
}

/**
 * Read a key's OWN value out of a lookup table, never an inherited one.
 *
 * `minCountByType` is a plain object literal indexed by DATA — `record.type` —
 * so a record typed `'toString'` or `'constructor'` would otherwise resolve
 * `Object.prototype`'s member and be reported as requiring a field. `defineTerm`
 * guards its own lookups the same way.
 */
function ownEntry<T>(table: Record<string, T> | undefined, key: string | undefined): T | undefined {
  if (table === undefined || key === undefined) return undefined;
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
}

export function validate(record: CascadeEntity): ValidationResult {
  const baseErrors = validateBase(record);
  const typeErrors = validateTypeSpecific(record);
  const termErrors = validateAgainstTerms(record);
  const warningErrors = validateWarnings(record);

  const allErrors = [...baseErrors, ...typeErrors, ...termErrors];
  const allWarnings = warningErrors;

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}

/** Validate an array of CascadeRecords, returning a combined result. */
export function validateAll(records: CascadeEntity[]): ValidationResult {
  const allErrors: ValidationError[] = [];
  const allWarnings: ValidationError[] = [];

  for (const record of records) {
    const result = validate(record);
    allErrors.push(...result.errors);
    allWarnings.push(...result.warnings);
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}
