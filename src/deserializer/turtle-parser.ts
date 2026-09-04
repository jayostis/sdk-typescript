/**
 * Zero-dependency Turtle parser for deserializing Cascade Protocol records.
 *
 * Uses regex-based parsing to convert Turtle (Terse RDF Triple Language)
 * content back into typed Cascade Protocol model objects.
 *
 * Supports:
 * - @prefix declarations
 * - Subject-predicate-object triples
 * - Typed literals (xsd:dateTime, xsd:date, xsd:integer, xsd:double)
 * - URI references (angle-bracket and prefixed forms)
 * - Boolean literals
 * - RDF lists `( item1 item2 ... )`
 * - Blank nodes `[ ... ]`
 * - Triple-quoted long literals
 * - Multi-value predicates (repeated predicate with different objects)
 *
 * @module deserializer
 */

import { NAMESPACES, buildReversePredicateMap, legacyRdfTypeUriFor } from '../vocabularies/namespaces.js';
import { recordTypeFor } from '../record-types/index.js';
import type { ParsedTriple } from './parsed-triple.js';
import { parseTurtleWithN3 } from './n3-adapter.js';
import {
  DEFAULT_NESTED_PREFIX,
  blankNodeTermKeys,
  childPredicateFor,
  termFor,
  termSpellings,
} from '../terms/index.js';
import type { FieldRule } from '../terms/index.js';
import { BLANK_NODE_PREDICATE_PREFIXES } from '../serializer/turtle-serializer.js';
import type { CascadeEntity } from '../models/common.js';

// ─── Internal Types ─────────────────────────────────────────────────────────

interface ParsedPrefix {
  prefix: string;
  uri: string;
}

// ─── Reverse Predicate Mapping ──────────────────────────────────────────────

/**
 * Type-specific predicate overrides for deserialization.
 * These map full predicate URIs to JSON property names for cases where
 * the same local name is used in different namespaces depending on record type.
 */
const ADDITIONAL_REVERSE_MAPPINGS: Record<string, string> = {
  // VitalSign uses clinical: namespace for these predicates
  [`${NAMESPACES.clinical}snomedCode`]: 'snomedCode',
  [`${NAMESPACES.clinical}interpretation`]: 'interpretation',

  // Procedure and Encounter (EHR-imported) use clinical: for predicates
  // that health: records express under the health: namespace. These aliases
  // ensure both namespace variants deserialize to the same JSON key.
  [`${NAMESPACES.clinical}performedDate`]: 'performedDate',
  [`${NAMESPACES.clinical}sourceRecordId`]: 'sourceRecordId',
  [`${NAMESPACES.clinical}notes`]: 'notes',

  // Core v3.4 defined cascade:date, cascade:notes and cascade:loincCode as
  // second spellings of terms this SDK already writes under health: and
  // clinical:. The ontology is explicit that readers of history containers
  // must handle both, so both resolve to the same JSON key here. Which
  // spelling is WRITTEN is decided per record type by TYPE_PREDICATE_OVERRIDES
  // in the serializer; reading is deliberately the permissive side.
  [`${NAMESPACES.cascade}date`]: 'date',
  [`${NAMESPACES.cascade}notes`]: 'notes',
  [`${NAMESPACES.cascade}loincCode`]: 'loincCode',

  // Clinical v1.13 deprecated (but did not remove) clinical:LabResult,
  // clinical:Condition, clinical:Allergy and clinical:Immunization. Existing
  // pods contain them, and clinical.ttl declares these properties with
  // rdfs:domain set to one of those four classes, so a pod that spells the
  // class the old way spells its properties the old way too. Accepting the
  // class without accepting its properties would return a record with an id, a
  // type and no data — absence dressed up as a successful read.
  //
  // Only unambiguous local names are aliased. clinical:value, clinical:unit,
  // clinical:interpretation and clinical:severity are deliberately absent: the
  // first three already resolve to a VitalSign field and the fourth would
  // collide with cascade:severity, and a reverse map has no record-type
  // context with which to disambiguate.
  [`${NAMESPACES.clinical}testName`]: 'testName',
  [`${NAMESPACES.clinical}referenceRange`]: 'referenceRange',
  [`${NAMESPACES.clinical}specimenType`]: 'specimenType',
  [`${NAMESPACES.clinical}conditionName`]: 'conditionName',
  [`${NAMESPACES.clinical}onsetDate`]: 'onsetDate',
  [`${NAMESPACES.clinical}icd10Code`]: 'icd10Code',
  [`${NAMESPACES.clinical}allergen`]: 'allergen',
  [`${NAMESPACES.clinical}reaction`]: 'reaction',
  [`${NAMESPACES.clinical}allergyCategory`]: 'allergyCategory',
  [`${NAMESPACES.clinical}vaccineName`]: 'vaccineName',
  [`${NAMESPACES.clinical}vaccineCode`]: 'vaccineCode',
  [`${NAMESPACES.clinical}lotNumber`]: 'lotNumber',
  [`${NAMESPACES.clinical}site`]: 'site',

  // Coverage v1.5. `status` resolves to health:status through
  // PROPERTY_PREDICATES, so the coverage: spelling needs its own entry or a
  // plan's status would be written and then dropped on read. Unambiguous: no
  // other field in this SDK maps to coverage:status.
  [`${NAMESPACES.coverage}status`]: 'status',

  // Coverage v1.6, the read side of the eight spellings an InsurancePlan is
  // WRITTEN in (TYPE_PREDICATE_OVERRIDES.InsurancePlan). Every one of them
  // resolves to a clinical: or health: spelling through PROPERTY_PREDICATES, so
  // without an entry here a plan's provider name would be written under
  // coverage: and then dropped on read — the round trip losing the record's
  // data with the writer looking innocent.
  //
  // Both spellings map to the same JSON key, which is what makes a pod written
  // in the deprecated clinical: form still read back in full. Unambiguous: no
  // other field in this SDK maps to any of these coverage: URIs.
  //
  // `coverage:payorName` is deliberately absent — no such property exists.
  // A plan's payor is written clinical:payorName, and that URI is already
  // reachable through PROPERTY_PREDICATES.
  [`${NAMESPACES.coverage}providerName`]: 'providerName',
  [`${NAMESPACES.coverage}memberId`]: 'memberId',
  [`${NAMESPACES.coverage}groupNumber`]: 'groupNumber',
  [`${NAMESPACES.coverage}planName`]: 'planName',
  [`${NAMESPACES.coverage}planType`]: 'planType',
  [`${NAMESPACES.coverage}coverageType`]: 'coverageType',
  [`${NAMESPACES.coverage}subscriberId`]: 'subscriberId',
  [`${NAMESPACES.coverage}sourceRecordId`]: 'sourceRecordId',

  // The blank-node children are NOT here. They are generated below, from the
  // terms that write them.
};

