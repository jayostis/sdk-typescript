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

import {
  DEPRECATED_TYPE_ALIASES,
  NAMESPACES,
  TYPE_MAPPING,
  TYPE_TO_MAPPING_KEY,
  buildReversePredicateMap,
} from '../vocabularies/namespaces.js';
import type { CascadeEntity } from '../models/common.js';

// ─── Internal Types ─────────────────────────────────────────────────────────

interface ParsedTriple {
  subject: string;
  predicate: string;
  object: string;
  objectType: 'uri' | 'literal' | 'boolean' | 'integer' | 'double' | 'list' | 'blankNode';
  datatype?: string;
}

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
  // health v2.7 / clinical v1.15. Unambiguous: the local name belongs to one
  // field in either namespace. Without it a vital's verbatim source code is
  // WRITTEN and then dropped on read, which is the same silent loss the
  // property exists to prevent, moved from the writer to the reader.
  [`${NAMESPACES.clinical}interpretationSourceCode`]: 'interpretationSourceCode',

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
};

const REVERSE_PREDICATE_MAP = buildReversePredicateMap(ADDITIONAL_REVERSE_MAPPINGS);

/**
 * Build a reverse mapping from RDF type URI to record type string.
 */
/**
 * Build a reverse mapping from mapping key to the canonical TypeScript type name.
 * Uses the first entry in TYPE_TO_MAPPING_KEY that maps to each mapping key.
 */
function buildMappingKeyToTypeName(): Map<string, string> {
  const map = new Map<string, string>();
  for (const [typeName, mappingKey] of Object.entries(TYPE_TO_MAPPING_KEY)) {
    if (!map.has(mappingKey)) {
      map.set(mappingKey, typeName);
    }
  }
  return map;
}

const MAPPING_KEY_TO_TYPE_NAME = buildMappingKeyToTypeName();

function buildReverseTypeMap(): Map<string, { recordType: string; mappingKey: string }> {
  const reverseMap = new Map<string, { recordType: string; mappingKey: string }>();
  for (const [key, mapping] of Object.entries(TYPE_MAPPING)) {
    const colonIdx = mapping.rdfType.indexOf(':');
    if (colonIdx >= 0) {
      const nsPrefix = mapping.rdfType.slice(0, colonIdx);
      const localName = mapping.rdfType.slice(colonIdx + 1);
      const nsUri = NAMESPACES[nsPrefix as keyof typeof NAMESPACES];
      if (nsUri) {
        // Use the canonical TypeScript type name if available, otherwise fall back to localName
        const recordType = MAPPING_KEY_TO_TYPE_NAME.get(key) ?? localName;
        reverseMap.set(`${nsUri}${localName}`, { recordType, mappingKey: key });
      }
    }
  }
  return reverseMap;
}

const REVERSE_TYPE_MAP = buildReverseTypeMap();

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
 * String-valued properties whose vocabulary cardinality is `0..*`. The
 * serializer writes one repeated-predicate triple per value; this is the
 * reading side of that.
 *
 * ARITY-PRESERVING, and deliberately not a member of {@link ARRAY_TYPE_FIELDS}:
 * one triple reads back as a bare string, N triples read back as an N-element
 * array. Always returning an array would report structure the graph does not
 * carry, and would change what every existing single-coded record deserializes
 * to. Keeping only the first triple, which is what happened before v2.0.0,
 * silently discarded every coding after the first.
 */
