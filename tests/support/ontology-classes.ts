/**
 * Every class the stable ontologies declare, as the derivation wants them.
 *
 * The I/O half of `src/record-types/derive.ts`. That module is pure and takes
 * its classes as an argument; this is what the argument is built from, and it
 * lives in `tests/` because `src/` cannot read a `spec` checkout — a consumer
 * installs `dist` and has none.
 *
 * PARSED BY LINE, NOT BY A TURTLE PARSER, and the reason is worth stating.
 * Every class in `spec` declares its prefix on the line that declares the
 * class, so a `^prefix:LocalName a owl:Class` match is exact, needs no
 * namespace resolution, and reports the CURIE the ontology actually wrote —
 * which is what the committed table is spelled in. A parsed graph would hand
 * back expanded IRIs and lose the one thing being compared.
 */

import { readFileSync } from 'node:fs';

import type { ClassDeclaration } from '../../src/record-types/index.js';
import { pathsFor, vocabularies } from './spec-sources.js';

/** `cascade:Thing a owl:Class`, with the comment stripped off the line first. */
const DECLARATION = /^\s*([a-z][A-Za-z0-9]*):([A-Za-z0-9_]+)\s+a\s+owl:Class\b/;

/**
 * `owl:deprecated`, in BOTH spellings.
 *
 * `true` and `"true"^^xsd:boolean` are the same triple, and `spec` writes both:
 * the four classes clinical v1.13 deprecated use the bare literal, and
 * `clinical:CoverageRecord` (v1.5, `clinical.ttl:190`) uses the typed one. A
 * pattern matching only the short form calls that class live, and the
 * derivation then resolves the accepted input spelling `CoverageRecord`
 * straight back to the class #26 removed — a wrong answer wearing the shape of
 * a right one, since the row it produces looks exactly like a derived row.
 */
const DEPRECATED = /owl:deprecated\s+(?:true|"true"\^\^xsd:boolean)/;

/** Everything up to the `.` that ends a subject's block. */
function blockFrom(lines: readonly string[], start: number): string[] {
  const block: string[] = [];

  for (let i = start; i < lines.length; i++) {
    const line = lines[i] as string;
    block.push(line);
    if (/\.\s*$/.test(line.trim()) && !/;\s*$/.test(line.trim())) break;
  }

  return block;
}

/**
 * Every `owl:Class` declared across the vocabularies `spec-sources.json` names.
 *
 * Not every class in the checkout: the manifest decides, exactly as it does for
 * the shapes graph. A vocabulary still at `v1-draft` declares classes this SDK
 * has no reason to resolve a name against, and admitting them would let a draft
 * introduce a local-name collision in a stable one.
 */
export function ontologyClasses(): ClassDeclaration[] {
  const classes: ClassDeclaration[] = [];

  for (const vocabulary of vocabularies()) {
    const lines = readFileSync(pathsFor(vocabulary).ontology, 'utf-8').split('\n');

    lines.forEach((line, index) => {
      // A `#` inside an IRI is not a comment, and every namespace in this
      // corpus ends in one.
      const declaration = line.replace(/#(?![^<]*>).*$/, '').match(DECLARATION);
      if (!declaration) return;

      classes.push({
        prefix: declaration[1] as string,
        localName: declaration[2] as string,
        deprecated: blockFrom(lines, index).some((l) => DEPRECATED.test(l)),
      });
    });
  }

  return classes;
}
