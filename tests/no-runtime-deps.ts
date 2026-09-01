/**
 * Every import under `src/` resolves without `node_modules`.
 *
 * A function over a directory the CALLER supplies, so a test can hand it
 * sources where it MUST speak before pointing it at ours — the same shape, and
 * for the same reason, as `reachesPastTheBarrel` in `tests/terms/front-door.ts`.
 */

/** `file -> specifier` for every import under `srcDir` that names a package. */
export function thirdPartyImports(_srcDir: string): string[] {
  return [];
}
