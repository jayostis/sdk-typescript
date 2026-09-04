/**
 * `NAMESPACES` and `PROPERTY_PREDICATES`, read out of `src/vocabularies/namespaces.ts`.
 *
 * READ, NOT IMPORTED. The generators are plain JavaScript and the module is
 * TypeScript in a project with `allowJs` off; nothing under `scripts/` can
 * import it, and nothing under `src/` may import from `scripts/`
 * (`tests/no-runtime-deps.test.ts`). A text scan of the two object literals
 * is the alternative to a shared manifest neither side has, and it is
 * deliberately narrow: an entry is one line of the form `key: 'value',`,
 * which is the only form either table has ever used. A line in the literal
 * that is not one of those is REFUSED, naming it, rather than skipped: a
 * skipped entry is one `declared-predicate-not-in-ontology` never sees, so a
 * registration written with double quotes or a template literal — the
 * hand-added kind that check exists for — would read as clean. Nothing in
 * the repository holds the file to one quoting style, so the scan has to say
 * when it met a line it does not understand. An empty block is refused for
 * the same reason: "the SDK registers no predicates" is the answer this must
 * never give by accident.
 *
 * WHY THE SDK'S OWN PREFIX TABLE. `namespaces.ts` disagrees with spec's on at
 * least one prefix (`dcterms` here, `dc` there), so expanding its CURIEs with
 * spec's map would leave some unexpanded and trivially unmatched. The table
 * the entries were written against is the one that expands them.
 *
 * @module scripts/lib/predicates-module
 */

import { readFileSync } from 'node:fs';

/** The text between `export const <name>` and the first line consisting of `}`. */
function objectLiteral(source, name, path) {
  const start = source.indexOf(`export const ${name}`);
  if (start < 0) throw new Error(`${path} exports no ${name}`);

  const open = source.indexOf('{', start);
  const close = source.indexOf('\n}', open);
  if (open < 0 || close < 0) throw new Error(`${path}: could not find the ${name} object literal`);

  return source.slice(open + 1, close);
}

/** The one line shape an entry may take: `key: 'value',`, with an optional trailing comment. */
const ENTRY = /^\s*'?([A-Za-z_$][\w$-]*)'?\s*:\s*'([^']*)'\s*,?\s*(?:\/\/.*)?$/;

/** `key -> value` for every `key: 'value'` line in an object literal's body. */
function entries(body, name, path) {
  // Block comments go; line comments only where they are the whole line, since
  // every namespace value contains `//`. A trailing comment after an entry is
  // admitted by the entry pattern itself.
  const stripped = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const found = [];
  const unreadable = [];

  for (const line of stripped.split('\n')) {
    if (line.trim() === '') continue;
    const match = ENTRY.exec(line);
    if (match) found.push([match[1], match[2]]);
    else unreadable.push(line.trim());
  }

  if (unreadable.length > 0) {
    throw new Error(
      `${path}: ${name} has ${unreadable.length} line(s) this reader cannot read as \`key: 'value',\`, `
      + `and an entry it skipped is one no check would see. Rewrite in that form:\n`
      + unreadable.map((line) => `  ${line}`).join('\n'),
    );
  }
  if (found.length === 0) throw new Error(`${path}: ${name} yielded no entries, which cannot be right`);

  return Object.fromEntries(found);
}

/**
 * The two tables, plus each predicate expanded through the file's own prefixes.
 *
 * @param {string} path - `src/vocabularies/namespaces.ts` or a stand-in in its shape.
 * @returns {{
 *   namespaces: Record<string, string>,
 *   predicates: Record<string, string>,
 *   expanded: { key: string, curie: string, prefix: string | null, iri: string }[],
 * }}
 */
export function readPredicatesModule(path) {
  // Line endings normalised: `core.autocrlf` gives a Windows checkout CRLF,
  // and `$` in multiline mode stops before the carriage return.
  const source = readFileSync(path, 'utf-8').replace(/\r\n/g, '\n');
  const namespaces = entries(objectLiteral(source, 'NAMESPACES', path), 'NAMESPACES', path);
  const predicates = entries(objectLiteral(source, 'PROPERTY_PREDICATES', path), 'PROPERTY_PREDICATES', path);

  const expanded = Object.entries(predicates).map(([key, curie]) => {
    const colon = curie.indexOf(':');
    const prefix = colon > 0 ? curie.slice(0, colon) : null;
    const namespace = prefix ? namespaces[prefix] : undefined;
    return { key, curie, prefix, iri: namespace ? `${namespace}${curie.slice(colon + 1)}` : curie };
  });

  return { namespaces, predicates, expanded };
}