/**
 * The blank-node child predicates, expanded to full URIs.
 *
 * These resolve a predicate SPELLING to a JSON key, which is why they belong
 * beside `ADDITIONAL_REVERSE_MAPPINGS` and not in `PROPERTY_PREDICATES` — a
 * nested key and a top-level key of the same name are two properties, and
 * registering the child would collapse them into one.
 *
 * GENERATED, and that is the point. A child written by hand here is a second
 * copy of what `childrenOf` derives, and the two drift in the direction that
 * cannot be seen: `triplesToNestedObject` drops an unresolved predicate at
 * `if (!key) continue`, so eleven of twelve rebuilds a contact that looks
 * complete and is not. Generating them also means a spelling nothing writes
 * cannot be read — `cascade:contactEmail` was hand-mapped here on symmetry,
 * appears nowhere in spec, and would have come straight back out of the writer
 * under no domain, no range and no shape.
 */
function termReverseMappings(): Record<string, string> {
  const mappings: Record<string, string> = {};
  for (const [curie, jsonKey] of Object.entries(termSpellings())) {
    const colonIdx = curie.indexOf(':');
    const nsUri = NAMESPACES[curie.slice(0, colonIdx) as keyof typeof NAMESPACES];
    if (nsUri) mappings[`${nsUri}${curie.slice(colonIdx + 1)}`] = jsonKey;
  }
  return mappings;
}

const REVERSE_PREDICATE_MAP = buildReversePredicateMap({
  ...termReverseMappings(),
  // Hand-written entries win. Everything left in that table is a spelling this
  // SDK READS and never writes, so nothing on the write side could have derived
  // it: the classes clinical v1.13 deprecated, and the `cascade:` second
  // spellings core v3.4 obliges readers to accept.
  ...ADDITIONAL_REVERSE_MAPPINGS,
});

/**
 * Which record type a class reads back as, and which classes a name accepts,
 * both answered by `src/record-types/`.
 *
 * WHAT USED TO BE HERE. Three private functions — `buildMappingKeyToTypeName`,
 * `buildReverseTypeMap` and, further down, `resolveTypeUri` — reconstructed
 * the class half of the vocabulary from two tables in `src/vocabularies/`, and
 * the reverse direction was decided by OBJECT KEY ORDER: the first name
 * reaching each mapping key won. That made `clinical:Procedure` read back as
 * `ProcedureRecord`, a spelling `src/models/procedure.ts` does not declare and
 * `src/index.ts` does not export, so `deserialize()` returned a value this
 * package's own published type says is impossible.
 *
 * The canonical name is now DECLARED, in `CANONICAL_NAMES`, and a class with
 * two names and no declared canonical throws at load rather than picking one.
 * See #42.
 */

// ─── Fields requiring special type conversion ───────────────────────────────

/** Fields that are booleans */
const BOOLEAN_FIELDS = new Set([
  'isActive', 'asNeeded',
]);

/** Fields that are numbers (integers) */
const INTEGER_TYPE_FIELDS = new Set([
  'computedAge', 'refillsAllowed', 'supplyDurationDays', 'onsetAge',
  'steps', 'activeMinutes', 'calories', 'awakenings',
  'totalSleepMinutes', 'deepSleepMinutes', 'remSleepMinutes', 'lightSleepMinutes',
  // Core v3.7: cascade:byteSize, sh:datatype xsd:integer.
  'byteSize',
]);

/** Fields that are numbers (possibly float) */
const NUMBER_FIELDS = new Set([
  'value', 'referenceRangeLow', 'referenceRangeHigh',
  'distance',
]);

/** Fields that hold arrays of strings */
const ARRAY_TYPE_FIELDS = new Set([
  'drugCodes', 'affectsVitalSigns', 'monitoredVitalSigns',
  // Clinical v1.10–v1.12 graph edges (repeated predicate triples).
  'indicationReference', 'parsedIndicationReference', 'linkedCondition',
  // Core v3.4 manifest rdf:List members.
  'provenanceLayers', 'deviceSources', 'interactionScenarios', 'involvedResources',
  // Core v3.7 attachment edge (repeated predicate triples, IRI objects).
  'hasAttachment',
]);

/**
 * Fields whose Turtle object is a prefixed IRI but whose JSON value is the bare
 * local name, keyed by the namespace whose prefix is stripped on read.
 *
 * `dataProvenance` predates this map and is handled separately below.
 */
const PREFIXED_ENUM_FIELDS: Record<string, string> = {
  sleepQuality: NAMESPACES.health,
};

/** Members of these lists are `cascade:` individuals reported as bare names. */
const CASCADE_LOCAL_NAME_LIST_FIELDS = new Set(['provenanceLayers']);

/** Strip a namespace URI or its CURIE prefix from an RDF list member. */
function stripCascadeQualifier(value: string): string {
  if (value.startsWith(NAMESPACES.cascade)) return value.slice(NAMESPACES.cascade.length);
  if (value.startsWith('cascade:')) return value.slice('cascade:'.length);
  return value;
}

// ─── Blank Node Identifiers ─────────────────────────────────────────────────

/**
 * Monotonic counter behind {@link nextBlankNodeId}.
 *
 * Blank-node labels only have to be unique within one parse, but they must be
 * unambiguously so. The previous scheme was
 * `_:b${Date.now()}${Math.random().toString(36).slice(2, 6)}`, which is not:
 * two blank nodes created in the same millisecond collide whenever their four
 * random characters agree. That was survivable while the only inline blank
 * nodes were `clinicalSummary` and `wellnessSummary`, at most one of each per
 * subject. Clinical v1.16 makes it load-bearing — an encounter carries several
 * `clinical:hasParticipant` blank nodes at once, and a collision would merge
 * two participations into one, silently attributing one clinician's role to
 * another's name.
 *
 * A counter also makes a parse reproducible, so a test can assert on the
 * reconstructed structure instead of on whatever labels a clock produced.
 */
let blankNodeCounter = 0;

/**
 * Allocate a fresh, collision-free blank-node label.
 *
 * @internal Exported for test only. Not re-exported from `src/deserializer/
 * index.ts` or the package root, so this is not public API. It is exported at
 * all because the labels never reach a caller — they are consumed while
 * rebuilding nested objects — so uniqueness cannot be asserted through
 * `deserialize()`, and a probabilistic scheme's failure mode is a rare flake
 * rather than a reproducible red.
 */
