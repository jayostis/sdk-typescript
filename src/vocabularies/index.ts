/**
 * Re-exports all vocabulary constants.
 *
 * @module vocabularies
 */

export {
  NAMESPACES,
  CURRENT_SCHEMA_VERSION,
  TYPE_MAPPING,
  TYPE_TO_MAPPING_KEY,
  PROPERTY_PREDICATES,
  DEPRECATED_TYPE_ALIASES,
  WELLNESS_CONTAINER_SUBCLASSES,
  SLEEP_QUALITY_VALUES,
  isHealthProfileType,
  buildReversePredicateMap,
} from './namespaces.js';

export type { NamespacePrefix } from './namespaces.js';
