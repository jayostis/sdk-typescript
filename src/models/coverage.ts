/**
 * Coverage / Insurance data model for the Cascade Protocol.
 *
 * Represents an insurance coverage or plan record.
 *
 * RDF type WRITTEN: `coverage:InsurancePlan`. `clinical:CoverageRecord` has
 * been deprecated in favour of it since clinical v1.5 (`clinical.ttl:187`) and
 * is a spelling this SDK READS and never writes — see
 * `DEPRECATED_TYPE_ALIASES`. Its predicates are read too, so a pod written in
 * the old form still comes back in full.
 *
 * Vocabularies:
 * - `https://ns.cascadeprotocol.org/clinical/v1#`
 * - `https://ns.cascadeprotocol.org/coverage/v1#`
 *
 * @see https://cascadeprotocol.org/docs/cascade-protocol-schemas
 */

import type {
  CascadeRecord,
  PlanType,
  CoverageType,
  CoverageStatus,
  SubscriberRelationship,
} from './common.js';

/**
 * A coverage / insurance record in the Cascade Protocol.
 *
 * Required fields: `providerName`, `dataProvenance`, `schemaVersion`.
 * All date fields use ISO 8601 string format.
 *
 * Serializes as `coverage:InsurancePlan` in Turtle.
 */
export interface Coverage extends CascadeRecord {
  /**
   * `'InsurancePlan'` only. The `'CoverageRecord'` spelling this union used to
   * admit named a class deprecated since clinical v1.5, and nothing in this SDK
   * writes it any more; a record still carrying it would serialize as an
   * InsurancePlan with its predicates left in the clinical vocabulary, which is
   * the one state `coverage:InsurancePlanShape` reports as three missing
   * required fields on data that has them.
   */
  type: 'InsurancePlan';

  /**
   * Name of the insurance provider.
   * Maps to `coverage:providerName` in Turtle serialization; `clinical:providerName` is read.
   */
  providerName: string;

  /**
   * Lifecycle state of the coverage record itself (coverage v1.5): whether the
   * plan is in force, was cancelled, is still a draft, or was entered in error.
   *
   * FHIR R4 `Coverage.status`, `code` 1..1 with a REQUIRED binding. Through
   * coverage v1.4 `coverage:InsurancePlan` had no status property at all, so an
   * importer reading a conformant Coverage resource had to discard the one
   * element FHIR requires it to carry. `claimStatus` and `adjudicationStatus`
   * are NOT substitutes: they belong to the denial/appeal workflow and describe
   * what happened to a claim, not whether the plan is in force.
   *
   * Optional here even though the source element is 1..1, matching the shape,
   * which deliberately omits `sh:minCount`: no producer has yet had the chance
   * to write it, and requiring it would turn every existing plan record red.
   *
   * WRITTEN ONLY on a record typed `InsurancePlan`. `status` already resolves to
   * `health:status` for a condition, so the `coverage:` spelling is selected by
   * a record-type override in the serializer.
   *
   * Maps to `coverage:status` in Turtle serialization.
   */
  status?: CoverageStatus;

  /**
   * Member identifier for the insured individual.
   * Maps to `coverage:memberId` in Turtle serialization; `clinical:memberId` is read.
   */
  memberId?: string;

  /**
   * Group number for the insurance plan.
   * Maps to `coverage:groupNumber` in Turtle serialization; `clinical:groupNumber` is read.
   */
  groupNumber?: string;

  /**
   * Name of the insurance plan.
   * Maps to `coverage:planName` in Turtle serialization; `clinical:planName` is read.
   */
  planName?: string;

  /**
   * Type of insurance plan.
   * Maps to `coverage:planType` in Turtle serialization; `clinical:planType` is read.
   */
  planType?: PlanType | string;

  /**
   * Coverage designation (primary, secondary, supplemental).
   * Maps to `coverage:coverageType` in Turtle serialization; `clinical:coverageType` is read.
   */
  coverageType?: CoverageType | string;

  /**
   * Subscriber relationship to plan holder.
   * Maps to `clinical:relationship` or `coverage:subscriberRelationship` in Turtle serialization.
   */
  relationship?: SubscriberRelationship | string;

  /**
   * Alias for `relationship` used in the coverage vocabulary.
   * Maps to `coverage:subscriberRelationship` in Turtle serialization.
   */
  subscriberRelationship?: SubscriberRelationship | string;

  /**
   * Start date of the coverage period (ISO 8601).
   * Maps to `clinical:effectivePeriodStart` in Turtle serialization.
   */
  effectivePeriodStart?: string;

  /**
   * End date of the coverage period (ISO 8601).
   * Maps to `clinical:effectivePeriodEnd` in Turtle serialization.
   */
  effectivePeriodEnd?: string;

  /**
   * Start date of effectiveness (ISO 8601, coverage vocabulary).
   * Maps to `coverage:effectiveStart` in Turtle serialization.
   */
  effectiveStart?: string;

  /**
   * End date of effectiveness (ISO 8601, coverage vocabulary).
   * Maps to `coverage:effectiveEnd` in Turtle serialization.
   */
  effectiveEnd?: string;

  /**
   * Name of the payor organization.
   * Maps to `clinical:payorName` in Turtle serialization.
   */
  payorName?: string;

  /**
   * Subscriber identifier for the plan holder.
   * Maps to `coverage:subscriberId` in Turtle serialization; `clinical:subscriberId` is read.
   */
  subscriberId?: string;

  /**
   * Name of the primary subscriber on the plan.
   * Maps to `coverage:subscriberName` in Turtle serialization.
   */
  subscriberName?: string;

  /**
   * Pharmacy BIN (Bank Identification Number) for prescription benefits.
   * Maps to `coverage:rxBin` in Turtle serialization.
   */
  rxBin?: string;

  /**
   * Pharmacy PCN (Processor Control Number) for prescription benefits.
   * Maps to `coverage:rxPcn` in Turtle serialization.
   */
  rxPcn?: string;

  /**
   * Pharmacy group number for prescription benefits.
   * Maps to `coverage:rxGroup` in Turtle serialization.
   */
  rxGroup?: string;
}