export function nextBlankNodeId(): string {
  blankNodeCounter += 1;
  return `_:b${blankNodeCounter}`;
}

// ─── Turtle Tokenizer / Parser ──────────────────────────────────────────────

/**
 * Parse @prefix declarations from Turtle content.
 */
function parsePrefixes(content: string): ParsedPrefix[] {
  const prefixes: ParsedPrefix[] = [];
  const regex = /@prefix\s+(\w+):\s+<([^>]+)>\s*\./g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    prefixes.push({ prefix: match[1] ?? '', uri: match[2] ?? '' });
  }
  return prefixes;
}

/**
 * Expand a prefixed name (e.g., "health:medicationName") to a full URI
 * using the parsed prefix declarations.
 */
function expandPrefixedName(
  name: string,
  prefixMap: Map<string, string>,
): string {
  // Already a full URI
  if (name.startsWith('http://') || name.startsWith('https://') || name.startsWith('urn:')) {
    return name;
  }

  const colonIdx = name.indexOf(':');
  if (colonIdx < 0) return name;

  const prefix = name.slice(0, colonIdx);
  const local = name.slice(colonIdx + 1);
  const nsUri = prefixMap.get(prefix);
  if (nsUri) {
    return `${nsUri}${local}`;
  }
  return name;
}

/**
 * Remove Turtle comments (# to end of line) while respecting
 * angle-bracket URIs and quoted strings where # is a literal character.
 */
function removeComments(content: string): string {
  let result = '';
  let inString = false;
  let inTripleQuote = false;
  let inUri = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];

    // Handle triple-quoted strings
    if (!inString && !inTripleQuote && !inUri && content.slice(i, i + 3) === '"""') {
      inTripleQuote = true;
      result += '"""';
      i += 2;
      continue;
    }
    if (inTripleQuote) {
      if (content.slice(i, i + 3) === '"""' && (i === 0 || content[i - 1] !== '\\')) {
        inTripleQuote = false;
        result += '"""';
        i += 2;
        continue;
      }
      result += ch;
      continue;
    }

    // Handle regular strings
    if (ch === '"' && !inString && !inUri) {
      inString = true;
      result += ch;
      continue;
    }
    if (ch === '"' && inString && (i === 0 || content[i - 1] !== '\\')) {
      inString = false;
      result += ch;
      continue;
    }
    if (inString) {
      result += ch;
      continue;
    }

    // Handle angle-bracket URIs
    if (ch === '<' && !inUri) {
      inUri = true;
      result += ch;
      continue;
    }
    if (ch === '>' && inUri) {
      inUri = false;
      result += ch;
      continue;
    }
    if (inUri) {
      result += ch;
      continue;
    }

    // At top-level: # starts a comment to end of line
    if (ch === '#') {
      // Skip until newline
      while (i < content.length && content[i] !== '\n') {
        i++;
      }
      // Include the newline if present
      if (i < content.length && content[i] === '\n') {
        result += '\n';
      }
      continue;
    }

    result += ch;
  }

  return result;
}

/**
 * Unescape a Turtle string literal (handle \\, \", \n, \r, \t).
 */
