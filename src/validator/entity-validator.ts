/**
 * One record type's rules, declared where that record type is declared.
 *
 * A subclass lives in `src/models/validators/`, one file per record type, next
 * to the models it judges but not inside them — a model compiles to `export {};`
 * and every import of one is an `import type`, so putting a class there would
 * make models ship code. The rules those subclasses replace live in a `case` of
 * `validateTypeSpecific`, in a different file from the model, which is how
 * `givenName` came to be required by a switch, declared by a model, and
 * required by no shape at all.
 *
 * WHY A CLASS AND NOT A CONSTANT. `constraints()` is ABSTRACT, so a subclass
 * that declares none cannot be constructed — `tsc` refuses it. A `static`
 * property cannot do that: statics are inherited, so a subclass that forgot one
 * would silently get the base's empty set and report nothing, which is the
 * quiet-pass failure this whole layer exists to avoid.
 *
 * WHY NOT A METHOD ON THE RECORD ITSELF. A record reaching `validate()` came
 * from `JSON.parse` — off disk, out of a pod, from an EHR import — so it is a
 * plain object with no prototype and no methods. `validate()` spreads it into
 * `Record<string, unknown>` before any check runs. An instance method would
 * typecheck and then throw `is not a function` on every real input. The
 * validator is a separate object, looked up by `record.type`, which is the one
 * thing the data itself carries.
 *
 * IT ANSWERS COMPLETELY. `validate()` forks on `record.type` and delegates
 * here, and nothing runs afterwards — so a subclass's answer is the whole
 * verdict, base fields included. That is what makes the fork a REPLACEMENT
 * rather than a supplement, and why the legacy chain can be deleted a record
 * type at a time instead of refactored: a type either has a validator and uses
 * nothing else, or has none and uses the old path.
 *
 * @module validator/entity-validator
 */

import type { Severity } from '../terms/index.js';
import type { CascadeRecord, CascadeEntity } from '../models/common.js';
import { termFindings } from './term-findings.js';
import { CURRENT_SCHEMA_VERSION } from '../vocabularies/namespaces.js';
import type { ProvenanceType } from '../models/common.js';

/**
 * The provenance values the vocabulary admits.
 *
 * Lives here rather than in validator.ts so both the base class and the legacy
 * chain read ONE list: validator.ts already reaches this module through the
 * registry, so the dependency runs one way.
 */
