export {
  validate,
  validateAll,
  type ValidationError,
  type ValidationResult,
} from './validator.js';

// The type of `ValidationError.severity`, and therefore public whether or not
// it is listed: a consumer writing an exhaustive `switch` over `err.severity`
// has no other way to name the union, and `package.json`'s `exports` map allows
// no deep import to reach `src/terms/term.js`. Re-exported from the module that
// USES it rather than only from the one that declares it, so the name arrives
// alongside the two types it belongs to.
export type { Severity } from '../terms/term.js';