function unescapeTurtleLiteral(value: string): string {
  return value
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

/**
 * Strip surrounding angle brackets from a URI.
 */
function stripAngleBrackets(uri: string): string {
  if (uri.startsWith('<') && uri.endsWith('>')) {
    return uri.slice(1, -1);
  }
  return uri;
}

/**
 * The hand-written Turtle parser. NO LONGER ON THE PRODUCTION PATH.
 *
 * `deserialize` reads through `parseTurtleWithN3` now. This is retained as the
 * differential's oracle — `tests/deserializer/parser-differential.test.ts`
 * runs both over all 92 fixtures and declares every difference — and exported
 * for no other reason.
 *
 * IT IS DEAD CODE THAT SHIPS, and that is a real cost, not a neutral one:
 * roughly 700 lines reach `dist` and every consumer downloads them. The case
 * for keeping it is that the differential is what makes the swap reviewable,
 * and a differential with one side deleted asserts nothing. Deleting it is
 * #71's to finish, along with the helpers only it reaches.
 *
 * What the differential found, so it is written where the code is:
 *
 * - **It has no branch for the comma object list** `:p :a , :b`. Four fixtures
 *   in the corpus carry one, and each lost every object after the first —
 *   `absent-003`, `lab-009` (twice), `lab-013` and `pod-001`, where nineteen
 *   `ldp:contains` entries came back as one object holding the raw text of the
 *   whole block. `lab-013` is the fixture that exists to be written in full
 *   and rejected for carrying two values; it was being read with one, and a
 *   record with one violates nothing.
 * - **It decides a value's kind from the lexical form.** A bare `5` was an
 *   integer and `"5"^^xsd:integer` an uninterpreted literal, though they are
 *   the same RDF term.
 */
export function parseTurtleContent(content: string): {
  prefixes: ParsedPrefix[];
  triples: ParsedTriple[];
} {
  const prefixes = parsePrefixes(content);
  const prefixMap = new Map<string, string>();
  for (const p of prefixes) {
    prefixMap.set(p.prefix, p.uri);
  }
  // Add well-known prefixes as fallback
  prefixMap.set('rdf', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#');
  prefixMap.set('xsd', NAMESPACES.xsd);

  const triples: ParsedTriple[] = [];

  // Remove prefix declarations
  let body = content
    .replace(/@prefix\s+\w+:\s+<[^>]+>\s*\.\s*/g, '');

  // Remove comments (# to end of line) but NOT when # is inside <...> URIs or "..." strings
  body = removeComments(body).trim();

  // Parse subject blocks: <subject> predicate-list .
  // Match subject URIs or prefixed names. `<>` (the empty relative IRI, which
  // names the document itself) is a legal subject and is how a pod export
  // manifest identifies itself, so the URI branch accepts zero characters.
  const subjectRegex = /(<[^>]*>|[a-zA-Z][\w-]*:[\w-]+)\s+/;

  while (body.length > 0) {
    body = body.trim();
    if (body.length === 0) break;

    // Match subject
    const subMatch = subjectRegex.exec(body);
    if (!subMatch) break;

    let subject = subMatch[1] ?? '';
    if (subject.startsWith('<') && subject.endsWith('>')) {
      subject = subject.slice(1, -1);
    } else {
      subject = expandPrefixedName(subject, prefixMap);
    }

    // Find the predicate-object list (everything until the closing '.')
    let startIdx = (subMatch.index ?? 0) + subMatch[0].length;
    const predicateObjects = extractPredicateObjectList(body, startIdx);
    if (!predicateObjects) break;

    body = body.slice(predicateObjects.endIndex).trim();

    // Parse each predicate-object pair
    parsePredicateObjectPairs(subject, predicateObjects.content, prefixMap, triples);
  }

  return { prefixes, triples };
}

/**
 * Extract the predicate-object list from the current position in the body,
 * handling nested blank nodes and lists.
 */
function extractPredicateObjectList(
  body: string,
  startIdx: number,
): { content: string; endIndex: number } | null {
  let depth = 0; // for nested [] and ()
  let i = startIdx;
  let inString = false;
  let inTripleQuote = false;
  let inUri = false; // for <...> URI delimiters
  let prevChar = '';

  while (i < body.length) {
    const ch = body[i];

    // Handle triple-quoted strings
    if (!inString && !inTripleQuote && !inUri && body.slice(i, i + 3) === '"""') {
      inTripleQuote = true;
      i += 3;
      continue;
    }
    if (inTripleQuote) {
      if (body.slice(i, i + 3) === '"""' && prevChar !== '\\') {
        inTripleQuote = false;
        i += 3;
        continue;
      }
      prevChar = ch ?? '';
      i++;
      continue;
    }

    // Handle regular quoted strings
    if (ch === '"' && !inString && !inUri && prevChar !== '\\') {
      inString = true;
      i++;
      prevChar = ch;
      continue;
    }
    if (ch === '"' && inString && prevChar !== '\\') {
      inString = false;
      i++;
      prevChar = ch;
      continue;
    }
    if (inString) {
      prevChar = ch ?? '';
      i++;
      continue;
    }

    // Handle angle-bracket URIs <...>
    if (ch === '<' && !inUri) {
      inUri = true;
      i++;
      prevChar = ch;
      continue;
    }
    if (ch === '>' && inUri) {
      inUri = false;
      i++;
      prevChar = ch;
      continue;
    }
    if (inUri) {
      prevChar = ch ?? '';
      i++;
      continue;
    }

    if (ch === '[' || ch === '(') depth++;
    if (ch === ']' || ch === ')') depth--;

    if (ch === '.' && depth === 0) {
      // Check if this dot is followed by whitespace or end-of-string
      // to distinguish from dots in prefixed names (e.g., "foaf:name")
      const nextChar = i + 1 < body.length ? body[i + 1] : '';
      if (nextChar === '' || nextChar === '\n' || nextChar === '\r' || nextChar === ' ' || nextChar === '\t') {
        return { content: body.slice(startIdx, i).trim(), endIndex: i + 1 };
      }
    }

    prevChar = ch ?? '';
    i++;
  }

  // If we reach the end without a dot, treat the rest as the content
  if (body.slice(startIdx).trim().length > 0) {
    return { content: body.slice(startIdx).trim(), endIndex: body.length };
  }
  return null;
}

/**
 * Parse semicolon-separated predicate-object pairs.
 */
function parsePredicateObjectPairs(
  subject: string,
  content: string,
  prefixMap: Map<string, string>,
  triples: ParsedTriple[],
): void {
  // Split on ';' that are not inside strings, brackets, or parens
  const pairs = splitOnSemicolon(content);

  for (const pair of pairs) {
    const trimmed = pair.trim();
    if (trimmed.length === 0) continue;

    // Handle "a <type>" shorthand
    if (trimmed.startsWith('a ')) {
      const typeValue = trimmed.slice(2).trim();
      const expandedType = typeValue.startsWith('<')
        ? stripAngleBrackets(typeValue)
        : expandPrefixedName(typeValue, prefixMap);

      triples.push({
        subject,
        predicate: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
        object: expandedType,
        objectType: 'uri',
      });
      continue;
    }

    // Split predicate and object(s)
    const spaceIdx = findFirstWhitespace(trimmed);
    if (spaceIdx < 0) continue;

    const predStr = trimmed.slice(0, spaceIdx).trim();
    const objStr = trimmed.slice(spaceIdx + 1).trim();

    const predUri = predStr.startsWith('<')
      ? stripAngleBrackets(predStr)
      : expandPrefixedName(predStr, prefixMap);

    // Parse the object value
    parseObjectValue(subject, predUri, objStr, prefixMap, triples);
  }
}

/**
 * Find the first whitespace character that is not inside brackets or strings.
 */
function findFirstWhitespace(str: string): number {
  let inQuote = false;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '"' && (i === 0 || str[i - 1] !== '\\')) {
      inQuote = !inQuote;
    }
    if (!inQuote && (ch === ' ' || ch === '\t' || ch === '\n')) {
      return i;
    }
  }
  return -1;
}

/**
 * Split a string on ';' characters that are not inside strings, brackets, or parens.
 */
function splitOnSemicolon(content: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let inString = false;
  let inTripleQuote = false;
  let inUri = false;
  let current = '';

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];

    // Handle triple-quoted strings
    if (!inString && !inTripleQuote && !inUri && content.slice(i, i + 3) === '"""') {
      inTripleQuote = true;
      current += '"""';
      i += 2;
      continue;
    }
    if (inTripleQuote) {
      if (content.slice(i, i + 3) === '"""' && (i === 0 || content[i - 1] !== '\\')) {
        inTripleQuote = false;
        current += '"""';
        i += 2;
        continue;
      }
      current += ch;
      continue;
    }

    if (ch === '"' && !inString && !inUri && (i === 0 || content[i - 1] !== '\\')) {
      inString = true;
      current += ch;
      continue;
    }
    if (ch === '"' && inString && (i === 0 || content[i - 1] !== '\\')) {
      inString = false;
      current += ch;
      continue;
    }
    if (inString) {
      current += ch;
      continue;
    }

    // Handle angle-bracket URIs <...>
    if (ch === '<' && !inUri) {
      inUri = true;
      current += ch;
      continue;
    }
    if (ch === '>' && inUri) {
      inUri = false;
      current += ch;
      continue;
    }
    if (inUri) {
      current += ch;
      continue;
    }

    if (ch === '[' || ch === '(') depth++;
    if (ch === ']' || ch === ')') depth--;

    if (ch === ';' && depth === 0) {
      result.push(current);
      current = '';
      continue;
    }

    current += ch;
  }

  if (current.trim().length > 0) {
    result.push(current);
  }

  return result;
}

/**
 * Parse an object value string into the appropriate type and add a triple.
 */
