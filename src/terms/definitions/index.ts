/**
 * Every term this SDK declares, one line each.
 *
 * THE MANIFEST, and the only hand-kept list. A term becomes reachable by being
 * exported here and nowhere else: `src/terms/index.ts` derives its registry
 * from this module's exports, so a file in this directory that is not named
 * below is dead code whose field goes on taking the serializer's type-driven
 * default. `tests/terms/registry.test.ts` names any file left out.
 *
 * Nothing but re-exports belongs in this file. It is read as a list — open it
 * and you know what terms exist without scrolling the 600 lines the ten
 * declarations come to, three quarters of which is the prose explaining each
 * vocabulary decision. That prose is why a term is a module rather than an
 * entry in a big array here.
 *
 * NOT re-exported by the parent barrel, deliberately. `termFor` is the whole
 * surface a caller gets, because reaching a term directly means reaching a rule
 * while bypassing the map that decides which rule applies to which record type.
 *
 * @module terms/definitions
 */

export { address } from './address.js';
export { allergen } from './allergen.js';
export { biologicalSex } from './biological-sex.js';
export { clinicalSummary } from './clinical-summary.js';
export { conditionName } from './condition-name.js';
export { dataAbsentReason } from './data-absent-reason.js';
export { dateOfBirth } from './date-of-birth.js';
export { emergencyContact } from './emergency-contact.js';
export { interpretation } from './interpretation.js';
export { interpretationSourceCode } from './interpretation-source-code.js';
export { medicationName } from './medication-name.js';
export { preferredPharmacy } from './preferred-pharmacy.js';
export { providerName } from './provider-name.js';
export { resultValue } from './result-value.js';
export { testName } from './test-name.js';
export { vaccineName } from './vaccine-name.js';
