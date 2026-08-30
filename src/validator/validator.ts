import type { CascadeEntity, ProvenanceType } from '../models/common.js';
import { CURRENT_SCHEMA_VERSION } from '../vocabularies/namespaces.js';
import { allTerms, termFor } from '../terms/index.js';
import { childPredicateFor, ruleFor, severityFor, undeclaredChildKeys } from '../terms/term.js';
import type { Severity } from '../terms/term.js';

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

/** {@link singleStringError} for a required field of a record under test. */
function requiredString(
  rec: RecordFields,
  field: string,
  absent: string,
): ValidationError | undefined {
  return singleStringError(rec[field], field, absent);
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
    case 'MedicationRecord': {
      const nameError = requiredString(rec, 'medicationName', 'medicationName is required for MedicationRecord');
      if (nameError) errors.push(nameError);
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
      const nameError = requiredString(rec, 'conditionName', 'conditionName is required for ConditionRecord');
      if (nameError) errors.push(nameError);
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
      const allergenError = requiredString(rec, 'allergen', 'allergen is required for AllergyRecord');
      if (allergenError) errors.push(allergenError);
      break;
    }

    case 'LabResultRecord': {
      const testNameError = requiredString(rec, 'testName', 'testName is required for LabResultRecord');
      if (testNameError) errors.push(testNameError);
      if (!hasField(rec, 'resultValue')) {
        errors.push({
          field: 'resultValue',
          message: 'resultValue is required for LabResultRecord',
          severity: 'error',
        });
      }
      const resultUnitError = requiredString(rec, 'resultUnit', 'resultUnit is required for LabResultRecord');
      if (resultUnitError) errors.push(resultUnitError);
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
      const unitError = requiredString(rec, 'unit', 'unit is required for VitalSign');
      if (unitError) errors.push(unitError);
      break;
    }

    case 'ImmunizationRecord': {
      const vaccineNameError = requiredString(rec, 'vaccineName', 'vaccineName is required for ImmunizationRecord');
      if (vaccineNameError) errors.push(vaccineNameError);
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
      const providerNameError = requiredString(rec, 'providerName', 'providerName is required for Coverage records');
      if (providerNameError) errors.push(providerNameError);
      break;
    }

    case 'PatientProfile': {
      const givenNameError = requiredString(rec, 'givenName', 'givenName is required for PatientProfile');
      if (givenNameError) errors.push(givenNameError);
      const familyNameError = requiredString(rec, 'familyName', 'familyName is required for PatientProfile');
      if (familyNameError) errors.push(familyNameError);
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

    // The severity this term's rules carry ON THIS RECORD TYPE, from the shape
    // that governs it. Read once and applied to every rule below, because
    // `sh:severity` belongs to the property shape rather than to any one
    // constraint inside it: a shape at sh:Warning reports its datatype, its
    // maxCount and its value set alike at Warning.
    //
    // The undeclared-child check above is NOT given it. That rule comes from
    // the term's `children` map and not from a shape at all, so there is no
    // `sh:severity` to read; an undeclared child is an error everywhere.
    const severity = severityFor(term, record.type);

    // An absent maxCount is UNCONSTRAINED, not unknown — `cascade:PatientProfileShape`
    // declares none for `cascade:emergencyContact`, so a profile may name several
    // people to call. Reading it as 1 would reject a conformant record.
    if (term.maxCount !== undefined && members.length > term.maxCount) {
      errors.push({
        field,
        message:
          `${field} carries ${members.length} values; the vocabulary permits ` +
          `at most ${term.maxCount}`,
        severity,
      });
    }

    // A CHILD OF A BLANK NODE that the term declares no rule for.
    //
    // The writer emits it — `childrenOf` writes every present key — so the
    // triple is in the graph under `cascade:<key>`, a predicate no `sh:path`
    // declares. This is the only place that is reportable. Nothing in
    // `tests/shapes/` is `sh:closed`, so SHACL returns `conforms: true` on such
    // a graph, indistinguishable from one that satisfied every constraint; and
    // the shapes are a devDependency besides, so a consumer's only judge is
    // this function. `spec` issue jayostis/spec#2 asks for the shape to close,
    // which would make the corpus able to see it too — this check is what
    // covers the installed package either way.
    //
    // Read off the term, exactly as `maxCount` and `values` above are: the
    // declared children ARE the legal set, which is why `address` declares
    // `cascade:AddressShape`'s five simplified aliases even though the `Address`
    // model does not. A term whose `children` map is short of its shape turns
    // this into a false rejection, and `tests/terms/children-complete.test.ts`
    // is what stops that being discovered by a caller.
    const rule = ruleFor(term, record.type);
    for (const child of undeclaredChildKeys(rule, value)) {
      errors.push({
        field: `${field}.${child}`,
        message:
          `${field} carries a nested "${child}", which no vocabulary declares; ` +
          // THE SPELLING THE WRITER USES, from the writer's own function.
          // Interpolating `${prefix}:${child}` here was right for every child
          // whose key is a JSON name and wrong for the one kind that is not: a
          // predicate from another namespace comes back from
          // `recoverableChildKey` as a full IRI, the writer emits
          // `<https://other.example.org/ns#wardCount>`, and this named
          // `cascade:https://other.example.org/ns#wardCount` — a predicate
          // nothing writes, in a message whose whole job is to name the one
          // that is written.
          `${childPredicateFor(child, rule.nestedPrefix ?? 'cascade')} is written ` +
          `under no domain, range or shape`,
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
          severity,
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
      // Off the shape, exactly as `maxCount` and `values` above are.
      // `severityByType` is documented on `TermSpec` as governing every rule
      // the term declares for the type, and `sh:severity` belongs to the
      // property shape rather than to any one constraint inside it — a shape at
      // sh:Warning reports its minCount at Warning too. Hardcoded 'error' here
      // was latent only because no term declares both today; the day one does,
      // a shape saying "reported, not rejected" would REJECT, because `valid`
      // is computed from `errors` alone. That is the verdict flip the severity
      // plumbing was added to prevent, and it would have shipped as a
      // conformant record refused.
      severity: severityFor(term, record.type),
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

/**
 * Validate a single CascadeRecord for structural correctness.
 *
 * THE ONLY JUDGE THAT SHIPS. `rdf-validate-shacl` is a devDependency and
 * `tests/shapes/` is not in `package.json`'s `files`, so nothing a consumer
 * installs can reach SHACL: anything the shapes should catch in production has
 * to be reachable from here.
 *
 * Three layers, and they answer different questions. `validateBase` and the
 * per-type checks are hand-transcribed from the shapes and drift in both
 * directions; `validateAgainstTerms` reads its rules off the term, so one
 * declaration answers the writer and the validator both; `validateWarnings`
 * reports what is legal and probably unintended. Errors decide `valid`,
 * warnings never do.
 */
export function validate(record: CascadeEntity): ValidationResult {
  const baseErrors = validateBase(record);
  const typeErrors = validateTypeSpecific(record);
  const termErrors = validateAgainstTerms(record);
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
  const found = [...baseErrors, ...typeErrors, ...termErrors, ...warningErrors];
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
