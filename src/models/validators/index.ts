/**
 * Every record type that has a validator, one line each.
 *
 * THE MANIFEST, and the only hand-kept list. A validator becomes reachable by
 * being exported here and nowhere else, so whatever builds the registry can
 * derive it from this module's exports rather than from a second array that has
 * to be edited in the same breath. Same arrangement as
 * `src/terms/definitions/index.ts`, and for the same reason: a list kept in two
 * places is a list that will disagree with itself.
 *
 * Nothing but re-exports belongs in this file. Open it and you know which
 * record types are judged and which are not, without reading past one screen.
 *
 * MOST RECORD TYPES HAVE NONE, and that is not a gap to be filled for its own
 * sake. A validator earns its place when a record type has rules a term cannot
 * carry — a constraint that varies by record type, or one that spans two fields
 * — because a per-field fact about a predicate belongs on the term that owns
 * the predicate, where every record type carrying it gets the same answer.
 *
 * Which means the absence of a line here says something: that record type's
 * rules are either all per-field, or nobody has transcribed them yet. Only the
 * shapes can tell you which, and that is worth checking before adding one.
 *
 * @module models/validators
 */

export { MedicationValidator } from './medication-validator.js';
