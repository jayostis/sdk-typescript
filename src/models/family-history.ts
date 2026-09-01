/**
 * Family history data model for the Cascade Protocol.
 *
 * Represents a family health history entry recording medical conditions
 * in the patient's relatives.
 *
 * RDF type: `health:FamilyHistoryRecord`
 * Vocabulary: `https://ns.cascadeprotocol.org/health/v1#`
 *
 * @see https://cascadeprotocol.org/docs/cascade-protocol-schemas
 */

import type { CascadeRecord } from './common.js';

/**
 * A family history record in the Cascade Protocol.
 *
 * Required fields: `relationship`, `conditionName`, `dataProvenance`, `schemaVersion`.
 *
 * Serializes as `health:FamilyHistoryRecord` in Turtle.
 */
export interface FamilyHistory extends CascadeRecord {
  type: 'FamilyHistoryRecord';

  /**
   * Relationship of the family member to the patient (e.g., `"mother"`, `"father"`, `"sibling"`).
   * Maps to `clinical:relationship` in Turtle serialization.
   */
  relationship: string;

  /**
   * Name of the condition reported in the family member.
   * Maps to `health:conditionName` in Turtle serialization.
   */
  conditionName: string;

  /**
   * Age of onset for the family member's condition.
   * Maps to `health:onsetAge` in Turtle serialization.
   */
  onsetAge?: number;
}