function parseObjectValue(
  subject: string,
  predicate: string,
  objStr: string,
  prefixMap: Map<string, string>,
  triples: ParsedTriple[],
): void {
  const trimmed = objStr.trim();

  // Boolean literals
  if (trimmed === 'true' || trimmed === 'false') {
    triples.push({
      subject,
      predicate,
      object: trimmed,
      objectType: 'boolean',
    });
    return;
  }

  // URI reference (angle brackets)
  if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
    triples.push({
      subject,
      predicate,
      object: stripAngleBrackets(trimmed),
      objectType: 'uri',
    });
    return;
  }

  // Prefixed name (e.g., cascade:ClinicalGenerated)
  if (/^[a-zA-Z][\w-]*:[\w-]+$/.test(trimmed)) {
    triples.push({
      subject,
      predicate,
      object: expandPrefixedName(trimmed, prefixMap),
      objectType: 'uri',
    });
    return;
  }

  // Plain integer (no quotes)
  if (/^-?\d+$/.test(trimmed)) {
    triples.push({
      subject,
      predicate,
      object: trimmed,
      objectType: 'integer',
    });
    return;
  }

  // Plain double (no quotes, has decimal)
  if (/^-?\d+\.\d+$/.test(trimmed)) {
    triples.push({
      subject,
      predicate,
      object: trimmed,
      objectType: 'double',
    });
    return;
  }

  // RDF list ( item1 item2 ... )
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    const listContent = trimmed.slice(1, -1).trim();
    // Parse list items
    const items = parseListItems(listContent);
    triples.push({
      subject,
      predicate,
      object: JSON.stringify(items),
      objectType: 'list',
    });
    return;
  }

  // Blank node [ ... ]
  if (trimmed.startsWith('[')) {
    // For blank nodes, we store the inner content as the object
    // and parse it recursively
    const bnodeId = nextBlankNodeId();
    triples.push({
      subject,
      predicate,
      object: bnodeId,
      objectType: 'blankNode',
    });

    // Extract inner content between [ and ]
    const innerStart = trimmed.indexOf('[') + 1;
    const innerEnd = trimmed.lastIndexOf(']');
    if (innerEnd > innerStart) {
      const inner = trimmed.slice(innerStart, innerEnd).trim();
      parsePredicateObjectPairs(bnodeId, inner, prefixMap, triples);
    }
    return;
  }

  // Triple-quoted string literal """..."""
  if (trimmed.startsWith('"""')) {
    const endIdx = trimmed.indexOf('"""', 3);
    if (endIdx >= 0) {
      const value = trimmed.slice(3, endIdx);
      const afterQuote = trimmed.slice(endIdx + 3).trim();
      let datatype: string | undefined;
      if (afterQuote.startsWith('^^')) {
        const dtStr = afterQuote.slice(2);
        datatype = dtStr.startsWith('<')
          ? stripAngleBrackets(dtStr)
          : expandPrefixedName(dtStr, prefixMap);
      }
      triples.push({
        subject,
        predicate,
        object: unescapeTurtleLiteral(value),
        objectType: 'literal',
        datatype,
      });
    }
    return;
  }

  // Quoted string literal "..."
  if (trimmed.startsWith('"')) {
    // Find matching closing quote (not escaped)
    let endQuoteIdx = -1;
    for (let i = 1; i < trimmed.length; i++) {
      if (trimmed[i] === '"' && trimmed[i - 1] !== '\\') {
        endQuoteIdx = i;
        break;
      }
    }
    if (endQuoteIdx >= 0) {
      const value = trimmed.slice(1, endQuoteIdx);
      const afterQuote = trimmed.slice(endQuoteIdx + 1).trim();
      let datatype: string | undefined;
      if (afterQuote.startsWith('^^')) {
        const dtStr = afterQuote.slice(2);
        datatype = dtStr.startsWith('<')
          ? stripAngleBrackets(dtStr)
          : expandPrefixedName(dtStr, prefixMap);
      }
      triples.push({
        subject,
        predicate,
        object: unescapeTurtleLiteral(value),
        objectType: 'literal',
        datatype,
      });
    }
    return;
  }

  // Fallback: treat as literal
  triples.push({
    subject,
    predicate,
    object: trimmed,
    objectType: 'literal',
  });
}

/**
 * Parse items from an RDF list, handling quoted strings.
 */
function parseListItems(content: string): string[] {
  const items: string[] = [];
  let remaining = content.trim();

  while (remaining.length > 0) {
    remaining = remaining.trim();
    if (remaining.length === 0) break;

    if (remaining.startsWith('"')) {
      // Find closing quote
      let endIdx = -1;
      for (let i = 1; i < remaining.length; i++) {
        if (remaining[i] === '"' && remaining[i - 1] !== '\\') {
          endIdx = i;
          break;
        }
      }
      if (endIdx >= 0) {
        items.push(unescapeTurtleLiteral(remaining.slice(1, endIdx)));
        remaining = remaining.slice(endIdx + 1).trim();
        // Skip optional datatype
        if (remaining.startsWith('^^')) {
          const spaceIdx = remaining.indexOf(' ');
          remaining = spaceIdx >= 0 ? remaining.slice(spaceIdx) : '';
        }
      } else {
        break;
      }
    } else if (remaining.startsWith('<')) {
      // URI
      const endIdx = remaining.indexOf('>');
      if (endIdx >= 0) {
        items.push(remaining.slice(1, endIdx));
        remaining = remaining.slice(endIdx + 1).trim();
      } else {
        break;
      }
    } else {
      // Unquoted token (e.g. a prefixed name like cascade:DeviceGenerated).
      // Split on ANY whitespace: a multi-line rdf:List separates its members
      // with newlines, and splitting on the space character alone captures the
      // trailing newline into the token.
      const wsMatch = /\s/.exec(remaining);
      if (wsMatch) {
        items.push(remaining.slice(0, wsMatch.index));
        remaining = remaining.slice(wsMatch.index + 1);
      } else {
        items.push(remaining);
        remaining = '';
      }
    }
  }

  return items;
}

// ─── Public API ─────────────────────────────────────────────────────────────

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

