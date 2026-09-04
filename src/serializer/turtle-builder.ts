/**
 * Fluent builder API for constructing Turtle (Terse RDF Triple Language) documents.
 *
 * Provides a class-based API for building well-formed Turtle output with
 * proper prefix declarations, typed literals, URI references, blank nodes,
 * and RDF lists.
 *
 * @example
 * ```typescript
 * import { TurtleBuilder } from '@the-cascade-protocol/sdk';
 *
 * const turtle = new TurtleBuilder()
 *   .prefix('cascade', 'https://ns.cascadeprotocol.org/core/v1#')
 *   .prefix('health', 'https://ns.cascadeprotocol.org/health/v1#')
 *   .subject('<urn:uuid:abc>')
 *     .type('clinical:Medication')
 *     .literal('clinical:drugName', 'Lisinopril')
 *     .boolean('clinical:status', true)
 *     .done()
 *   .build();
 * ```
 *
 * @module serializer
 */

import type { Output } from '../terms/index.js';

// ─── String Escaping ────────────────────────────────────────────────────────

/**
 * A string as a one-line quoted literal — the form N-Triples allows and Turtle
 * shares.
 *
 * THE ONE PLACE THIS REPOSITORY DECIDES HOW A LITERAL IS SPELLED.
 * `src/converter/to-rdf.ts` writes literals too, and it had its own scheme: a
 * second set of control-character rules, in a function whose output is exported
 * to consumers rather than always reparsed here. Two schemes means a fix to
 * either is a fix to half the output, and which half a caller gets depends on
 * whether their record type has been routed to the generic writer.
 *
 * `JSON.stringify` IS THE ESCAPER, not a shortcut around one. JSON's string
 * escapes are a subset of Turtle's: `\"`, `\\`, `\n`, `\r`, `\t`, `\b` and `\f`
 * are all Turtle ECHARs, and everything else JSON escapes it escapes as
 * `\uXXXX`, which is a Turtle UCHAR. Written by hand, the five-replace chain
 * this replaces passed U+0000 and U+0007 through as raw bytes — legal by the
 * grammar, and the kind of thing a downstream tool refuses while naming neither
 * the record nor the field.
 */
export function quoteTurtleString(value: string): string {
  return JSON.stringify(value);
}

/**
 * Escape a string value for use in a Turtle literal.
 *
 * For very long strings (> 200 chars) or strings containing embedded newlines,
 * uses triple-quoted long literals; otherwise the one-line form
 * {@link quoteTurtleString} defines. A long literal is Turtle only — N-Triples
 * has no triple-quoted form — which is why the two are separate functions and
 * the generic writer takes the narrower one.
 */
