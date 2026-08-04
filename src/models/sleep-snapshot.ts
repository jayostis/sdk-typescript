/**
 * Sleep snapshot data model for the Cascade Protocol.
 *
 * Represents a nightly sleep summary typically sourced from wearable
 * devices or HealthKit data.
 *
 * RDF type: `health:SleepSnapshot`
 * Vocabulary: `https://ns.cascadeprotocol.org/health/v1#`
 *
 * @see https://cascadeprotocol.org/docs/cascade-protocol-schemas
 */

import type { CascadeRecord } from './common.js';
import type { SleepQuality } from './daily-snapshot.js';

/**
 * A nightly sleep snapshot in the Cascade Protocol.
 *
 * Required fields: `date`, `dataProvenance`, `schemaVersion`.
 * The `date` field uses ISO 8601 date format (YYYY-MM-DD).
 *
 * Serializes as `health:SleepSnapshot` in Turtle.
 */
export interface SleepSnapshot extends CascadeRecord {
  type: 'SleepSnapshot';

  /**
   * Date of the sleep session (ISO 8601 date: `YYYY-MM-DD`).
   * Maps to `health:date` in Turtle serialization.
   */
  date: string;

  /**
   * Total sleep duration in minutes.
   * Maps to `health:totalSleepMinutes` in Turtle serialization.
   */
  totalSleepMinutes?: number;

  /**
   * Deep sleep duration in minutes.
   * Maps to `health:deepSleepMinutes` in Turtle serialization.
   */
  deepSleepMinutes?: number;

  /**
   * REM sleep duration in minutes.
   * Maps to `health:remSleepMinutes` in Turtle serialization.
   */
  remSleepMinutes?: number;

  /**
   * Light sleep duration in minutes.
   * Maps to `health:lightSleepMinutes` in Turtle serialization.
   */
  lightSleepMinutes?: number;

  /**
   * Number of awakenings during the sleep session.
   * Maps to `health:awakenings` in Turtle serialization.
   */
  awakenings?: number;

  /**
   * Qualitative classification of the sleep session, as derived by the
   * recording device. One of the four `health:SleepQuality` named individuals
   * defined in health v2.5.
   * Maps to `health:sleepQuality`, emitted as an IRI (`health:Good`).
   */
  sleepQuality?: SleepQuality;
}
