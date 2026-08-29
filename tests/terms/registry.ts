/**
 * Registry-wide checks over the term modules.
 *
 * Each is a function over inputs the CALLER supplies rather than something that
 * reads `src/terms/` directly, because a detector cannot be proven by pointing
 * it only at cases where it should stay silent. The tests hand each one input
 * where it MUST speak, and then point it at us.
 *
 * STUB. Every check below names nothing yet.
 */

/**
 * Basenames of the term files in `termsDir` that `barrelSource` does not
 * re-export.
 */
export function unbarrelled(_termsDir: string, _barrelSource: string): string[] {
  return [];
}

/** Keys claimed by more than one term in `terms`. */
export function duplicateKeys(_terms: readonly { key: string }[]): string[] {
  return [];
}

/** Keys in `terms` that are not registered in PROPERTY_PREDICATES. */
export function unregisteredKeys(_terms: readonly { key: string }[]): string[] {
  return [];
}
