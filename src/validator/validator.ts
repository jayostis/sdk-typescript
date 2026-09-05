import type { CascadeEntity } from '../models/common.js';
import { isMigrated } from '../migration/index.js';
import { recordTypeFor } from '../record-types/index.js';
import { CURRENT_SCHEMA_VERSION } from '../vocabularies/namespaces.js';
import type { Severity } from '../terms/index.js';
import { validatorFor } from './entity-validator-registry.js';
import { VALID_PROVENANCE_TYPES } from './entity-validator.js';
import { routedFindings } from './routed.js';
import { termFindings } from './term-findings.js';

// ─── Public Types ───────────────────────────────────────────────────────────

export interface ValidationError {
  readonly field: string;
  readonly message: string;
  readonly severity: Severity;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly ValidationError[];
  readonly warnings: readonly ValidationError[];
  /**
   * Findings the vocabulary grades `sh:Info` — worth saying, never a defect.
   *
   * ITS OWN ARRAY rather than an `'info'` severity filed under `warnings`,
   * because the array is how a caller reads a verdict: everything in `errors`
   * says `'error'` and everything in `warnings` says `'warning'`, so a third
   * grade folded into the second would be reachable only by filtering an array
   * named for something else. Nobody reads a type union to discover that.
   *
   * A pod importer blocks on `errors`; a migration tool watches `warnings` to
   * see a ratchet step go quiet; a linting UI shows all three.
   *
   * ADDITIVE. Code reading `errors` and `warnings` is unaffected, except that an
   * Info-graded finding stops arriving in `errors` — which is the defect this
   * fixes rather than a change of contract.
   */
  readonly info: readonly ValidationError[];
}

// ─── Internal Constants ─────────────────────────────────────────────────────


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