/**
 * Every class IRI a subject may carry and still be read back as `type`.
 *
 * One lookup where there were two functions and a fallback scan. The
 * deprecated `clinical:` spellings are part of the answer rather than a second
 * table consulted afterwards: clinical v1.13 deprecated four classes and v1.5 a
 * fifth, none was REMOVED, and the pod export path is still their sole emitter.
 * Refusing to read those pods would be a data-loss bug dressed up as standards
 * compliance.
 *
 * A NAME-KEYED FALLBACK TO THE LEGACY TABLE STAYS, and is not the fallback the
 * paragraph above used to say was dead. That one scanned `TYPE_MAPPING` for an
 * entry whose RDF LOCAL NAME equalled the requested type, reached only when
 * the primary lookup missed by name — genuinely unreachable, since every local
 * name it could hit was already a registered type name. This is a different
 * question: `recordTypeFor(type)` asks spec's derived table, and a handful of
 * names — `SocialHistoryConsent` among them (#89) — are in `TYPE_TO_MAPPING_KEY`
 * but not there, because spec models `cascade:SocialHistoryConsent` as a NAMED
 * INDIVIDUAL of `cascade:ConsentScope`, never marked `cascade:RecordClass`, so
 * the derived table correctly has no row for it. `serializeRecord`
 * (`src/serializer/turtle-serializer.ts`) already falls back to the legacy
 * table when `recordTypeFor` answers `undefined`; refusing to read the class a
 * write just produced was the asymmetry `legacyRdfTypeUriFor` closes.
 */
function acceptedClassUris(type: string): readonly string[] | null {
  const derived = recordTypeFor(type)?.acceptedClassUris;
  if (derived) return derived;

  const legacy = legacyRdfTypeUriFor(type);
  return legacy ? [legacy] : null;
}

/**
 * Fields whose Turtle object is an inline blank node that must be rebuilt into
 * a nested JSON object rather than reported as a blank-node identifier.
 *
 * Still deliberately narrow — a field is listed because this SDK writes it as
 * an inline blank node, not because blank nodes are reconstructed in general.
 * Widening this to EVERY blank node remains a separate change with its own
 * compatibility question.
 *
 * The three patient-profile sub-structures joined the list with #27, in the
 * same change that made them serialize at all. Their children resolve through
 * `ADDITIONAL_REVERSE_MAPPINGS`, and the two halves move together: without the
 * child spellings, a field listed here rebuilds as `{}` — every child dropped
 * by `triplesToNestedObject`'s `if (!key) continue`, with nothing reported.
 */
const NESTED_BLANK_NODE_FIELDS = new Set([
  // Derived: a term whose rule is `blankNode` writes one, so the reader must
  // rebuild one. The two halves were kept in step by hand until now, and the
  // failure was silent in the direction that matters — a field the writer
  // nests and the reader does not comes back as the bare string `"_:b1"`.
  ...blankNodeTermKeys(),
  // Not yet termed. These stay hand-written until a term claims them, and the
  // spread above is what makes that migration a deletion rather than an edit.
  'wellnessSummary',
]);

/**
 * Fields whose Turtle object is a REPEATED inline blank node, rebuilt into an
 * array of nested objects (clinical v1.16 `hasParticipant`).
 *
 * Always an array, even for a single participation, because unlike a 0..* code
 * property this field's TypeScript type is already `EncounterParticipant[]`:
 * there is no bare form for one value to preserve.
 */
const NESTED_BLANK_NODE_ARRAY_FIELDS = new Set(['hasParticipant']);

/** Rebuild an inline blank node's predicates into a plain nested object. */
/**
 * What a nested node's children are written under: the prefix that abbreviates
 * them, and the rules for the ones its term declares.
 *
 * BOTH HALVES ARE NEEDED to answer whether a key round-trips, and each covers a
 * case the other does not. The prefix answers the ordinary child. The rules
 * answer a declared child carrying its own `predicate` — `sourceRecordId` on a
 * `RecordSummary` is `health:sourceRecordId`, deliberately outside the node's
 * own namespace, and a prefix-only test would refuse it.
 *
 * AN UNTERMED FIELD STILL GETS A REAL PREFIX, from the same table the writer
 * uses. It used to get none, which switched the check off rather than merely
 * bypassing it, so `wellnessSummary` and `hasParticipant` kept the defect that
 * the termed path had fixed. `hasParticipant`'s children are `clinical:`, so
 * defaulting to `cascade:` here would be the corruption rather than a guess at
 * it.
 */
interface NestedContext {
  prefix: string;
  children?: Record<string, FieldRule>;
}

function nestedContextOf(jsonKey: string): NestedContext {
  const rule = termFor(jsonKey)?.rule;
  if (rule?.form === 'blankNode') {
    return { prefix: rule.nestedPrefix ?? DEFAULT_NESTED_PREFIX, children: rule.children };
  }
  return { prefix: BLANK_NODE_PREDICATE_PREFIXES[jsonKey] ?? DEFAULT_NESTED_PREFIX };
}

/**
 * The key a nested child comes back under.
 *
 * ONE RULE: a short key is usable only if the WRITER, asked what it would emit
 * for that key on this node, gives back the predicate that was read. Otherwise
 * the key is the full IRI, which `childPredicateFor` writes in angle brackets —
 * so nothing is dropped either way, and the round trip is exact.
 *
 * THE CHECK APPLIES TO THE MAP'S ANSWER TOO, which is the whole correction.
 * `REVERSE_PREDICATE_MAP` resolves a predicate SPELLING to a JSON key across
 * the whole SDK, and consulting it first meant any predicate it recognised
 * skipped the test: `health:notes` inside a `cascade:emergencyContact` node
 * came back as `notes` and went out as `cascade:notes` — a different property,
 * under a vocabulary that never declared it, with `@prefix health:` dropped
 * from the header because nothing referenced it any more. The guard was written
 * for exactly that and ran only on the branch that did not need it.
 *
 * The map is CHECKED, never bypassed. Deleting the lookup also fixes the
 * corruption and costs far more: an untermed node has no declared children at
 * all, so the map is the only thing resolving `cascade:domain` to `domain`, and
 * without it every child of `wellnessSummary` comes back keyed by a full IRI.
 * `tests/rules/nested-namespace.test.ts` holds both ends of that.
 *
 * WRITABILITY IS SEPARATE FROM FIDELITY and both are required. `cascade:odd(name)`
 * expands to the very predicate it was read from and still does not parse —
 * `PN_LOCAL` admits far less than an IRI does — so a spelling that round-trips
 * in principle is rejected unless the writer can actually emit it.
 */
function childKeyFor(predicate: string, ctx: NestedContext): string {
  const candidate = REVERSE_PREDICATE_MAP.get(predicate) ?? localNameOf(predicate);
  if (!candidate) return predicate;

  const declared = Object.prototype.hasOwnProperty.call(ctx.children ?? {}, candidate)
    ? ctx.children?.[candidate]
    : undefined;
  const spelling = childPredicateFor(candidate, ctx.prefix, declared);

  return isWritable(spelling) && expandSpelling(spelling) === predicate ? candidate : predicate;
}