export function escapeTurtleString(value: string): string {
  // Use triple-quoted long literal for very long strings or strings with embedded newlines
  if (value.length > 200 || value.includes('\n')) {
    const longEscaped = value
      .replace(/\\/g, '\\\\')
      .replace(/"""/g, '\\"\\"\\"');
    return `"""${longEscaped}"""`;
  }
  return quoteTurtleString(value);
}

// ─── SubjectBuilder ─────────────────────────────────────────────────────────

/**
 * Builder for adding predicate-object pairs to a single RDF subject.
 *
 * Obtained via `TurtleBuilder.subject()`. Call `.done()` to return to the
 * parent `TurtleBuilder`.
 */
export class SubjectBuilder {
  private readonly _parent: TurtleBuilder;
  private readonly _subject: string;
  private readonly _predicates: string[] = [];

  /** @internal */
  constructor(parent: TurtleBuilder, subject: string) {
    this._parent = parent;
    this._subject = subject;
  }

  /** Add an `rdf:type` declaration. */
  type(rdfType: string): this {
    this._predicates.push(`a ${rdfType}`);
    return this;
  }

  /** Add a plain string literal. Optionally with a datatype IRI. */
  literal(predicate: string, value: string, datatype?: string): this {
    if (datatype) {
      this._predicates.push(`${predicate} ${escapeTurtleString(value)}^^${datatype}`);
    } else {
      this._predicates.push(`${predicate} ${escapeTurtleString(value)}`);
    }
    return this;
  }

  /** Add a URI reference (angle-bracket enclosed). */
  uri(predicate: string, uriValue: string): this {
    // If already prefixed (e.g., cascade:ClinicalGenerated), use as-is
    if (/^[a-zA-Z][\w-]*:[\w-]+$/.test(uriValue)) {
      this._predicates.push(`${predicate} ${uriValue}`);
    } else {
      this._predicates.push(`${predicate} <${uriValue}>`);
    }
    return this;
  }

  /** Add a boolean literal (unquoted `true` or `false`). */
  boolean(predicate: string, value: boolean): this {
    this._predicates.push(`${predicate} ${value}`);
    return this;
  }

  /** Add an integer literal with `^^xsd:integer` datatype. */
  integer(predicate: string, value: number): this {
    this._predicates.push(`${predicate} "${value}"^^xsd:integer`);
    return this;
  }

  /** Add a double/decimal literal with `^^xsd:double` datatype. */
  double(predicate: string, value: number): this {
    this._predicates.push(`${predicate} "${value}"^^xsd:double`);
    return this;
  }

  /** Add a plain numeric value (no datatype annotation, for integers). */
  number(predicate: string, value: number): this {
    this._predicates.push(`${predicate} ${value}`);
    return this;
  }

  /**
   * Add a plain decimal literal with no datatype annotation, e.g.
   * `health:durationHours 7.4`.
   *
   * This is the form Cascade Turtle uses for decimals; RDF 1.1 already types a
   * bare `7.4` as `xsd:decimal`, so the annotation adds nothing. Prefer this
   * over {@link SubjectBuilder.double}, which spells the datatype out and is
   * kept only for callers that need the explicit form.
   */
  decimal(predicate: string, value: number): this {
    this._predicates.push(`${predicate} ${value}`);
    return this;
  }

  /** Add a `^^xsd:dateTime` typed literal. */
  dateTime(predicate: string, value: string): this {
    this._predicates.push(`${predicate} "${value}"^^xsd:dateTime`);
    return this;
  }

  /** Add a `^^xsd:date` typed literal. */
  date(predicate: string, value: string): this {
    this._predicates.push(`${predicate} "${value}"^^xsd:date`);
    return this;
  }

  /** Add an RDF list (Turtle shorthand `( item1 item2 ... )`). Items are treated as string literals. */
  list(predicate: string, items: string[]): this {
    const formatted = items.map((item) => escapeTurtleString(item)).join(' ');
    this._predicates.push(`${predicate} ( ${formatted} )`);
    return this;
  }

  /**
   * Add an RDF list whose members are IRIs or prefixed names, e.g.
   * `cascade:deviceSources ( <urn:uuid:a> cascade:DeviceGenerated )`.
   *
   * Each item is emitted the same way {@link SubjectBuilder.uri} emits a single
   * object: already-prefixed names pass through, everything else is wrapped in
   * angle brackets. Use this rather than {@link SubjectBuilder.list} whenever
   * the members are resources, since `list` would quote them into literals.
   */
  uriList(predicate: string, items: string[]): this {
    const formatted = items
      .map((item) => (/^[a-zA-Z][\w-]*:[\w-]+$/.test(item) ? item : `<${item}>`))
      .map((item) => `        ${item}`)
      .join('\n');
    this._predicates.push(`${predicate} (\n${formatted}\n    )`);
    return this;
  }

  /** Add a blank node with nested predicate-object pairs. */
  blankNode(predicate: string, callback: (b: SubjectBuilder) => void): this {
    const inner = new SubjectBuilder(this._parent, '');
    callback(inner);
    const innerLines = inner._predicates.map((p, i, arr) => {
      const sep = i < arr.length - 1 ? ' ;' : '';
      return `        ${p}${sep}`;
    });
    this._predicates.push(`${predicate} [\n${innerLines.join('\n')}\n    ]`);
    return this;
  }

  /**
   * Write every {@link Output} a term produced, dispatching each to the
   * builder method for its kind.
   *
   * A dispatcher, not a second implementation: the Turtle produced for each
   * kind is identical to calling that method directly. An empty array is a
   * no-op, so a caller holding `term.outputsFor(record)` needs no guard for an
   * absent field.
   *
   * Every {@link Output} carries a finished value, so each case here has one
   * method to call and one way to pass its arguments: the prefix, the datatype
   * and the escaping were all decided in the term, where they are pure data.
   */
  addAll(outputs: Output[]): this {
    for (const output of outputs) {
      switch (output.kind) {
        case 'literal':
          this.literal(output.predicate, output.value, output.datatype);
          break;
        case 'number':
          // Both write a bare token today; the split mirrors `emitField` so the
          // two paths stay aligned if either method ever spells a datatype out.
          if (Number.isInteger(output.value)) {
            this.number(output.predicate, output.value);
          } else {
            this.decimal(output.predicate, output.value);
          }
          break;
        case 'boolean':
          this.boolean(output.predicate, output.value);
          break;
        case 'uri':
          this.uri(output.predicate, output.value);
          break;
        case 'uriList':
          this.uriList(output.predicate, output.items);
          break;
        case 'list':
          this.list(output.predicate, output.items);
          break;
        case 'blankNode':
          this.blankNode(output.predicate, (b) => {
            // Guarded like `serializeBlankNode`: an untyped blank node is
            // written without an `a` line, never with an empty one.
            if (output.rdfType) b.type(output.rdfType);
            b.addAll(output.children);
          });
          break;
        default: {
          // Exhaustive by construction: adding a kind to `Output` without a
          // case here is a COMPILE error on this assignment. Without it the
          // switch would fall through in silence and every output of the new
          // kind would be dropped, producing records missing triples with
          // nothing anywhere reporting it. The throw covers the runtime half —
          // a JS caller, or an output widened past the type.
          const unhandled: never = output;
          throw new Error(`Unhandled output kind: ${JSON.stringify(unhandled)}`);
        }
      }
    }
    return this;
  }

  /** Finalize this subject block and return to the parent TurtleBuilder. */
  done(): TurtleBuilder {
    this._parent._addSubjectBlock(this._subject, this._predicates);
    return this._parent;
  }
}

// ─── TurtleBuilder ──────────────────────────────────────────────────────────

/**
 * Fluent builder for constructing complete Turtle documents.
 *
 * Usage:
 * 1. Add prefix declarations with `.prefix()`
 * 2. Add subject blocks with `.subject()` -> `SubjectBuilder` -> `.done()`
 * 3. Call `.build()` to produce the final Turtle string
 */
export class TurtleBuilder {
  private readonly _prefixes: Map<string, string> = new Map();
  private readonly _blocks: string[] = [];

  /** Declare a namespace prefix. */
  prefix(prefixName: string, uri: string): this {
    this._prefixes.set(prefixName, uri);
    return this;
  }

  /** Begin a new subject block. Returns a SubjectBuilder for adding predicates. */
  subject(uri: string): SubjectBuilder {
    return new SubjectBuilder(this, uri);
  }

  /**
   * @internal
   * Called by SubjectBuilder.done() to register a completed subject block.
   */
  _addSubjectBlock(subject: string, predicates: string[]): void {
    if (predicates.length === 0) return;

    const lines: string[] = [];

    if (predicates.length === 1) {
      // Single predicate: subject and predicate on the same line
      lines.push(`${subject} ${predicates[0]} .`);
    } else {
      // First predicate on the same line as the subject
      lines.push(`${subject} ${predicates[0]} ;`);
      // Remaining predicates indented
      for (let i = 1; i < predicates.length; i++) {
        const isLast = i === predicates.length - 1;
        lines.push(`    ${predicates[i]}${isLast ? ' .' : ' ;'}`);
      }
    }

    this._blocks.push(lines.join('\n'));
  }

  /** Build the complete Turtle document string. */
  build(): string {
    const parts: string[] = [];

    // Prefix declarations
    for (const [name, uri] of this._prefixes) {
      parts.push(`@prefix ${name}: <${uri}> .`);
    }

    // Blank line between prefixes and content
    if (this._prefixes.size > 0 && this._blocks.length > 0) {
      parts.push('');
    }

    // Subject blocks
    parts.push(...this._blocks);

    return parts.join('\n') + '\n';
  }
}