// Types that should ideally have coding system references.
//
// TYPES ON THE LEGACY PATH ONLY. `validate()` returns early for a record type
// with a validator, so `validateWarnings` never runs for one — an entry here
// for a migrated type is unreachable, and the entry is what someone edits.
// `MedicationRecord` was listed and was dead: its copy of this rule is
// `MedicationValidator.crossFieldFindings`, and editing this set would have
// left medications following the old text with nothing to say so.
//
// A validator migrating a type takes this rule with it and removes the name,
// the same way it deletes its `case` from `validateTypeSpecific`. The set
// empties as the migration finishes, and goes when the last type lands.
//
// A type ROUTED on `'validate'` (`src/migration/allow-list.ts`) leaves the
// same way, and takes NO copy of the rule with it: a routed type gets the
// shipped shapes' answer and nothing else, and this warning is SDK policy
// transcribed by hand, not a constraint spec publishes. `ImmunizationRecord`
// was listed and was dead; the CHANGELOG entry for #98 writes the drop down.
const CLINICAL_TYPES_WANTING_CODES: ReadonlySet<string> = new Set([
  'ConditionRecord',
  'LabResultRecord',
  'VitalSign',
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


// ─── Validation Logic ───────────────────────────────────────────────────────

/**
 * The error a base field earns when it is not one non-empty string.
 *
 * `CascadeEntity` types `id` and `schemaVersion` as `string`, which describes
 * the CONFORMING case and not the input. The reader is faithful — every triple
 * it finds, whatever the field's declared cardinality — so a document with two
 * `cascade:schemaVersion` triples comes back carrying `["1.3", "1.4"]`, and
 * `.trim()` on that threw `TypeError` out of `validate()` itself.
 *
 * That is the worst available failure for this branch specifically. The whole
 * position is that the writer and reader move data and `validate()` judges it;
 * a judge that dies on exactly the input its own faithfulness produces reports
 * nothing about the document at all — not the duplicate, not the eight other
 * things wrong with it. A `typeof` guard is what keeps the judge alive.
 *
 * An ARRAY is reported as what it is rather than as "must be present". It IS
 * present, and a message naming the wrong defect sends the caller looking for a
 * missing field they supplied twice.
 *
 * EVERY required field goes through here, base and type-specific alike. Two
 * fields were fixed and a dozen were left with their own `typeof` check and an
 * "is required" message, which is the wrong-defect message this function was
 * introduced to remove — reachable on those fields for the first time now that
 * the reader returns what the graph actually carried.
 */
function singleStringError(
  value: unknown,
  field: string,
  absent: string,
): ValidationError | undefined {
  if (typeof value === 'string' && value.trim().length > 0) return undefined;
  return {
    field,
    message: Array.isArray(value)
      ? `${field} carries ${value.length} values; it must be a single non-empty string`
      : absent,
    severity: 'error',
  };
}

/**
 * {@link singleStringError} for a field whose one value must be a NUMBER.
 *
 * `clinical:value` is the only one today. Its own message already said "and
 * must be a number", so absence and wrong-type shared a message here before
 * arity joined them; this separates the count from the type and leaves the
 * other two exactly as they were.
 */
function singleNumberError(
  value: unknown,
  field: string,
  absent: string,
): ValidationError | undefined {
  if (typeof value === 'number') return undefined;
  return {
    field,
    message: Array.isArray(value)
      ? `${field} carries ${value.length} values; it must be a single number`
      : absent,
    severity: 'error',
  };
}

function validateBase(record: CascadeEntity): ValidationError[] {
  const errors: ValidationError[] = [];

  // 1. id must be present and non-empty
  const idError = singleStringError(record.id, 'id', 'id must be present and non-empty');
  if (idError) errors.push(idError);

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
  const schemaVersionError = singleStringError(
    record.schemaVersion,
    'schemaVersion',
    'schemaVersion must be present',
  );
  if (schemaVersionError) errors.push(schemaVersionError);

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
    case 'ConditionRecord': {
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

    case 'VitalSign': {
      const vitalType = rec['vitalType'];
      if (typeof vitalType !== 'string' || !VALID_VITAL_TYPES.has(vitalType)) {
        errors.push({
          field: 'vitalType',
          message: `vitalType "${String(vitalType ?? '')}" must be a valid VitalType`,
          severity: 'error',
        });
      }
      const valueError = singleNumberError(
        rec['value'],
        'value',
        'value is required for VitalSign and must be a number',
      );
      if (valueError) errors.push(valueError);
      break;
    }

    // ImmunizationRecord is routed on `'validate'` and never reaches this
    // switch; its `status` is judged by `health:ImmunizationRecordShape`'s
    // `sh:in` through `src/validator/routed.ts`.
    // ActivitySnapshot, SleepSnapshot, ProcedureRecord, FamilyHistoryRecord
    // have no additional type-specific required field validations beyond base
    default:
      break;
  }

  return errors;
}

// ─── Public API ─────────────────────────────────────────────────────────────


/**
 * Validate a single CascadeRecord for structural correctness.
 *
 * THE ONLY JUDGE THAT SHIPS. `rdf-validate-shacl` is a devDependency and the
 * shapes are read from a `spec` checkout that this package does not contain, so
 * nothing a consumer installs can reach it: anything the shapes should catch
 * in production has to be reachable from here. For a record type routed on
 * `'validate'` (`src/migration/allow-list.ts`) it is: the shapes ship as data
 * and `src/shacl/evaluate.ts` judges from them (#98). Every other type is
 * judged by the layers below.
 *
 * Three layers, and they answer different questions. `validateBase` and the
 * per-type checks are hand-transcribed from the shapes and drift in both
 * directions; `validateAgainstTerms` reads its rules off the term, so one
 * declaration answers the writer and the validator both; `validateWarnings`
 * reports what is legal and probably unintended. Errors decide `valid`,
 * warnings never do.
 */
export function validate(record: CascadeEntity): ValidationResult {
  // THE SEAM, above the fork below and mirroring `serialize()`'s at its
  // entry: a routed type gets the shipped shapes' answer and nothing else. Not
  // wrapped in a try/catch, for the reason the serializer seam gives —
  // `recordTypeFor` throws rather than answering `undefined` for a name two
  // classes claim, and catching it here would send a contested record down a
  // legacy path that never heard the question.
  const recordType = recordTypeFor(record.type);

  if (recordType && isMigrated(recordType.rdfTypeUri, 'validate')) {
    return verdictOf(routedFindings({ ...record } as Record<string, unknown>, recordType));
  }

  // THE FORK, and it is a REPLACEMENT rather than a supplement.
  //
  // A record type with a validator gets that validator's answer and nothing
  // else: `CascadeEntityValidator.validate` composes the base fields, the
  // term-level facts, the type's own constraints and its cross-field rules, so
  // running the chain below as well would report every finding twice.
  //
  // A record type without one takes the legacy path unchanged. That is what
  // lets this migrate a record type at a time — each new validator deletes its
  // `case` from `validateTypeSpecific`, and the switch, `RECOGNIZED_DATA_TYPES`
  // and this branch all go when the last one lands.
  const validator = validatorFor(record.type);
  if (validator) {
    return verdictOf(validator.validate({ ...record }));
  }

  const baseErrors = validateBase(record);
  const typeErrors = validateTypeSpecific(record);
  const termErrors = termFindings(record);
  const warningErrors = validateWarnings(record);

  // SEVERITY DECIDES THE BUCKET, not which function produced the finding.
  //
  // These four used to be positional: whatever `validateWarnings` returned was
  // a warning and everything else was an error, so `severity` was a label on a
  // decision already made. A term reading `sh:severity` off its shape breaks
  // that — `interpretation` on a vital sign is a warning raised by the same
  // walk that raises errors — and `valid` counts errors alone, so misfiling one
  // would reject a record spec accepts with a warning.
  // EACH GRADE NAMES ITS OWN BUCKET, and none is the default. An earlier form
  // of this read `severity !== 'warning'` for the errors, which is fail-CLOSED
  // in the worst direction: adding `'info'` would have filed every suggestion as
  // a defect and rejected the record, defeating the level it was added for. A
  // grade this does not know now reaches no bucket at all and is caught by the
  // total below rather than silently rejecting a record.
  return verdictOf([...baseErrors, ...typeErrors, ...termErrors, ...warningErrors]);
}

/**
 * Findings sorted into the verdict a caller reads.
 *
 * Shared by both sides of the fork above, so a record type gets the same
 * bucketing whether its rules came from a validator or from the legacy chain.
 * A second copy of this is how `valid` would come to mean two things.
 */
function verdictOf(found: readonly ValidationError[]): ValidationResult {
  const allErrors = found.filter((e) => e.severity === 'error');
  const allWarnings = found.filter((e) => e.severity === 'warning');
  const allInfo = found.filter((e) => e.severity === 'info');

  if (allErrors.length + allWarnings.length + allInfo.length !== found.length) {
    throw new Error(
      `validate() produced ${found.length} findings and filed ` +
        `${allErrors.length + allWarnings.length + allInfo.length}: a severity with no bucket. ` +
        'Every member of `Severity` needs a home here, or a finding disappears from the verdict.',
    );
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
    info: allInfo,
  };
}

/** Validate an array of CascadeRecords, returning a combined result. */
export function validateAll(records: CascadeEntity[]): ValidationResult {
  const allErrors: ValidationError[] = [];
  const allWarnings: ValidationError[] = [];
  const allInfo: ValidationError[] = [];

  for (const record of records) {
    const result = validate(record);
    allErrors.push(...result.errors);
    allWarnings.push(...result.warnings);
    allInfo.push(...result.info);
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
    info: allInfo,
  };
}