export const VALID_PROVENANCE_TYPES: ReadonlySet<string> = new Set<ProvenanceType>([
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

/** What a record's own fields are read as, once it has been spread. */
export type RecordFields = Record<string, unknown>;

/**
 * A finding about one field.
 *
 * Structurally identical to `ValidationError` in `validator.ts`, and declared
 * here rather than imported to keep this module free of a cycle: `validator.ts`
 * will import the registry, so it cannot also be imported by it.
 */
export interface Finding {
  readonly field: string;
  readonly message: string;
  readonly severity: Severity;
}

/**
 * What a shape says about one field, in the vocabulary a term already uses.
 *
 * The names are `sh:` names on purpose. Each one is transcribed from a
 * `sh:property` block, and a reader holding the shape open should be able to
 * check this line by line without translating.
 *
 * NO `minLength`, AND NO `maxCount` ON A TERMED FIELD. Both are facts about a
 * PREDICATE — true wherever it appears, not just on this record type — and both
 * are declared on the term instead. `sh:minLength` was measured before it moved:
 * 30 property blocks, 28 predicates, every one `sh:minLength 1`, with no
 * variation even for the two predicates that appear in two shapes. A field that
 * has no term therefore has no length check, which is the same answer `maxCount`
 * gives and for the same reason — the fix is to declare the term.
 *
 * `minCount` stays here because it does NOT generalise: `clinical:procedureName`
 * carries an `sh:minLength 1` and no `sh:minCount` at all, so a length rule and
 * a presence rule about one predicate genuinely live in different places.
 *
 * ── WHAT THE SHAPES SAY AND THIS DOES NOT YET READ ────────────────────────────
 *
 * Counted over the four vocabularies `spec-sources.json` declares. Three constraints are
 * modelled — `sh:minCount` (136), `sh:maxCount` (381, on the term), `sh:in` (96,
 * on the term) — plus `sh:minLength` (30, on the term). Everything below is
 * published, judged by `pyshacl` in the conformance corpus, and invisible to
 * `validate()`, which is the only judge a consumer can reach.
 *
 * NONE OF IT IS BLOCKED ON A DESIGN QUESTION. The list is unbuilt, not
 * impossible. It splits three ways only by WHERE each belongs:
 *
 *   1. STRAIGHT INTO THIS INTERFACE — one field, one comparison, one more
 *      optional key and one more branch in `constraintFindings`, exactly what
 *      `minLength` was before it moved to the term:
 *        sh:datatype  360   sh:minInclusive 42   sh:pattern    38
 *        sh:maxInclusive 17 sh:nodeKind     14   sh:maxLength   4
 *      `sh:datatype` is the largest single gap in the SDK's judgement and the
 *      one that lets `medicationName: 42` validate clean today.
 *
 *   2. ON THE CLASS, NOT IN THIS BAG — not per-field, so `Constraint` is the
 *      wrong shape for them and {@link CascadeEntityValidator} is the right one:
 *        sh:or     27  a disjunction across paths — what `crossFieldFindings`
 *                      exists for; see MedicationValidator for a rule that is
 *                      already this and is not yet a shape
 *        sh:node   27  shape composition — validator inheritance, which
 *                      `additionalConstraints()` is already documented as
 *                      supporting
 *        sh:closed  2  a whole-record rule; the term system's undeclared-child
 *                      check is the same idea one level down
 *
 *   3. REPRESENTABLE BUT NOT CHECKABLE FROM HERE — `sh:class` (26) and
 *      `sh:qualifiedValueShape` (2) constrain the TYPE OF THE REFERENT of an
 *      IRI. Writing that down is easy; answering it needs the pod, and
 *      `validate()` is handed one record. A missing input, not a missing type.
 *
 * ALSO UNREAD, AND NOT A CONSTRAINT: `sh:message` (277). The shapes ship their
 * own authored wording — "Insurance provider name is required" is spec's
 * sentence, not this SDK's — and every message here is hand-written beside it.
 * A generated validator would emit the shape's, and the messages would stop
 * being a thing tests pin independently of the vocabulary.
 *
 * THE RULE FOR WHATEVER READS THIS NEXT: a construct that is not implemented
 * must FAIL rather than be skipped. A generator that silently drops the 38
 * `sh:pattern`s emits a validator that looks complete and accepts records the
 * shapes reject — the vacuous pass, mass-produced. That obligation does not go
 * away as the list shrinks; it holds until the list is empty.
 */
export interface Constraint {
  /** `sh:minCount 1`. Absent means the field may be omitted. */
  readonly minCount?: 1;
  /** `sh:maxCount`. ABSENT MEANS UNCONSTRAINED, not 1 — reading it as 1 rejects conformant records. */
  readonly maxCount?: number;
  /** `sh:in`. Absent means any value. */
  readonly values?: readonly string[];
}

/**
 * The keys of `T` that are NOT optional.
 *
 * `{} extends Pick<T, K>` is the standard test: an optional property makes the
 * one-key object satisfiable by `{}`, a required one does not.
 */
type RequiredKeys<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? never : K }[keyof T];

/**
 * The fields a record type ADDS, past the four every record carries.
 *
 * A per-type validator has no business declaring `id` or `schemaVersion`: those
 * are checked once for every record, including the many types that will never
 * have a validator here.
 */
type OwnKeys<T> = Exclude<keyof T, keyof CascadeRecord>;

/**
 * What a validator must declare about its record type.
 *
 * THE INTERFACE DRIVES THIS. Every own field the model marks REQUIRED must
 * appear with `minCount: 1`, and omitting one is a compile error naming the
 * field. Optional fields may be declared or left out. So the model stays the
 * readable statement of what a record has, and this cannot drift from it —
 * which is the whole defect this layer exists to answer: `givenName` was
 * required by a switch, declared by a model, and required by no shape at all.
 *
 * What the TYPE cannot say, and this must: `values`, and 1..*, since
 * `MultiValue<T>` admits the empty array. Length is not on that list — a term
 * says it, for every record type at once.
 */
export type Constraints<T> =
  { [K in Extract<RequiredKeys<T>, OwnKeys<T>>]: Constraint & { minCount: 1 } } &
  { [K in Exclude<OwnKeys<T>, RequiredKeys<T>>]?: Constraint };

export abstract class CascadeEntityValidator<T extends CascadeRecord> {
  /**
   * The `record.type` this judges, matching the model's literal — the string
   * the data carries, since nothing else about a parsed record identifies it.
   */
  abstract readonly type: T['type'];

  /**
   * What the shapes say about this record type's own fields.
   *
   * ABSTRACT, so forgetting it is a compile error rather than an empty set that
   * reports nothing. Returns a fresh object rather than a stored one so a
   * subclass can compose it — from its supertype's constraints, or eventually
   * from the terms that own the same fields.
   */
  abstract additionalConstraints(): Constraints<T>;

  /**
   * Rules that are not about one field, which a per-field constraint cannot
   * express: "effectiveEnd must not precede effectiveStart", "an inactive
   * medication may not carry a refill count".
   *
   * Empty by default, because most record types have none. This is the reason
   * the layer is a class at all — a table of per-field constraints has nowhere
   * to put a rule that spans two of them.
   */
  protected crossFieldFindings(_rec: RecordFields): readonly Finding[] {
    return [];
  }

  /**
   * EVERYTHING that is wrong with a record of this type. The whole answer.
   *
   * `validate()` forks on `record.type` and delegates here; nothing runs after
   * it. So this composes all four sources, and a subclass that declares its
   * fields inherits the other three without writing a line:
   *
   *   base        every record: id, schemaVersion, dataProvenance
   *   terms       predicate-level facts — value sets, caps, undeclared children
   *   constraints this record type's own fields, from `additionalConstraints`
   *   cross-field rules spanning two fields, from the hook below
   *
   * NOT OVERRIDDEN BY SUBCLASSES, and there is no reason one should: a record
   * type varies by which fields it has and what they must be, and both of those
   * are declared, not implemented. A subclass that overrode this would be
   * choosing to skip one of the four, which is the quiet-pass failure the whole
   * layer exists to prevent.
   *
   * `record.type` is NOT re-checked. The registry matched it to find this
   * validator; checking again would only be able to report a wrong lookup, and
   * it would report it as every required field being absent.
   */
  validate(rec: RecordFields): readonly Finding[] {
    return [
      ...this.baseFindings(rec),
      ...termFindings(rec as unknown as CascadeEntity),
      ...this.constraintFindings(rec),
      ...this.crossFieldFindings(rec),
    ];
  }

  /**
   * The four fields every record carries, checked once here rather than by each
   * subclass.
   *
   * `type` is absent from this list on purpose — see {@link validate}.
   *
   * prov:Agent and prov:Activity subjects carry no `schemaVersion` or
   * `dataProvenance` and are not `CascadeRecord`s, so they need a different base
   * than this one rather than a flag here. None has a validator yet.
   */
  protected baseFindings(rec: RecordFields): readonly Finding[] {
    const findings: Finding[] = [];

    const id = singleStringFinding(rec['id'], 'id', 'id must be present and non-empty');
    if (id) findings.push(id);

    const schemaVersion = singleStringFinding(
      rec['schemaVersion'],
      'schemaVersion',
      'schemaVersion must be present',
    );
    if (schemaVersion) findings.push(schemaVersion);

    // The VALUE and not just the presence. `dataProvenance` is bound to an
    // `sh:in` list on every record shape, and a record naming a provenance the
    // vocabulary does not have is as wrong as one naming none.
    const provenance = rec['dataProvenance'];
    if (typeof provenance !== 'string' || !VALID_PROVENANCE_TYPES.has(provenance)) {
      findings.push({
        field: 'dataProvenance',
        message: `dataProvenance "${asText(provenance)}" is not a valid ProvenanceType`,
        severity: 'error',
      });
    }

    // A record written against an older vocabulary is READABLE, not wrong, so
    // this is a warning and `valid` stays true. Reported only when the field is
    // present: an absent one is already an error above, and saying both would
    // report one defect twice.
    const version = rec['schemaVersion'];
    if (typeof version === 'string' && version.trim() !== '' && version !== CURRENT_SCHEMA_VERSION) {
      findings.push({
        field: 'schemaVersion',
        message:
          `schemaVersion "${version}" does not match current version ` +
          `"${CURRENT_SCHEMA_VERSION}"`,
        severity: 'warning',
      });
    }

    return findings;
  }

  /**
   * The per-field half, walked from {@link constraints}.
   *
   * `values` is DELIBERATELY NOT CHECKED HERE, and `minLength` is no longer
   * declarable at all: both are carried by the term modules, and a second
   * implementation is how two checks of one rule come to disagree. That
   * question was open when this method was written and is now answered —
   * `sh:minLength` is invariant per predicate across every shape that declares
   * one, so it is a term fact, and `Constraint` dropped the field rather than
   * keep a name nothing reads. This method covers presence and arity only.
   */
  protected constraintFindings(rec: RecordFields): readonly Finding[] {
    const findings: Finding[] = [];

        // Widened to walk it. `Constraints<T>` is an intersection of two mapped
    // types, so `Object.entries` cannot see past it to the value type — the
    // per-field precision is for the SUBCLASS declaring the table, and this
    // loop only ever reads it back as what it structurally is.
    const declared = this.additionalConstraints() as Readonly<Record<string, Constraint>>;

    for (const [field, constraint] of Object.entries(declared)) {
      const value = rec[field];
      const members = value === undefined || value === null ? [] : asMembers(value);

      if (constraint.minCount === 1 && members.length === 0) {
        findings.push({
          field,
          message: `${field} is required for ${this.type}`,
          severity: 'error',
        });
      }

      if (constraint.maxCount !== undefined && members.length > constraint.maxCount) {
        findings.push({
          field,
          message:
            `${field} carries ${members.length} values; the vocabulary permits ` +
            `at most ${constraint.maxCount}`,
          severity: 'error',
        });
      }
    }

    return findings;
  }
}

/**
 * A field's values, however the caller spelled them.
 *
 * A `0..*` field is `T | T[]` in every model (`MultiValue`), because RDF has no
 * "list of one" for a repeated predicate and returning an array for a single
 * value would invent structure the graph does not carry. Counting has to see
 * through both spellings or a one-element array reads as one value and a bare
 * value reads as none.
 */
function asMembers(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [value];}

/**
 * The finding a required base field earns when it is not one non-empty string.
 *
 * AN ARRAY IS REPORTED AS WHAT IT IS, not as "must be present". The reader is
 * faithful — every triple it finds, whatever the field's declared cardinality —
 * so a document with two `cascade:schemaVersion` triples comes back carrying
 * `["1.3", "1.4"]`. That field IS present, twice, and a message saying it is
 * missing sends a caller looking for something they supplied.
 *
 * `typeof` before `.trim()` for the same reason: an array reaching a string
 * method throws out of `validate()` itself, and a judge that dies on the input
 * its own faithfulness produces reports nothing about the document at all —
 * not the duplicate, and not the eight other things wrong with it.
 */
function singleStringFinding(
  value: unknown,
  field: string,
  absent: string,
): Finding | undefined {
  if (typeof value === 'string' && value.trim().length > 0) return undefined;

  return {
    field,
    message: Array.isArray(value)
      ? `${field} carries ${value.length} values; it must be a single non-empty string`
      : absent,
    severity: 'error',
  };
}

/** A value as it should read inside a message, without throwing on an array. */
function asText(value: unknown): string {
  if (value === undefined || value === null) return '';
  return Array.isArray(value) ? value.map(String).join(', ') : String(value);
}
