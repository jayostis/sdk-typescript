/**
 * Barrel over the term modules.
 *
 * STUB. No term modules exist yet, so `termFor` claims no keys.
 *
 * @module terms
 */

export * from './term.js';

import type { Term } from './term.js';

/**
 * The term that claims `key`, or `undefined` when no module claims it — not an
 * error: the registered fields with no rule reach the serializer's type-driven
 * defaults.
 */
export function termFor(_key: string): Term | undefined {
  return undefined;
}
