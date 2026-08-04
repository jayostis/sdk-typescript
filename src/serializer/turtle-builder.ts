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

// ─── String Escaping ────────────────────────────────────────────────────────

/**
 * Escape a string value for use in a Turtle literal.
 *
 * Handles backslashes, double quotes, newlines, carriage returns, and tabs.
 * For very long strings (> 200 chars) or strings containing embedded newlines,
 * uses triple-quoted long literals.
 */
export function escapeTurtleString(value: string): string {
  // Use triple-quoted long literal for very long strings or strings with embedded newlines
  if (value.length > 200 || value.includes('\n')) {
    const longEscaped = value
      .replace(/\\/g, '\\\\')
      .replace(/"""/g, '\\"\\"\\"');
    return `"""${longEscaped}"""`;
  }
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
  return `"${escaped}"`;
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
