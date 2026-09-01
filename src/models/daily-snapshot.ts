/**
 * Single-day wellness snapshot models for the Cascade Protocol health
 * vocabulary (health v2.5).
 *
 * These are the entries inside the `health:dailyActivityHistory` and
 * `health:dailySleepHistory` containers. They are DISTINCT from
 * {@link ActivitySnapshot} and {@link SleepSnapshot}, which carry the 7-day
 * aggregate forms (`health:activeEnergyBurnedKcal`,
 * `health:exerciseMinutesWeekly`, `health:standHoursDaily`). Both sets are
 * emitted and neither replaces the other.
 *
 * Note the date predicate: a daily snapshot carries `cascade:date`, per
 * `health:DailyActivitySnapshotShape` / `health:DailySleepSnapshotShape`,
 * whereas the aggregate snapshots carry `health:date`. Both spellings exist for
 * the same purpose and readers must handle both; the serializer here writes the
 * spelling each record type's shape requires.
 *
 * RDF types: `health:DailyActivitySnapshot`, `health:DailySleepSnapshot`
 * Vocabulary: `https://ns.cascadeprotocol.org/health/v1#`
 *
 * @see https://cascadeprotocol.org/docs/cascade-protocol-schemas
 */

import type { CascadeRecord } from './common.js';

/**
 * Qualitative classification of a night's sleep, as derived by the recording
 * device.
 *
 * These are the four `health:SleepQuality` named individuals defined in health
 * v2.5. `health:sleepQuality` is emitted with an IRI object (`health:Good`),
 * not a string literal; the serializer writes the prefixed form and the
 * deserializer strips it back to the local name used here.
 */
export type SleepQuality = 'Excellent' | 'Good' | 'Fair' | 'Poor';

/**
 * A single day's activity data.
 *
 * Serializes as `health:DailyActivitySnapshot` in Turtle.
 */
export interface DailyActivitySnapshot extends CascadeRecord {
  type: 'DailyActivitySnapshot';

  /**
   * Timestamp the snapshot applies to (ISO 8601). Required by
   * `health:DailyActivitySnapshotShape`.
   * Maps to `health:date` in Turtle serialization.
   */
  date: string;

  /**
   * Step count for the day.
   * Maps to `health:steps` in Turtle serialization.
   */
  steps?: number;

  /**
   * Active energy burned in kilocalories for the day.
   * Maps to `health:activeEnergyKcal` (`xsd:decimal`).
   */
  activeEnergyKcal?: number;

  /**
   * Minutes of exercise recorded for the day. Bounded 0–1440 by the shape.
   * Maps to `health:exerciseMinutes` in Turtle serialization.
   */
  exerciseMinutes?: number;

  /**
   * Hours in which standing was recorded for the day. Bounded 0–24 by the
   * shape. Maps to `health:standHours` in Turtle serialization.
   */
  standHours?: number;

  /**
   * Number of underlying samples aggregated into this snapshot. A reading
   * derived from 142 samples is a stronger observation than one derived from
   * 2, and consumers should be able to tell the difference.
   * Maps to `cascade:sampleCount` in Turtle serialization.
   */
  sampleCount?: number;
}

/**
 * A single night's sleep data.
 *
 * Serializes as `health:DailySleepSnapshot` in Turtle.
 */
export interface DailySleepSnapshot extends CascadeRecord {
  type: 'DailySleepSnapshot';

  /**
   * Timestamp the snapshot applies to (ISO 8601). Required by
   * `health:DailySleepSnapshotShape`.
   * Maps to `health:date` in Turtle serialization.
   */
  date: string;

  /**
   * Total sleep duration in hours for the night. Bounded 0–24 by the shape.
   * Maps to `health:durationHours` (`xsd:decimal`).
   */
  durationHours?: number;

  /**
   * Qualitative classification of the night's sleep.
   * Maps to `health:sleepQuality`, emitted as an IRI (`health:Good`).
   */
  sleepQuality?: SleepQuality;

  /**
   * Number of underlying samples aggregated into this snapshot.
   * Maps to `cascade:sampleCount` in Turtle serialization.
   */
  sampleCount?: number;
}