const MULTI_VALUE_FIELDS = new Set([
  // health v2.6 / clinical v1.14
  'testCode',
  'labCategory',
  'icd10Code',
  'snomedCode',
  // clinical v1.16. The last is nested inside a participation blank node and is
  // resolved by triplesToNestedObject, which consults this same set.
  'encounterReason',
  'businessIdentifier',
  'documentAuthorName',
  'participantRoleCode',
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
 * Parse Turtle content into a list of parsed triples.
 *
 * This is a lightweight regex-based parser that handles the subset of Turtle
 * used by Cascade Protocol records. It does NOT implement a full Turtle grammar.
 */
function parseTurtleContent(content: string): {
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
 * Resolve a Cascade record type string (e.g., "MedicationRecord") to the full
 * RDF type URI used in Turtle.
 */
function resolveTypeUri(type: string): string | null {
  // Try via TYPE_TO_MAPPING_KEY first (handles cases where the TypeScript
  // type name differs from the RDF local name, e.g. 'MedicationRecord' -> 'clinical:Medication')
  const mappingKey = TYPE_TO_MAPPING_KEY[type];
  if (mappingKey) {
    const mapping = TYPE_MAPPING[mappingKey];
    if (mapping) {
      const colonIdx = mapping.rdfType.indexOf(':');
      if (colonIdx >= 0) {
        const nsPrefix = mapping.rdfType.slice(0, colonIdx);
        const localName = mapping.rdfType.slice(colonIdx + 1);
        const nsUri = NAMESPACES[nsPrefix as keyof typeof NAMESPACES];
        if (nsUri) return `${nsUri}${localName}`;
      }
    }
  }

  // Fallback: try direct match in TYPE_MAPPING values by RDF local name
  for (const mapping of Object.values(TYPE_MAPPING)) {
    const colonIdx = mapping.rdfType.indexOf(':');
    if (colonIdx >= 0) {
      const nsPrefix = mapping.rdfType.slice(0, colonIdx);
      const localName = mapping.rdfType.slice(colonIdx + 1);
      if (localName === type) {
        const nsUri = NAMESPACES[nsPrefix as keyof typeof NAMESPACES];
        if (nsUri) return `${nsUri}${localName}`;
      }
    }
  }
  return null;
}

/**
 * Every RDF type IRI a subject may carry and still be read back as `typeUri`.
 *
 * This is where clinical v1.13's read/write asymmetry lives. v1.13 deprecated
 * `clinical:LabResult`, `clinical:Condition`, `clinical:Allergy` and
 * `clinical:Immunization` but did NOT remove them: the pod export path is still
 * their sole emitter and existing pods contain them. Refusing to read those
 * pods would be a data-loss bug dressed up as standards compliance, so the
 * deprecated spellings stay readable here while `TYPE_MAPPING` keeps this SDK
 * from ever writing one.
 */
function acceptedTypeUris(typeUri: string): string[] {
  const accepted = [typeUri];
  for (const [deprecated, supersededBy] of Object.entries(DEPRECATED_TYPE_ALIASES)) {
    if (supersededBy === typeUri) accepted.push(deprecated);
  }
  return accepted;
}

/**
 * Fields whose Turtle object is an inline blank node that must be rebuilt into
 * a nested JSON object rather than reported as a blank-node identifier.
 *
 * Deliberately narrow. The patient-profile sub-structures
 * (`emergencyContact`, `address`, `preferredPharmacy`) are also blank nodes and
 * are NOT reconstructed today; widening this to every blank node is a separate
 * change with its own compatibility question.
 */
const NESTED_BLANK_NODE_FIELDS = new Set(['clinicalSummary', 'wellnessSummary']);

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
function triplesToNestedObject(
  bnodeId: string,
  triples: ParsedTriple[],
): Record<string, unknown> {
  const nested: Record<string, unknown> = {};
  // 0..* nested properties are collected across every triple before being
  // assigned, so arity is preserved the same way it is at the top level.
  const multiValued = new Map<string, string[]>();

  for (const t of triples) {
    if (t.subject !== bnodeId || t.predicate === RDF_TYPE) continue;
    const key = REVERSE_PREDICATE_MAP.get(t.predicate);
    if (!key) continue;

    if (MULTI_VALUE_FIELDS.has(key)) {
      const existing = multiValued.get(key);
      if (existing) {
        existing.push(t.object);
      } else {
        multiValued.set(key, [t.object]);
      }
      continue;
    }

    if (t.objectType === 'boolean') {
      nested[key] = t.object === 'true';
    } else if (
      t.objectType === 'integer' ||
      t.datatype === `${NAMESPACES.xsd}integer`
    ) {
      nested[key] = parseInt(t.object, 10);
    } else if (
      t.objectType === 'double' ||
      t.datatype === `${NAMESPACES.xsd}double` ||
      t.datatype === `${NAMESPACES.xsd}decimal`
    ) {
      nested[key] = parseFloat(t.object);
    } else {
      nested[key] = t.object;
    }
  }

  for (const [key, values] of multiValued) {
    nested[key] = values.length === 1 ? values[0] : values;
  }
  return nested;
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
    const firstTriple = predTriples[0];
    if (
      NESTED_BLANK_NODE_FIELDS.has(jsonKey) &&
      firstTriple &&
      firstTriple.objectType === 'blankNode'
    ) {
      record[jsonKey] = triplesToNestedObject(firstTriple.object, triples);
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
        .map((t) => triplesToNestedObject(t.object, triples));
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

    // 0..* string properties: every triple, arity preserved.
    if (MULTI_VALUE_FIELDS.has(jsonKey)) {
      const values = predTriples.map((t) => t.object);
      record[jsonKey] = values.length === 1 ? values[0] : values;
      continue;
    }

    // Single-value fields use the first triple
    const triple = predTriples[0];
    if (!triple) continue;

    // dataProvenance: extract local name from cascade namespace
    if (jsonKey === 'dataProvenance') {
      const cascadeNs = NAMESPACES.cascade;
      if (triple.object.startsWith(cascadeNs)) {
        record[jsonKey] = triple.object.slice(cascadeNs.length);
      } else {
        record[jsonKey] = triple.object;
      }
      continue;
    }

    // Prefixed enum individuals (e.g. health:sleepQuality health:Good) come
    // back as the bare local name the model uses.
    const enumNs = PREFIXED_ENUM_FIELDS[jsonKey];
    if (enumNs) {
      record[jsonKey] = triple.object.startsWith(enumNs)
        ? triple.object.slice(enumNs.length)
        : triple.object;
      continue;
    }

    // Boolean fields
    if (triple.objectType === 'boolean' || BOOLEAN_FIELDS.has(jsonKey)) {
      record[jsonKey] = triple.object === 'true';
      continue;
    }

    // Integer fields
    if (INTEGER_TYPE_FIELDS.has(jsonKey) || triple.objectType === 'integer' ||
        triple.datatype === NAMESPACES.xsd + 'integer') {
      record[jsonKey] = parseInt(triple.object, 10);
      continue;
    }

    // Number fields (plain numeric)
    if (NUMBER_FIELDS.has(jsonKey)) {
      const num = parseFloat(triple.object);
      if (!isNaN(num)) {
        record[jsonKey] = num;
      } else {
        record[jsonKey] = triple.object;
      }
      continue;
    }

    // Double/decimal fields
    if (triple.objectType === 'double' ||
        triple.datatype === NAMESPACES.xsd + 'double' ||
        triple.datatype === NAMESPACES.xsd + 'decimal') {
      record[jsonKey] = parseFloat(triple.object);
      continue;
    }

    // URI fields: keep the full URI string
    if (triple.objectType === 'uri') {
      record[jsonKey] = triple.object;
      continue;
    }

    // Default: string literal
    record[jsonKey] = triple.object;
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
  const { triples } = parseTurtleContent(turtle);

  // Resolve the requested type to a full URI
  const typeUri = resolveTypeUri(type);
  if (!typeUri) {
    throw new Error(`Unknown record type: ${type}. Cannot resolve to RDF type URI.`);
  }

  // Find all subjects with a matching rdf:type. Deprecated-but-still-emitted
  // clinical: spellings count as matches (clinical v1.13).
  const accepted = new Set(acceptedTypeUris(typeUri));
  const matchingSubjects: string[] = [];
  for (const triple of triples) {
    if (triple.predicate === RDF_TYPE && accepted.has(triple.object)) {
      matchingSubjects.push(triple.subject);
    }
  }

  // Look up the record type name from REVERSE_TYPE_MAP
  const typeInfo = REVERSE_TYPE_MAP.get(typeUri);
  const recordType = typeInfo?.recordType ?? type;

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