/** The local name of a predicate IRI: everything after the last `#` or `/`. */
function localNameOf(predicate: string): string {
  return predicate.slice(Math.max(predicate.lastIndexOf('#'), predicate.lastIndexOf('/')) + 1);
}

/**
 * A spelling the writer produced, expanded back to the IRI it denotes.
 *
 * `undefined` for a prefix no `NAMESPACES` entry covers, which fails the
 * comparison and sends the key to its full IRI — the safe direction.
 */
function expandSpelling(spelling: string): string | undefined {
  if (spelling.startsWith('<') && spelling.endsWith('>')) return spelling.slice(1, -1);
  const colon = spelling.indexOf(':');
  if (colon < 0) return undefined;
  const ns = (NAMESPACES as Record<string, string>)[spelling.slice(0, colon)];
  return ns === undefined ? undefined : `${ns}${spelling.slice(colon + 1)}`;
}

/**
 * Whether a spelling is one the writer can actually emit as Turtle.
 *
 * An angle-bracketed IRI always is. A prefixed name is only as good as its
 * local part, tested against the same character class `term.ts`'s
 * `PREFIXED_NAME` uses — the question is what the WRITER accepts, so a name
 * this admits and the writer refuses would be a round trip that throws instead
 * of one that parses.
 */
function isWritable(spelling: string): boolean {
  if (spelling.startsWith('<')) return true;
  const colon = spelling.indexOf(':');
  return colon > 0 && PN_LOCAL_SAFE.test(spelling.slice(colon + 1));
}

const PN_LOCAL_SAFE = /^[\w-]+$/;

function triplesToNestedObject(
  bnodeId: string,
  triples: ParsedTriple[],
  ctx: NestedContext,
): Record<string, unknown> {
  // Every child triple, collected per key and converted the same way a
  // top-level one is. Identical to `triplesToRecord`'s loop on purpose: a
  // child of a blank node is a triple like any other, and the two paths
  // disagreeing is how a nested enum kept its full URI while the top-level
  // spelling of the same field came back as a local name.
  const collected = new Map<string, unknown[]>();

  for (const t of triples) {
    if (t.subject !== bnodeId || t.predicate === RDF_TYPE) continue;

    // AN UNMAPPED CHILD IS RETURNED, under the predicate's local name.
    //
    // `REVERSE_PREDICATE_MAP` is generated from the terms' declared `children`,
    // so a predicate no term declares had no entry and this loop skipped it —
    // silently, one child at a time, leaving the rest of the node intact. That
    // was survivable while `childrenOf` dropped the same keys on the way out:
    // neither side could see them, and neither side could produce one.
    //
    // It stopped being survivable when the writer became faithful. A triple
    // this SDK writes and will not read back means a document it cannot
    // round-trip, and the loss lands hardest on data it did not author: read a
    // pod carrying `cascade:wardCount`, change one field, write it back, and
    // the key is gone from someone else's document with nothing raised
    // anywhere. Skipping it also LAUNDERS it — the record that comes back
    // conforms, so `validate()` has nothing left to refuse, which is the
    // vacuous pass this SDK is least able to detect.
    //
    // The local name, because that is the inverse of what the writer did:
    // `childrenOf` builds a child predicate as `prefix:key` from the JSON key,
    // so the key is recoverable from the predicate by construction. Two
    // predicates in different namespaces sharing a local name would collide
    // into one key — `health:status` and `coverage:status` under one node —
    // which is a real limit of this reading and not reachable from any
    // vocabulary the writer emits today, since a node's children are all
    // written under a single `nestedPrefix`.
    //
    // NOT the same reading at TOP LEVEL, where an unmapped predicate is still
    // skipped (`triplesToRecord`). Every predicate a record carries is a field
    // name in that namespace, so falling back there would turn any vocabulary
    // this SDK has not implemented into invented model fields. Here the scope
    // is one blank node whose children the writer just produced.
    const key = childKeyFor(t.predicate, ctx);
    if (!key) continue;

    const values = collected.get(key);
    if (values) {
      values.push(convertObject(t, key));
    } else {
      collected.set(key, [convertObject(t, key)]);
    }
  }

  const nested: Record<string, unknown> = {};
  for (const [key, values] of collected) {
    nested[key] = values.length === 1 ? values[0] : values;
  }
  return nested;
}

/**
 * One triple's object as the JSON value the model declares for `jsonKey`.
 *
 * Lifted out of `triplesToRecord`'s loop so it can be applied PER TRIPLE.
 * Arity and type are separate questions, and keeping every triple must not cost
 * the conversions: the old multi-value branch took raw `t.object`, so routing
 * everything through it returns the string `"true"` where a boolean belongs and
 * `"5"` where an integer does.
 */
function convertObject(triple: ParsedTriple, jsonKey: string): unknown {
  // dataProvenance: extract local name from cascade namespace
  if (jsonKey === 'dataProvenance') {
    const cascadeNs = NAMESPACES.cascade;
    return triple.object.startsWith(cascadeNs)
      ? triple.object.slice(cascadeNs.length)
      : triple.object;
  }

  // Prefixed enum individuals (e.g. health:sleepQuality health:Good) come
  // back as the bare local name the model uses.
  const enumNs = PREFIXED_ENUM_FIELDS[jsonKey];
  if (enumNs) {
    return triple.object.startsWith(enumNs) ? triple.object.slice(enumNs.length) : triple.object;
  }

  if (triple.objectType === 'boolean' || BOOLEAN_FIELDS.has(jsonKey)) {
    return triple.object === 'true';
  }

  if (
    INTEGER_TYPE_FIELDS.has(jsonKey) ||
    triple.objectType === 'integer' ||
    triple.datatype === NAMESPACES.xsd + 'integer'
  ) {
    return parseInt(triple.object, 10);
  }

  if (NUMBER_FIELDS.has(jsonKey)) {
    const num = parseFloat(triple.object);
    return isNaN(num) ? triple.object : num;
  }

  if (
    triple.objectType === 'double' ||
    triple.datatype === NAMESPACES.xsd + 'double' ||
    triple.datatype === NAMESPACES.xsd + 'decimal'
  ) {
    return parseFloat(triple.object);
  }

  // A URI keeps its full string, and a plain literal is itself.
  return triple.object;
}

/**
 * Convert parsed triples for a single subject into a typed record object.
 */
