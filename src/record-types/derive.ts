/**
 * Resolve SDK record-type names to the classes `spec` declares.
 *
 * PURE, AND IT TAKES ITS CLASSES AS AN ARGUMENT. Nothing here reads `../spec`,
 * or any file: the caller does the I/O and hands the result in. That is not
 * tidiness, it is what makes the interesting cases reachable at all. The only
 * local-name collision in the corpus today is `SocialHistoryRecord`, so a
 * derivation that read the checkout itself could be tested against exactly one
 * instance of the case it exists to handle — and the next vocabulary to
 * introduce a duplicate local name is precisely the event that must not pass
 * silently. Taking classes as an argument makes a second collision one object
 * literal instead of a fake ontology tree on disk.
 *
 * EXACT LOCAL-NAME LOOKUP ONLY. No suffix rule, no cleverness. A rule stripping
 * a trailing `Record` would absorb two of the overrides below and would
 * silently do the wrong thing the first time a class is genuinely named
 * `*Record` — and `health:` declares eleven that are. Written overrides are
 * cheaper to audit than a rule with an invisible blast radius.
 *
 * @module record-types
 */

import type { Ambiguity, ClassDeclaration, DerivationReport } from './types.js';

/**
 * Which classes a name could mean, indexed by local name.
 *
 * DEPRECATED CLASSES ARE NOT CANDIDATES. They are still read — see
 * `RecordType.acceptedClassUris` — but a class this SDK must never write
 * cannot be what a name derives to. `clinical:CoverageRecord` is the live
 * example: it is declared, it is an exact match for the accepted input
 * spelling `CoverageRecord`, and admitting it here would derive the SDK
 * straight back to the class #26 removed.
 */
function candidatesByLocalName(
  classes: readonly ClassDeclaration[],
): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();

  for (const declaration of classes) {
    if (declaration.deprecated) continue;

    const candidates = index.get(declaration.localName) ?? new Set<string>();
    candidates.add(`${declaration.prefix}:${declaration.localName}`);
    index.set(declaration.localName, candidates);
  }

  return index;
}

/**
 * Resolve each name in `names` against the classes in `classes`.
 *
 * Three outcomes, and the middle one is the reason this returns a report rather
 * than a map:
 *
 * - exactly one candidate — `derived`
 * - more than one — `ambiguous`, AND `unresolved`. Never silently the first.
 * - none — `unresolved`
 *
 * Taking the first candidate is the defect `procedures` already demonstrated
 * one layer up, where object key order decided which of two names a class read
 * back as. A collision is a question for a human, and a derivation that answers
 * it by iteration order answers it differently the day a file is reordered.
 *
 * `unresolved` includes every ambiguous name, so it is the complete list of
 * what needs a declared override. A caller reading only that field cannot miss
 * a collision.
 */
export function deriveRecordTypes(
  classes: readonly ClassDeclaration[],
  names: readonly string[],
): DerivationReport {
  const index = candidatesByLocalName(classes);
  const derived = new Map<string, string>();
  const ambiguous: Ambiguity[] = [];
  const unresolved: string[] = [];

  for (const name of names) {
    const candidates = index.get(name);

    if (!candidates || candidates.size === 0) {
      unresolved.push(name);
      continue;
    }

    if (candidates.size > 1) {
      ambiguous.push({ name, candidates: [...candidates].sort() });
      unresolved.push(name);
      continue;
    }

    derived.set(name, [...candidates][0] as string);
  }

  return {
    derived,
    ambiguous: [...ambiguous].sort((a, b) => a.name.localeCompare(b.name)),
    unresolved: unresolved.sort(),
  };
}