function triplesToRecord<T extends CascadeEntity>(
  subjectUri: string,
  triples: ParsedTriple[],
  recordType: string,
): T {
  const record: Record<string, unknown> = {
    id: subjectUri,
    type: recordType,
  };

  // Group triples by predicate for multi-value handling
  const triplesByPredicate = new Map<string, ParsedTriple[]>();
  for (const triple of triples) {
    if (triple.subject !== subjectUri) continue;
    if (triple.predicate === RDF_TYPE) continue;

    const existing = triplesByPredicate.get(triple.predicate);
    if (existing) {
      existing.push(triple);
    } else {
      triplesByPredicate.set(triple.predicate, [triple]);
    }
  }

  for (const [predUri, predTriples] of triplesByPredicate) {
    const jsonKey = REVERSE_PREDICATE_MAP.get(predUri);
    if (!jsonKey) continue;

    // Inline blank-node objects (core v3.4: an export manifest carries its
    // per-domain cascade:RecordSummary inline). Reconstructed rather than
    // reported as the bare blank-node identifier, which would silently drop
    // every count the manifest exists to carry.
    //
    // EVERY node, not the first. This read used to take `predTriples[0]`, and
    // `cascade:emergencyContact` is the field where that showed: the shape
    // declares no `sh:maxCount` for it — a profile may name more than one
    // person to call — and the writer honours that, so a document this SDK
    // wrote from two contacts came back as one. What is lost that way cannot be
    // caught downstream either: `validate()` judges what reached the record, so
    // a truncated read returns a clean verdict on incomplete data.
    //
    // The arity is the graph's, so ONE node stays a bare object rather than
    // becoming a one-element array. RDF has no "list of one" for a repeated
    // predicate, and always wrapping would invent structure the document does
    // not carry — the same reading {@link MultiValue} takes for a 0..* literal,
    // and what `triplesToNestedObject` already does with a repeated child.
    // A capped field is not special-cased here: the reader is faithful and
    // `validate()` is the judge, so two `cascade:address` nodes come back as
    // two and are REPORTED rather than quietly halved.
    const firstTriple = predTriples[0];
    if (
      NESTED_BLANK_NODE_FIELDS.has(jsonKey) &&
      firstTriple &&
      firstTriple.objectType === 'blankNode'
    ) {
      const nodes = predTriples
        .filter((t) => t.objectType === 'blankNode')
        .map((t) => triplesToNestedObject(t.object, triples, nestedContextOf(jsonKey)));
      record[jsonKey] = nodes.length === 1 ? nodes[0] : nodes;
      continue;
    }

    // Repeated inline blank nodes (clinical v1.16: an encounter's
    // participations). Each triple carries its own blank-node identifier, so
    // every participation is rebuilt, not just the first — keeping only the
    // first is exactly the maxCount-1 loss this class exists to fix.
    if (
      NESTED_BLANK_NODE_ARRAY_FIELDS.has(jsonKey) &&
      firstTriple &&
      firstTriple.objectType === 'blankNode'
    ) {
      record[jsonKey] = predTriples
        .filter((t) => t.objectType === 'blankNode')
        .map((t) => triplesToNestedObject(t.object, triples, nestedContextOf(jsonKey)));
      continue;
    }

    // Handle array fields
    if (ARRAY_TYPE_FIELDS.has(jsonKey)) {
      const values: string[] = [];
      for (const t of predTriples) {
        if (t.objectType === 'list') {
          try {
            const parsed = JSON.parse(t.object) as string[];
            values.push(...parsed);
          } catch {
            values.push(t.object);
          }
        } else {
          values.push(t.object);
        }
      }
      record[jsonKey] = CASCADE_LOCAL_NAME_LIST_FIELDS.has(jsonKey)
        ? values.map(stripCascadeQualifier)
        : values;
      continue;
    }

    // EVERY triple, whatever the field's declared cardinality. A reader that
    // kept the first would hand the validator a record with nothing left to
    // violate: the document that went in breaks sh:maxCount 1, the record that
    // comes back conforms, and re-serializing it launders the violation away.
    // Faithful first, judged second — which is the reasoning MULTI_VALUE_FIELDS
    // used to carry for two of its nine entries, generalized to all of them.
    //
    // Collapsed at one, so a conforming document is unchanged: `MultiValue<T>`
    // is `T | T[]`, and every field that was on the list already behaved this
    // way.
    const values = predTriples.map((t) => convertObject(t, jsonKey));
    if (values.length === 0) continue;
    record[jsonKey] = values.length === 1 ? values[0] : values;
  }

  return record as T;
}

/**
 * Parse Turtle content and return typed records matching the specified type.
 *
 * @param turtle - Turtle document content
 * @param type - Record type string (e.g., "MedicationRecord", "VitalSign", "PatientProfile")
 * @returns Array of parsed records of the specified type
 *
 * @example
 * ```typescript
 * import { deserialize } from '@the-cascade-protocol/sdk';
 * import type { Medication } from '@the-cascade-protocol/sdk';
 *
 * const meds = deserialize<Medication>(turtleString, 'MedicationRecord');
 * ```
 */
export function deserialize<T extends CascadeEntity>(turtle: string, type: string): T[] {
  const triples = parseTurtleWithN3(turtle);

  // Every class this type answers to, deprecated spellings included.
  const acceptedUris = acceptedClassUris(type);
  if (!acceptedUris) {
    throw new Error(`Unknown record type: ${type}. Cannot resolve to RDF type URI.`);
  }

  const accepted = new Set(acceptedUris);
  const matchingSubjects: string[] = [];
  for (const triple of triples) {
    if (triple.predicate === RDF_TYPE && accepted.has(triple.object)) {
      matchingSubjects.push(triple.subject);
    }
  }

  // The spelling a read RETURNS, which is not necessarily the one it was asked
  // under: `deserialize(ttl, 'ProcedureRecord')` finds the same subjects and
  // answers `Procedure`, the literal `src/models/procedure.ts` declares.
  const recordType = recordTypeFor(type)?.name ?? type;

  // Convert each subject to a record
  return matchingSubjects.map((subjectUri) =>
    triplesToRecord<T>(subjectUri, triples, recordType),
  );
}

/**
 * Parse a single record from Turtle content.
 *
 * Returns the first record matching the specified type, or `null` if none found.
 *
 * @param turtle - Turtle document content
 * @param type - Record type string
 * @returns The parsed record, or null
 */
export function deserializeOne<T extends CascadeEntity>(turtle: string, type: string): T | null {
  const results = deserialize<T>(turtle, type);
  return results[0] ?? null;
}
