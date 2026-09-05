// n3@2.6.0 — Parser and Writer, bundled from node_modules/n3/src/ by
// scripts/vendor-n3.mjs. Generated: do not edit. MIT, see LICENSE.md beside
// this file; the transforms applied are declared in the script.

// buffer-shim:buffer
var Buffer = {
  concat() {
    throw new Error(
      "streaming input is not supported by the vendored n3 in @the-cascade-protocol/sdk; hand the parser a complete string"
    );
  }
};

// node_modules/n3/src/IRIs.js
var RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
var XSD = "http://www.w3.org/2001/XMLSchema#";
var SWAP = "http://www.w3.org/2000/10/swap/";
var IRIs_default = {
  xsd: {
    decimal: `${XSD}decimal`,
    boolean: `${XSD}boolean`,
    dateTime: `${XSD}dateTime`,
    double: `${XSD}double`,
    integer: `${XSD}integer`,
    string: `${XSD}string`
  },
  rdf: {
    type: `${RDF}type`,
    nil: `${RDF}nil`,
    first: `${RDF}first`,
    rest: `${RDF}rest`,
    langString: `${RDF}langString`,
    dirLangString: `${RDF}dirLangString`,
    reifies: `${RDF}reifies`
  },
  owl: {
    sameAs: "http://www.w3.org/2002/07/owl#sameAs"
  },
  r: {
    forSome: `${SWAP}reify#forSome`,
    forAll: `${SWAP}reify#forAll`
  },
  log: {
    implies: `${SWAP}log#implies`,
    isImpliedBy: `${SWAP}log#isImpliedBy`
  }
};

// node_modules/n3/src/N3Lexer.js
var { xsd } = IRIs_default;
var escapeSequence = /\\u([a-fA-F0-9]{4})|\\U([a-fA-F0-9]{8})|\\([^])/g;
var stringEscapeReplacements = {
  "\\": "\\",
  "'": "'",
  '"': '"',
  "n": "\n",
  "r": "\r",
  "t": "	",
  "f": "\f",
  "b": "\b"
};
var localNameEscapeReplacements = {
  "_": "_",
  "~": "~",
  ".": ".",
  "-": "-",
  "!": "!",
  "$": "$",
  "&": "&",
  "'": "'",
  "(": "(",
  ")": ")",
  "*": "*",
  "+": "+",
  ",": ",",
  ";": ";",
  "=": "=",
  "/": "/",
  "?": "?",
  "#": "#",
  "@": "@",
  "%": "%"
};
var illegalIriChars = /[\x00-\x20<>\\"\{\}\|\^\`]/;
function isValidCodePoint(charCode) {
  return charCode <= 1114111 && (charCode < 55296 || charCode > 57343);
}
var lineModeRegExps = {
  _iri: true,
  _unescapedIri: true,
  _simpleQuotedString: true,
  _langcode: true,
  _dircode: true,
  _blank: true,
  _newline: true,
  _comment: true,
  _whitespace: true,
  _endOfFile: true
};
var invalidRegExp = /$0^/;
var N3Lexer = class {
  constructor(options) {
    this._iri = /^<((?:[^ <>{}\\]|\\[uU])+)>[ \t]*/;
    this._unescapedIri = /^<([^\x00-\x20<>\\"\{\}\|\^\`]*)>[ \t]*/;
    this._simpleQuotedString = /^"([^"\\\r\n]*)"(?=[^"])/;
    this._simpleApostropheString = /^'([^'\\\r\n]*)'(?=[^'])/;
    this._langcode = /^@([a-z]+(?:-[a-z0-9]+)*)(?=[^a-z0-9])/i;
    this._dircode = /^--(?:(ltr)|(rtl))/;
    this._prefix = /^((?:[A-Za-z\xc0-\xd6\xd8-\xf6\xf8-\u02ff\u0370-\u037d\u037f-\u1fff\u200c\u200d\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])(?:\.?[\-0-9A-Z_a-z\xb7\xc0-\xd6\xd8-\xf6\xf8-\u037d\u037f-\u1fff\u200c\u200d\u203f\u2040\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])*)?:(?=[#\s<])/;
    this._prefixed = /^((?:[A-Za-z\xc0-\xd6\xd8-\xf6\xf8-\u02ff\u0370-\u037d\u037f-\u1fff\u200c\u200d\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])(?:\.?[\-0-9A-Z_a-z\xb7\xc0-\xd6\xd8-\xf6\xf8-\u037d\u037f-\u1fff\u200c\u200d\u203f\u2040\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])*)?:((?:(?:[0-:A-Z_a-z\xc0-\xd6\xd8-\xf6\xf8-\u02ff\u0370-\u037d\u037f-\u1fff\u200c\u200d\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff]|%[0-9a-fA-F]{2}|\\[!#-\/;=?\-@_~])(?:(?:[\.\-0-:A-Z_a-z\xb7\xc0-\xd6\xd8-\xf6\xf8-\u037d\u037f-\u1fff\u200c\u200d\u203f\u2040\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff]|%[0-9a-fA-F]{2}|\\[!#-\/;=?\-@_~])*(?:[\-0-:A-Z_a-z\xb7\xc0-\xd6\xd8-\xf6\xf8-\u037d\u037f-\u1fff\u200c\u200d\u203f\u2040\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff]|%[0-9a-fA-F]{2}|\\[!#-\/;=?\-@_~]))?)?)(?:[ \t]+|(?=\.?[,;!\^\s#()\[\]\{\}"'<>]))/;
    this._variable = /^\?(?:(?:[A-Z_a-z\xc0-\xd6\xd8-\xf6\xf8-\u02ff\u0370-\u037d\u037f-\u1fff\u200c\u200d\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])(?:[\-0-:A-Z_a-z\xb7\xc0-\xd6\xd8-\xf6\xf8-\u037d\u037f-\u1fff\u200c\u200d\u203f\u2040\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])*)(?=[.,;!\^\s#()\[\]\{\}"'<>])/;
    this._blank = /^_:((?:[0-9A-Z_a-z\xc0-\xd6\xd8-\xf6\xf8-\u02ff\u0370-\u037d\u037f-\u1fff\u200c\u200d\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])(?:\.?[\-0-9A-Z_a-z\xb7\xc0-\xd6\xd8-\xf6\xf8-\u037d\u037f-\u1fff\u200c\u200d\u203f\u2040\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])*)(?:[ \t]+|(?=\.?[,;:!\^\s#()\[\]\{\}"'<>]))/;
    this._number = /^[\-+]?(?:(\d+\.\d*|\.?\d+)[eE][\-+]?|\d*(\.)?)\d+(?=\.?[,;:!\^\s#()\[\]\{\}"'<>])/;
    this._boolean = /^(?:true|false)(?=[.,;!\^\s#()\[\]\{\}"'<>])/;
    this._atKeyword = /^@[a-z]+(?=[\s#<:])/i;
    this._keyword = /^(?:PREFIX|BASE|VERSION|GRAPH)(?=[\s#<])/i;
    this._n3Id = /^id(?=[\s#<])/;
    this._shortPredicates = /^a(?=[\s#()\[\]\{\}"'<>])/;
    this._newline = /^[ \t]*(?:#[^\n\r]*)?(?:\r\n|\n|\r)[ \t]*/;
    this._comment = /#([^\n\r]*)/;
    this._whitespace = /^[ \t]+/;
    this._endOfFile = /^(?:#[^\n\r]*)?$/;
    options = options || {};
    this._isImpliedBy = options.isImpliedBy;
    if (this._lineMode = !!options.lineMode) {
      this._n3Mode = false;
      for (const key in this) {
        if (!(key in lineModeRegExps) && this[key] instanceof RegExp)
          this[key] = invalidRegExp;
      }
    } else {
      this._n3Mode = options.n3 !== false;
    }
    this.comments = !!options.comments;
    this._literalClosingPos = 0;
  }
  // ## Private methods
  // ### `_tokenizeToEnd` tokenizes as for as possible, emitting tokens through the callback
  _tokenizeToEnd(callback, inputFinished) {
    let input = this._input;
    let currentLineLength = input.length;
    while (true) {
      let whiteSpaceMatch, comment;
      while (whiteSpaceMatch = this._newline.exec(input)) {
        if (this.comments && (comment = this._comment.exec(whiteSpaceMatch[0])))
          emitToken("comment", comment[1], "", this._line, whiteSpaceMatch[0].length);
        input = input.substr(whiteSpaceMatch[0].length, input.length);
        currentLineLength = input.length;
        this._line++;
      }
      if (!whiteSpaceMatch && (whiteSpaceMatch = this._whitespace.exec(input)))
        input = input.substr(whiteSpaceMatch[0].length, input.length);
      if (this._endOfFile.test(input)) {
        if (inputFinished) {
          if (this.comments && (comment = this._comment.exec(input)))
            emitToken("comment", comment[1], "", this._line, input.length);
          input = null;
          emitToken("eof", "", "", this._line, 0);
        }
        return this._input = input;
      }
      const line = this._line, firstChar = input[0];
      let type = "", value = "", prefix = "", match = null, matchLength = 0, inconclusive = false;
      switch (firstChar) {
        case "^":
          if (input.length < 3)
            break;
          else if (input[1] === "^") {
            this._previousMarker = "^^";
            input = input.substr(2);
            if (input[0] !== "<") {
              inconclusive = true;
              break;
            }
          } else {
            if (this._n3Mode) {
              matchLength = 1;
              type = "^";
            }
            break;
          }
        case "<":
          if (match = this._unescapedIri.exec(input))
            type = "IRI", value = match[1];
          else if (match = this._iri.exec(input)) {
            value = this._unescape(match[1], stringEscapeReplacements);
            if (value === null || illegalIriChars.test(value))
              return reportSyntaxError(this);
            type = "IRI";
          } else if (input.length > 2 && input[1] === "<" && input[2] === "(")
            type = "<<(", matchLength = 3;
          else if (!this._lineMode && input.length > (inputFinished ? 1 : 2) && input[1] === "<")
            type = "<<", matchLength = 2;
          else if (this._n3Mode && input.length > 1 && input[1] === "=") {
            matchLength = 2;
            if (this._isImpliedBy) type = "abbreviation", value = "<";
            else type = "inverse", value = ">";
          }
          break;
        case ">":
          if (input.length > 1 && input[1] === ">")
            type = ">>", matchLength = 2;
          break;
        case "_":
          if ((match = this._blank.exec(input)) || inputFinished && (match = this._blank.exec(`${input} `)))
            type = "blank", prefix = "_", value = match[1];
          break;
        case '"':
          if (match = this._simpleQuotedString.exec(input))
            value = match[1];
          else {
            ({ value, matchLength } = this._parseLiteral(input));
            if (value === null)
              return reportSyntaxError(this);
          }
          if (match !== null || matchLength !== 0) {
            type = "literal";
            this._literalClosingPos = 0;
          }
          break;
        case "'":
          if (!this._lineMode) {
            if (match = this._simpleApostropheString.exec(input))
              value = match[1];
            else {
              ({ value, matchLength } = this._parseLiteral(input));
              if (value === null)
                return reportSyntaxError(this);
            }
            if (match !== null || matchLength !== 0) {
              type = "literal";
              this._literalClosingPos = 0;
            }
          }
          break;
        case "?":
          if (this._n3Mode && (match = this._variable.exec(input)))
            type = "var", value = match[0];
          break;
        case "@":
          if (this._previousMarker === "literal" && (match = this._langcode.exec(input)) && match[1] !== "version") {
            if (!inputFinished && input[match[0].length] === "-" && input[match[0].length + 1] !== "-")
              match = null;
            else
              type = "langcode", value = match[1];
          } else if (match = this._atKeyword.exec(input))
            type = match[0];
          break;
        case ".":
          if (input.length === 1 ? inputFinished : input[1] < "0" || input[1] > "9") {
            type = ".";
            matchLength = 1;
            break;
          }
        case "0":
        case "1":
        case "2":
        case "3":
        case "4":
        case "5":
        case "6":
        case "7":
        case "8":
        case "9":
        case "+":
        case "-":
          if (input[1] === "-") {
            if (this._previousMarker === "langcode" && (match = this._dircode.exec(input)))
              type = "dircode", matchLength = 2, value = match[1] || match[2], matchLength = value.length + 2;
            break;
          }
          if (match = this._number.exec(input) || inputFinished && (match = this._number.exec(`${input} `))) {
            type = "literal", value = match[0];
            prefix = typeof match[1] === "string" ? xsd.double : typeof match[2] === "string" ? xsd.decimal : xsd.integer;
          }
          break;
        case "B":
        case "b":
        case "p":
        case "P":
        case "G":
        case "g":
        case "V":
        case "v":
          if (match = this._keyword.exec(input))
            type = match[0].toUpperCase();
          else
            inconclusive = true;
          break;
        case "f":
        case "t":
          if (match = this._boolean.exec(input))
            type = "literal", value = match[0], prefix = xsd.boolean;
          else
            inconclusive = true;
          break;
        case "a":
          if (match = this._shortPredicates.exec(input))
            type = "abbreviation", value = "a";
          else
            inconclusive = true;
          break;
        case "i":
          if (this._n3Mode && (match = this._n3Id.exec(input)))
            type = "id";
          else
            inconclusive = true;
          break;
        case "=":
          if (this._n3Mode && input.length > 1) {
            type = "abbreviation";
            if (input[1] !== ">")
              matchLength = 1, value = "=";
            else
              matchLength = 2, value = ">";
          }
          break;
        case "!":
          if (!this._n3Mode)
            break;
        case ")":
          if (!inputFinished && (input.length === 1 || input.length === 2 && input[1] === ">")) {
            break;
          }
          if (input.length > 2 && input[1] === ">" && input[2] === ">") {
            type = ")>>", matchLength = 3;
            break;
          }
        case ",":
        case ";":
        case "[":
        case "]":
        case "(":
        case "}":
        case "~":
          if (!this._lineMode) {
            matchLength = 1;
            type = firstChar;
          }
          break;
        case "{":
          if (!this._lineMode && input.length >= 2) {
            if (input[1] === "|")
              type = "{|", matchLength = 2;
            else
              type = firstChar, matchLength = 1;
          }
          break;
        case "|":
          if (input.length >= 2 && input[1] === "}")
            type = "|}", matchLength = 2;
          break;
        default:
          inconclusive = true;
      }
      if (inconclusive) {
        if ((this._previousMarker === "@prefix" || this._previousMarker === "PREFIX") && (match = this._prefix.exec(input)))
          type = "prefix", value = match[1] || "";
        else if ((match = this._prefixed.exec(input)) || inputFinished && (match = this._prefixed.exec(`${input} `)))
          type = "prefixed", prefix = match[1] || "", value = this._unescape(match[2], localNameEscapeReplacements);
      }
      if (this._previousMarker === "^^") {
        switch (type) {
          case "prefixed":
            type = "type";
            break;
          case "IRI":
            type = "typeIRI";
            break;
          default:
            type = "";
        }
      }
      if (!type) {
        if (inputFinished || !/^'''|^"""/.test(input) && /\n|\r/.test(input))
          return reportSyntaxError(this);
        else
          return this._input = input;
      }
      const length = matchLength || match[0].length;
      const token = emitToken(type, value, prefix, line, length);
      this.previousToken = token;
      this._previousMarker = type;
      input = input.substr(length, input.length);
    }
    function emitToken(type, value, prefix, line, length) {
      const start = input ? currentLineLength - input.length : currentLineLength;
      const end = start + length;
      const token = { type, value, prefix, line, start, end };
      callback(null, token);
      return token;
    }
    function reportSyntaxError(self) {
      callback(self._syntaxError(/^\S*/.exec(input)[0]));
    }
  }
  // ### `_unescape` replaces N3 escape codes by their corresponding characters,
  // allowing only the fixed escape sequences from the given replacement table
  _unescape(item, replacements) {
    let invalid = false;
    const replaced = item.replace(escapeSequence, (sequence, unicode4, unicode8, escapedChar) => {
      if (typeof unicode4 === "string") {
        const charCode = Number.parseInt(unicode4, 16);
        if (!isValidCodePoint(charCode)) {
          invalid = true;
          return "";
        }
        return String.fromCharCode(charCode);
      }
      if (typeof unicode8 === "string") {
        let charCode = Number.parseInt(unicode8, 16);
        if (!isValidCodePoint(charCode)) {
          invalid = true;
          return "";
        }
        return charCode <= 65535 ? String.fromCharCode(Number.parseInt(unicode8, 16)) : String.fromCharCode(55296 + ((charCode -= 65536) >> 10), 56320 + (charCode & 1023));
      }
      if (escapedChar in replacements)
        return replacements[escapedChar];
      invalid = true;
      return "";
    });
    return invalid ? null : replaced;
  }
  // ### `_parseLiteral` parses a literal into an unescaped value
  _parseLiteral(input) {
    if (input.length >= 3) {
      const opening = input.match(/^(?:"""|"|'''|'|)/)[0];
      const openingLength = opening.length;
      let closingPos = Math.max(this._literalClosingPos, openingLength);
      while ((closingPos = input.indexOf(opening, closingPos)) > 0) {
        let backslashCount = 0;
        while (input[closingPos - backslashCount - 1] === "\\")
          backslashCount++;
        if (backslashCount % 2 === 0) {
          const raw = input.substring(openingLength, closingPos);
          const lines = raw.split(/\r\n|\r|\n/).length - 1;
          const matchLength = closingPos + openingLength;
          if (openingLength === 1 && lines !== 0 || openingLength === 3 && this._lineMode)
            break;
          this._line += lines;
          return { value: this._unescape(raw, stringEscapeReplacements), matchLength };
        }
        closingPos++;
      }
      this._literalClosingPos = input.length - openingLength + 1;
    }
    return { value: "", matchLength: 0 };
  }
  // ### `_syntaxError` creates a syntax error for the given issue
  _syntaxError(issue) {
    this._input = null;
    const err = new Error(`Unexpected "${issue}" on line ${this._line}.`);
    err.context = {
      token: void 0,
      line: this._line,
      previousToken: this.previousToken
    };
    return err;
  }
  // ### Strips off any starting UTF BOM mark.
  _readStartingBom(input) {
    return input.startsWith("\uFEFF") ? input.substr(1) : input;
  }
  // ## Public methods
  // ### `tokenize` starts the transformation of an N3 document into an array of tokens.
  // The input can be a string or a stream.
  tokenize(input, callback) {
    this._line = 1;
    if (typeof input === "string") {
      this._input = this._readStartingBom(input);
      if (typeof callback === "function")
        queueMicrotask(() => this._tokenizeToEnd(callback, true));
      else {
        const tokens = [];
        let error;
        this._tokenizeToEnd((e, t) => e ? error = e : tokens.push(t), true);
        if (error) throw error;
        return tokens;
      }
    } else {
      this._pendingBuffer = null;
      if (typeof input.setEncoding === "function")
        input.setEncoding("utf8");
      input.on("data", (data) => {
        if (this._input !== null && data.length !== 0) {
          if (this._pendingBuffer) {
            data = Buffer.concat([this._pendingBuffer, data]);
            this._pendingBuffer = null;
          }
          if (data[data.length - 1] & 128) {
            this._pendingBuffer = data;
          } else {
            if (typeof this._input === "undefined")
              this._input = this._readStartingBom(typeof data === "string" ? data : data.toString());
            else
              this._input += data;
            this._tokenizeToEnd(callback, false);
          }
        }
      });
      input.on("end", () => {
        if (typeof this._input === "string")
          this._tokenizeToEnd(callback, true);
      });
      input.on("error", callback);
    }
  }
};

// node_modules/n3/src/N3DataFactory.js
var { rdf, xsd: xsd2 } = IRIs_default;
var DEFAULTGRAPH;
var _blankNodeCounter = 0;
var DataFactory = {
  namedNode,
  blankNode,
  variable,
  literal,
  defaultGraph,
  quad,
  triple: quad,
  fromTerm,
  fromQuad
};
var N3DataFactory_default = DataFactory;
var Term = class _Term {
  constructor(id) {
    this.id = id;
  }
  // ### The value of this term
  get value() {
    return this.id;
  }
  // ### Returns whether this object represents the same term as the other
  equals(other) {
    if (other instanceof _Term)
      return this.id === other.id;
    return !!other && this.termType === other.termType && this.value === other.value;
  }
  // ### Implement hashCode for Immutable.js, since we implement `equals`
  // https://immutable-js.com/docs/v4.0.0/ValueObject/#hashCode()
  hashCode() {
    return 0;
  }
  // ### Returns a plain object representation of this term
  toJSON() {
    return {
      termType: this.termType,
      value: this.value
    };
  }
};
var NamedNode = class extends Term {
  // ### Creates a named node
  /**
   * @deprecated Create named nodes through a data factory instead
   * (`DataFactory.namedNode(iri)`), so that term validation can be applied;
   * the constructor assumes an already-validated IRI.
   */
  constructor(iri) {
    super(iri);
  }
  // ### The term type of this term
  get termType() {
    return "NamedNode";
  }
};
var Literal = class _Literal extends Term {
  // ### Creates a literal
  /**
   * @deprecated Create literals through a data factory instead
   * (`DataFactory.literal(value, languageOrDatatype)`), so that term
   * validation can be applied; the constructor takes the internal
   * id representation and assumes it is already valid.
   */
  constructor(id) {
    super(id);
  }
  // ### The term type of this term
  get termType() {
    return "Literal";
  }
  // ### The text value of this literal
  get value() {
    return this.id.substring(1, this.id.lastIndexOf('"'));
  }
  // ### The language of this literal
  get language() {
    const id = this.id;
    let atPos = id.lastIndexOf('"') + 1;
    const dirPos = id.lastIndexOf("--");
    return atPos < id.length && id[atPos++] === "@" ? (dirPos > atPos ? id.substr(0, dirPos) : id).substr(atPos).toLowerCase() : "";
  }
  // ### The direction of this literal
  get direction() {
    const id = this.id;
    const endPos = id.lastIndexOf('"');
    const dirPos = id.lastIndexOf("--");
    return dirPos > endPos && dirPos + 2 < id.length ? id.substr(dirPos + 2).toLowerCase() : "";
  }
  // ### The datatype IRI of this literal
  get datatype() {
    return new NamedNode(this.datatypeString);
  }
  // ### The datatype string of this literal
  get datatypeString() {
    const id = this.id, dtPos = id.lastIndexOf('"') + 1;
    const char = dtPos < id.length ? id[dtPos] : "";
    return char === "^" ? id.substr(dtPos + 2) : (
      // If "@" follows, return rdf:langString or rdf:dirLangString; xsd:string otherwise
      char !== "@" ? xsd2.string : id.indexOf("--", dtPos) > 0 ? rdf.dirLangString : rdf.langString
    );
  }
  // ### Returns whether this object represents the same term as the other
  equals(other) {
    if (other instanceof _Literal)
      return this.id === other.id;
    return !!other && !!other.datatype && this.termType === other.termType && this.value === other.value && this.language === other.language && (this.direction === other.direction || this.direction === "" && !other.direction) && this.datatype.value === other.datatype.value;
  }
  toJSON() {
    return {
      termType: this.termType,
      value: this.value,
      language: this.language,
      direction: this.direction,
      datatype: { termType: "NamedNode", value: this.datatypeString }
    };
  }
};
var BlankNode = class extends Term {
  // ### Creates a blank node
  /**
   * @deprecated Create blank nodes through a data factory instead
   * (`DataFactory.blankNode(name)`), so that term validation can be applied;
   * the constructor assumes an already-validated name.
   */
  constructor(name) {
    super(`_:${name}`);
  }
  // ### The term type of this term
  get termType() {
    return "BlankNode";
  }
  // ### The name of this blank node
  get value() {
    return this.id.substr(2);
  }
};
var Variable = class extends Term {
  // ### Creates a variable
  /**
   * @deprecated Create variables through a data factory instead
   * (`DataFactory.variable(name)`), so that term validation can be applied;
   * the constructor assumes an already-validated name.
   */
  constructor(name) {
    super(`?${name}`);
  }
  // ### The term type of this term
  get termType() {
    return "Variable";
  }
  // ### The name of this variable
  get value() {
    return this.id.substr(1);
  }
};
var DefaultGraph = class extends Term {
  // ### Creates the default graph
  /**
   * @deprecated Obtain the default graph through a data factory instead
   * (`DataFactory.defaultGraph()`).
   */
  constructor() {
    super("");
    return DEFAULTGRAPH || this;
  }
  // ### The term type of this term
  get termType() {
    return "DefaultGraph";
  }
  // ### Returns whether this object represents the same term as the other
  equals(other) {
    return this === other || !!other && this.termType === other.termType;
  }
};
DEFAULTGRAPH = new DefaultGraph();
var Quad = class extends Term {
  // ### Creates a quad
  /**
   * @deprecated Create quads through a data factory instead
   * (`DataFactory.quad(subject, predicate, object, graph)`), so that term
   * validation can be applied; the constructor assumes already-validated terms.
   */
  constructor(subject, predicate, object, graph) {
    super("");
    this._subject = subject;
    this._predicate = predicate;
    this._object = object;
    this._graph = graph || DEFAULTGRAPH;
  }
  // ### The term type of this term
  get termType() {
    return "Quad";
  }
  get subject() {
    return this._subject;
  }
  get predicate() {
    return this._predicate;
  }
  get object() {
    return this._object;
  }
  get graph() {
    return this._graph;
  }
  // ### Returns a plain object representation of this quad
  toJSON() {
    return {
      termType: this.termType,
      subject: this._subject.toJSON(),
      predicate: this._predicate.toJSON(),
      object: this._object.toJSON(),
      graph: this._graph.toJSON()
    };
  }
  // ### Returns whether this object represents the same quad as the other
  equals(other) {
    return !!other && this._subject.equals(other.subject) && this._predicate.equals(other.predicate) && this._object.equals(other.object) && this._graph.equals(other.graph);
  }
};
function namedNode(iri) {
  return new NamedNode(iri);
}
function blankNode(name) {
  return new BlankNode(name || `n3-${_blankNodeCounter++}`);
}
function literal(value, languageOrDataType) {
  if (typeof languageOrDataType === "string")
    return new Literal(`"${value}"@${languageOrDataType.toLowerCase()}`);
  if (languageOrDataType !== void 0 && !("termType" in languageOrDataType)) {
    return new Literal(`"${value}"@${languageOrDataType.language.toLowerCase()}${languageOrDataType.direction ? `--${languageOrDataType.direction.toLowerCase()}` : ""}`);
  }
  let datatype = languageOrDataType ? languageOrDataType.value : "";
  if (datatype === "") {
    if (typeof value === "boolean")
      datatype = xsd2.boolean;
    else if (typeof value === "number") {
      if (Number.isFinite(value))
        datatype = Number.isInteger(value) ? xsd2.integer : xsd2.double;
      else {
        datatype = xsd2.double;
        if (!Number.isNaN(value))
          value = value > 0 ? "INF" : "-INF";
      }
    } else if (value instanceof Date && !Number.isNaN(value.getTime())) {
      datatype = xsd2.dateTime;
      value = value.toISOString();
    }
  }
  return datatype === "" || datatype === xsd2.string ? new Literal(`"${value}"`) : new Literal(`"${value}"^^${datatype}`);
}
function variable(name) {
  return new Variable(name);
}
function defaultGraph() {
  return DEFAULTGRAPH;
}
function quad(subject, predicate, object, graph) {
  return new Quad(subject, predicate, object, graph);
}
function fromTerm(term) {
  if (term instanceof Term)
    return term;
  switch (term.termType) {
    case "NamedNode":
      return namedNode(term.value);
    case "BlankNode":
      return blankNode(term.value);
    case "Variable":
      return variable(term.value);
    case "DefaultGraph":
      return DEFAULTGRAPH;
    case "Literal":
      return literal(term.value, term.language || term.datatype);
    case "Quad":
      return fromQuad(term);
    default:
      throw new Error(`Unexpected termType: ${term.termType}`);
  }
}
function fromQuad(inQuad) {
  if (inQuad instanceof Quad)
    return inQuad;
  if (inQuad.termType !== "Quad")
    throw new Error(`Unexpected termType: ${inQuad.termType}`);
  return quad(fromTerm(inQuad.subject), fromTerm(inQuad.predicate), fromTerm(inQuad.object), fromTerm(inQuad.graph));
}

// node_modules/n3/src/N3Parser.js
var blankNodePrefix = 0;
var N3Parser = class _N3Parser {
  constructor(options) {
    this._contextStack = [];
    this._graph = null;
    options = options || {};
    this._setBase(options.baseIRI);
    options.factory && initDataFactory(this, options.factory);
    const format = typeof options.format === "string" ? options.format.match(/\w*$/)[0].toLowerCase() : "", isTurtle = /turtle/.test(format), isTriG = /trig/.test(format), isNTriples = /triple/.test(format), isNQuads = /quad/.test(format), isN3 = this._n3Mode = /n3/.test(format), isLineMode = isNTriples || isNQuads;
    if (!(this._supportsNamedGraphs = !(isTurtle || isN3)))
      this._readPredicateOrNamedGraph = this._readPredicate;
    this._supportsQuads = !(isTurtle || isTriG || isNTriples || isN3);
    this._isImpliedBy = options.isImpliedBy;
    this._implicitEmptyPrefix = !!options.implicitEmptyPrefix;
    this._emptyFormulaAsTrue = !!options.emptyFormulaAsTrue;
    if (isLineMode)
      this._resolveRelativeIRI = (iri) => {
        return null;
      };
    this._blankNodePrefix = typeof options.blankNodePrefix !== "string" ? "" : options.blankNodePrefix.replace(/^(?!_:)/, "_:");
    this._lexer = options.lexer || new N3Lexer({ lineMode: isLineMode, n3: isN3, isImpliedBy: this._isImpliedBy });
    this._explicitQuantifiers = !!options.explicitQuantifiers;
    this._parseUnsupportedVersions = !!options.parseUnsupportedVersions;
    this._version = options.version;
  }
  // ## Static class methods
  // ### `_resetBlankNodePrefix` restarts blank node prefix identification
  static _resetBlankNodePrefix() {
    blankNodePrefix = 0;
  }
  // ## Private methods
  // ### `_setBase` sets the base IRI to resolve relative IRIs
  _setBase(baseIRI) {
    if (!baseIRI) {
      this._base = "";
      this._basePath = "";
    } else {
      const fragmentPos = baseIRI.indexOf("#");
      if (fragmentPos >= 0)
        baseIRI = baseIRI.substr(0, fragmentPos);
      this._base = baseIRI;
      this._basePath = baseIRI.indexOf("/") < 0 ? baseIRI : baseIRI.replace(/[^\/?]*(?:\?.*)?$/, "");
      baseIRI = baseIRI.match(/^(?:([a-z][a-z0-9+.-]*:))?(?:\/\/[^\/]*)?/i);
      this._baseRoot = baseIRI[0];
      this._baseScheme = baseIRI[1];
    }
  }
  // ### `_saveContext` stores the current parsing context
  // when entering a new scope (list, blank node, formula)
  _saveContext(type, graph, subject, predicate, object) {
    if (!this._n3Mode) {
      this._contextStack.push({ type, subject, predicate, object, graph });
      return;
    }
    const context = {
      type,
      subject,
      predicate,
      object,
      graph,
      inverse: this._inversePredicate,
      blankPrefix: this._prefixes._,
      quantified: this._quantified,
      emptyFormula: this._emptyFormula
    };
    if (type === "formula") {
      context.prefixes = this._prefixes;
      context.base = [this._base, this._basePath, this._baseRoot, this._baseScheme];
      this._prefixes = Object.create(this._prefixes);
    }
    this._contextStack.push(context);
    this._inversePredicate = false;
    this._prefixes._ = this._graph ? `${this._graph.value}.` : ".";
    this._quantified = Object.create(this._quantified);
    if (type === "formula") {
      this._subject = null;
      this._emptyFormula = true;
    }
  }
  // ### `_restoreContext` restores the parent context
  // when leaving a scope (list, blank node, formula)
  _restoreContext(type, token) {
    const context = this._contextStack.pop();
    if (!context || context.type !== type)
      return this._error(`Unexpected ${token.type}`, token);
    this._subject = context.subject;
    this._predicate = context.predicate;
    this._object = context.object;
    this._graph = context.graph;
    if (this._n3Mode) {
      this._inversePredicate = context.inverse;
      if (type === "formula") {
        this._prefixes = context.prefixes;
        [this._base, this._basePath, this._baseRoot, this._baseScheme] = context.base;
      } else
        this._prefixes._ = context.blankPrefix;
      this._quantified = context.quantified;
      this._emptyFormula = context.emptyFormula;
    }
  }
  // ### `_readBeforeTopContext` is called once only at the start of parsing.
  _readBeforeTopContext(token) {
    if (this._version && !this._isValidVersion(this._version))
      return this._error(`Detected unsupported version as media type parameter: "${this._version}"`, token);
    return this._readInTopContext(token);
  }
  // ### `_readInTopContext` reads a token when in the top context
  _readInTopContext(token) {
    switch (token.type) {
      case "eof":
        if (this._graph !== null)
          return this._error("Unclosed graph", token);
        delete this._prefixes._;
        return this._callback(null, null, this._prefixes);
      case "PREFIX":
        this._sparqlStyle = true;
      case "@prefix":
        return this._readPrefix;
      case "BASE":
        this._sparqlStyle = true;
      case "@base":
        return this._readBaseIRI;
      case "VERSION":
        this._sparqlStyle = true;
      case "@version":
        return this._readVersion;
      case "{":
        if (this._supportsNamedGraphs) {
          this._graph = "";
          this._subject = null;
          return this._readSubject;
        }
      case "GRAPH":
        if (this._supportsNamedGraphs)
          return this._readNamedGraphLabel;
      default:
        return this._readSubject(token);
    }
  }
  // ### `_readInFormulaContext` reads a token at the statement level of a formula
  _readInFormulaContext(token) {
    switch (token.type) {
      case "PREFIX":
        this._sparqlStyle = true;
      case "@prefix":
        return this._readPrefix;
      case "BASE":
        this._sparqlStyle = true;
      case "@base":
        return this._readBaseIRI;
      default:
        return this._readSubject(token);
    }
  }
  // ### `_getStatementReader` returns the reader for the current statement scope
  _getStatementReader() {
    const context = this._contextStack[this._contextStack.length - 1];
    return context && context.type === "formula" ? this._readInFormulaContext : this._readInTopContext;
  }
  // ### `_readEntity` reads an IRI, prefixed name, blank node, or variable
  _readEntity(token, quantifier) {
    let value;
    switch (token.type) {
      case "IRI":
      case "typeIRI":
        const iri = this._resolveIRI(token.value);
        if (iri === null)
          return this._error("Invalid IRI", token);
        value = this._factory.namedNode(iri);
        break;
      case "type":
      case "prefixed":
        const prefix = this._prefixes[token.prefix];
        if (prefix === void 0)
          return this._error(`Undefined prefix "${token.prefix}:"`, token);
        value = this._factory.namedNode(prefix + token.value);
        break;
      case "blank":
        value = this._factory.blankNode(this._prefixes[token.prefix] + token.value);
        break;
      case "var":
        value = this._factory.variable(token.value.substr(1));
        break;
      default:
        return this._error(`Expected entity but got ${token.type}`, token);
    }
    if (!quantifier && this._n3Mode && value.id in this._quantified)
      value = this._quantified[value.id];
    return value;
  }
  // ### `_readList` starts reading a list in the subject, predicate, or object position
  _readList(token, subject, predicate, object) {
    const stack = this._contextStack, parent = stack.length && stack[stack.length - 1];
    if (parent.type === "<<") {
      return this._error("Unexpected list in reified triple", token);
    }
    this._saveContext("list", this._graph, subject, predicate, object);
    this._subject = null;
    return this._readListItem;
  }
  // ### `_readSubject` reads a quad's subject
  _readSubject(token) {
    this._predicate = null;
    if (token.type !== "}")
      this._emptyFormula = false;
    switch (token.type) {
      case "[":
        this._saveContext(
          "blank",
          this._graph,
          this._subject = this._factory.blankNode(),
          null,
          null
        );
        return this._readBlankNodeHead;
      case "(":
        return this._readList(token, this.RDF_NIL, null, null);
      case "{":
        if (!this._n3Mode)
          return this._error("Unexpected graph", token);
        this._saveContext(
          "formula",
          this._graph,
          this._graph = this._factory.blankNode(),
          null,
          null
        );
        return this._readInFormulaContext;
      case "}":
        return this._readPunctuation(token);
      case "@forSome":
        if (!this._n3Mode)
          return this._error('Unexpected "@forSome"', token);
        this._subject = null;
        this._predicate = this.N3_FORSOME;
        this._quantifier = "blankNode";
        return this._readQuantifierList;
      case "@forAll":
        if (!this._n3Mode)
          return this._error('Unexpected "@forAll"', token);
        this._subject = null;
        this._predicate = this.N3_FORALL;
        this._quantifier = "variable";
        return this._readQuantifierList;
      case "literal":
        if (!this._n3Mode)
          return this._error("Unexpected literal", token);
        if (token.prefix.length === 0) {
          this._literalValue = token.value;
          return this._completeSubjectLiteral;
        } else {
          this._subject = this._factory.literal(token.value, this._factory.namedNode(token.prefix));
          return this._getPathReader(this._readPredicateOrNamedGraph);
        }
      case "<<(":
        if (!this._n3Mode)
          return this._error("Disallowed triple term as subject", token);
        this._saveContext("<<(", this._graph, null, null, null);
        this._graph = null;
        return this._readSubject;
      case "<<":
        this._saveContext("<<", this._graph, null, null, null);
        this._graph = null;
        return this._readSubject;
      default:
        if ((this._subject = this._readEntity(token)) === void 0)
          return;
        if (this._n3Mode)
          return this._getPathReader(this._readPredicateOrNamedGraph);
    }
    return this._readPredicateOrNamedGraph;
  }
  // ### `_readPredicate` reads a quad's predicate
  _readPredicate(token) {
    const type = token.type;
    let pathable = false;
    switch (type) {
      case "inverse":
        this._inversePredicate = true;
      case "abbreviation":
        this._predicate = this.ABBREVIATIONS[token.value];
        break;
      case ".":
      case "]":
      case "}":
      case "|}":
        if (this._predicate === null && !this._n3Mode)
          return this._error(`Unexpected ${type}`, token);
        this._subject = null;
        return type === "]" ? this._readBlankNodeTail(token) : this._readPunctuation(token);
      case ";":
        return this._predicate !== null ? this._readPredicate : this._error("Expected predicate but got ;", token);
      case "literal":
        if (!this._n3Mode)
          return this._error("Unexpected literal", token);
        if (token.prefix.length === 0) {
          this._literalValue = token.value;
          return this._completePredicateLiteral;
        } else
          this._predicate = this._factory.literal(token.value, this._factory.namedNode(token.prefix));
        pathable = true;
        break;
      case "(":
        return this._n3Mode ? this._readList(token, this._subject, this.RDF_NIL, null) : this._error(`Expected entity but got ${type}`, token);
      case "[":
        if (this._n3Mode) {
          this._saveContext(
            "blank",
            this._graph,
            this._subject,
            this._subject = this._factory.blankNode(),
            null
          );
          return this._readBlankNodeHead;
        }
        return this._error("Disallowed blank node as predicate", token);
      case "{":
        if (this._n3Mode) {
          this._saveContext(
            "formula",
            this._graph,
            this._subject,
            this._graph = this._factory.blankNode(),
            null
          );
          return this._readSubject;
        }
        return this._readEntity(token);
      case "blank":
        if (!this._n3Mode)
          return this._error("Disallowed blank node as predicate", token);
      default:
        if ((this._predicate = this._readEntity(token)) === void 0)
          return;
        pathable = this._n3Mode;
    }
    this._validAnnotation = true;
    return pathable ? this._getPathReader(this._readObject, "predicate") : this._readObject;
  }
  // ### `_readObject` reads a quad's object
  _readObject(token) {
    switch (token.type) {
      case "literal":
        if (token.prefix.length === 0) {
          this._literalValue = token.value;
          return this._readDataTypeOrLang;
        } else {
          this._object = this._factory.literal(token.value, this._factory.namedNode(token.prefix));
          if (this._n3Mode)
            return this._getPathReader(this._getContextEndReader());
        }
        break;
      case "[":
        this._saveContext(
          "blank",
          this._graph,
          this._subject,
          this._predicate,
          this._subject = this._factory.blankNode()
        );
        return this._readBlankNodeHead;
      case "(":
        return this._readList(token, this._subject, this._predicate, this.RDF_NIL);
      case "{":
        if (!this._n3Mode)
          return this._error("Unexpected graph", token);
        this._saveContext(
          "formula",
          this._graph,
          this._subject,
          this._predicate,
          this._graph = this._factory.blankNode()
        );
        return this._readInFormulaContext;
      case "<<(":
        this._saveContext("<<(", this._graph, this._subject, this._predicate, null);
        this._graph = null;
        return this._readSubject;
      case "<<":
        this._saveContext("<<", this._graph, this._subject, this._predicate, null);
        this._graph = null;
        return this._readSubject;
      default:
        if ((this._object = this._readEntity(token)) === void 0)
          return;
        if (this._n3Mode)
          return this._getPathReader(this._getContextEndReader());
    }
    return this._getContextEndReader();
  }
  // ### `_readPredicateOrNamedGraph` reads a quad's predicate, or a named graph
  _readPredicateOrNamedGraph(token) {
    return token.type === "{" ? this._readGraph(token) : this._readPredicate(token);
  }
  // ### `_readGraph` reads a graph
  _readGraph(token) {
    if (token.type !== "{")
      return this._error(`Expected graph but got ${token.type}`, token);
    this._graph = this._subject, this._subject = null;
    return this._readSubject;
  }
  // ### `_readBlankNodeHead` reads the head of a blank node
  _readBlankNodeHead(token) {
    if (token.type === "]") {
      this._subject = null;
      return this._readBlankNodeTail(token);
    } else {
      const stack = this._contextStack, parentParent = stack.length > 1 && stack[stack.length - 2];
      if (parentParent.type === "<<") {
        return this._error("Unexpected compound blank node expression in reified triple", token);
      }
      if (token.type === "id")
        return this._readIriPropertyListId;
      this._predicate = null;
      return this._readPredicate(token);
    }
  }
  // ### `_readIriPropertyListId` replaces a property list's blank node with its IRI
  _readIriPropertyListId(token) {
    const iri = this._readEntity(token);
    if (iri === void 0)
      return;
    if (iri.termType !== "NamedNode")
      return this._error(`Expected IRI after id but got ${token.type}`, token);
    const placeholder = this._subject;
    this._subject = iri;
    const context = this._contextStack[this._contextStack.length - 1];
    if (context.subject === placeholder)
      context.subject = iri;
    if (context.predicate === placeholder)
      context.predicate = iri;
    if (context.object === placeholder)
      context.object = iri;
    this._predicate = null;
    return this._readIriPropertyListPredicate;
  }
  // ### `_readIriPropertyListPredicate` requires properties after an IRI property list ID
  _readIriPropertyListPredicate(token) {
    if (token.type === ";" || token.type === "]" || token.type === "." || token.type === "}")
      return this._error(`Expected predicate but got ${token.type}`, token);
    return this._readPredicate(token);
  }
  // ### `_readBlankNodeTail` reads the end of a blank node
  _readBlankNodeTail(token) {
    if (token.type !== "]")
      return this._readBlankNodePunctuation(token);
    if (this._subject !== null)
      this._emit(this._subject, this._predicate, this._object, this._graph);
    const empty = this._predicate === null;
    this._restoreContext("blank", token);
    if (this._object !== null)
      return this._getContextEndReader();
    else if (this._predicate !== null)
      return this._getPathReader(this._readObject, "predicate");
    else
      return empty ? this._readPredicateOrNamedGraph : this._readPredicateAfterBlank;
  }
  // ### `_readPredicateAfterBlank` reads a predicate after an anonymous blank node
  _readPredicateAfterBlank(token) {
    switch (token.type) {
      case ".":
      case "}":
        this._subject = null;
        return this._readPunctuation(token);
      default:
        return this._readPredicate(token);
    }
  }
  // ### `_readListItem` reads items from a list
  _readListItem(token) {
    let item = null, list = null, next = this._readListItem;
    const previousList = this._subject, stack = this._contextStack, parent = stack[stack.length - 1];
    switch (token.type) {
      case "[":
        this._saveContext(
          "blank",
          this._graph,
          list = this._factory.blankNode(),
          this.RDF_FIRST,
          this._subject = item = this._factory.blankNode()
        );
        next = this._readBlankNodeHead;
        break;
      case "(":
        this._saveContext(
          "list",
          this._graph,
          list = this._factory.blankNode(),
          this.RDF_FIRST,
          this.RDF_NIL
        );
        this._subject = null;
        break;
      case ")":
        this._restoreContext("list", token);
        if (stack.length !== 0 && stack[stack.length - 1].type === "list") {
          if (this._n3Mode) {
            if (previousList !== null)
              this._emit(previousList, this.RDF_REST, this.RDF_NIL, this._graph);
            this._saveContext("item", this._graph, this._subject, this._predicate, this._object);
            this._subject = this._object, this._predicate = null;
            return this._getPathReader(this._readListItem);
          }
          this._emit(this._subject, this._predicate, this._object, this._graph);
        }
        if (this._predicate === null) {
          next = this._n3Mode ? this._getPathReader(this._readPredicate) : this._readPredicate;
          if (this._subject === this.RDF_NIL)
            return next;
        } else if (this._object === null) {
          next = this._getPathReader(this._readObject, "predicate");
          if (this._predicate === this.RDF_NIL)
            return next;
        } else {
          next = this._getContextEndReader();
          if (this._n3Mode)
            next = this._getPathReader(next);
          if (this._object === this.RDF_NIL)
            return next;
        }
        list = this.RDF_NIL;
        break;
      case "literal":
        if (token.prefix.length === 0) {
          this._literalValue = token.value;
          next = this._readListItemDataTypeOrLang;
        } else {
          item = this._factory.literal(token.value, this._factory.namedNode(token.prefix));
          next = this._getContextEndReader();
        }
        break;
      case "{":
        if (!this._n3Mode)
          return this._error("Unexpected graph", token);
        list = this._factory.blankNode();
        item = this._factory.blankNode();
        if (previousList === null) {
          if (parent.predicate === null)
            parent.subject = list;
          else
            parent.object = list;
        } else {
          this._emit(previousList, this.RDF_REST, list, this._graph);
        }
        this._emit(list, this.RDF_FIRST, item, this._graph);
        this._saveContext(
          "formula",
          this._graph,
          list,
          this.RDF_FIRST,
          this._graph = item
        );
        this._subject = null;
        return this._readInFormulaContext;
      case "<<(":
        this._saveContext("<<(", this._graph, null, null, null);
        this._graph = null;
        next = this._readSubject;
        break;
      case "<<":
        this._saveContext("<<", this._graph, null, null, null);
        this._graph = null;
        next = this._readSubject;
        break;
      default:
        if ((item = this._readEntity(token)) === void 0)
          return;
    }
    if (list === null)
      this._subject = list = this._factory.blankNode();
    if (token.type === "<<" || token.type === "<<(")
      stack[stack.length - 1].subject = this._subject;
    if (previousList === null) {
      if (parent.predicate === null)
        parent.subject = list;
      else if (parent.object === null)
        parent.predicate = list;
      else
        parent.object = list;
    } else {
      this._emit(previousList, this.RDF_REST, list, this._graph);
    }
    if (item !== null) {
      if (this._n3Mode && (token.type === "IRI" || token.type === "prefixed" || token.type === "var" || token.type === "blank" || token.type === "literal")) {
        this._saveContext("item", this._graph, list, this.RDF_FIRST, item);
        this._subject = item, this._predicate = null;
        return this._getPathReader(this._readListItem);
      }
      this._emit(list, this.RDF_FIRST, item, this._graph);
    }
    return next;
  }
  // ### `_readDataTypeOrLang` reads an _optional_ datatype or language
  _readDataTypeOrLang(token) {
    return this._completeObjectLiteral(token, false);
  }
  // ### `_readListItemDataTypeOrLang` reads an _optional_ datatype or language in a list
  _readListItemDataTypeOrLang(token) {
    return this._completeObjectLiteral(token, true);
  }
  // ### `_completeLiteral` completes a literal with an optional datatype or language
  // Defers possible direction tags without allocating bound callbacks.
  _completeLiteral(token, component) {
    let literal2, readCb = false;
    switch (token.type) {
      case "type":
      case "typeIRI":
        const datatype = this._readEntity(token);
        if (datatype === void 0) return;
        if (datatype.value === IRIs_default.rdf.langString || datatype.value === IRIs_default.rdf.dirLangString) {
          return this._error("Detected illegal (directional) languaged-tagged string with explicit datatype", token);
        }
        literal2 = this._factory.literal(this._literalValue, datatype);
        token = null;
        break;
      case "langcode":
        if (token.value.split("-").some((t) => t.length > 8))
          return this._error("Detected language tag with subtag longer than 8 characters", token);
        literal2 = this._factory.literal(this._literalValue, token.value);
        this._literalLanguage = token.value;
        token = null;
        this._literalComponent = component;
        readCb = true;
        break;
      default:
        literal2 = this._factory.literal(this._literalValue);
    }
    return { token, literal: literal2, readCb };
  }
  // ### `_readDirCode` reads an optional directional language tag
  _readDirCode(token) {
    const component = this._literalComponent, listItem = this._literalListItem;
    if (token.type === "dircode") {
      const term = this._factory.literal(this._literalValue, { language: this._literalLanguage, direction: token.value });
      if (component === "subject")
        this._subject = term;
      else if (component === "predicate")
        this._predicate = term;
      else
        this._object = term;
      this._literalLanguage = void 0;
      token = null;
    }
    if (component === "subject" || component === "predicate") {
      const next = component === "subject" ? this._readPredicateOrNamedGraph : this._readObject;
      const reader = this._getPathEndReader(token, next, component);
      return reader || next.call(this, token);
    }
    return this._completeObjectLiteralPost(token, listItem);
  }
  // Completes a literal in subject or predicate position
  _completeTermLiteral(token, component) {
    const completed = this._completeLiteral(token, component);
    if (!completed)
      return;
    let next;
    if (component === "subject") {
      this._subject = completed.literal;
      next = this._readPredicateOrNamedGraph;
    } else {
      this._predicate = completed.literal;
      this._validAnnotation = true;
      next = this._readObject;
    }
    if (completed.readCb) {
      this._literalListItem = false;
      return this._readDirCode;
    }
    const reader = this._getPathEndReader(completed.token, next, component);
    if (reader)
      return reader;
    return next.call(this, completed.token);
  }
  // Completes a literal in subject position
  _completeSubjectLiteral(token) {
    return this._completeTermLiteral(token, "subject");
  }
  // Completes a literal in predicate position
  _completePredicateLiteral(token) {
    return this._completeTermLiteral(token, "predicate");
  }
  // Completes a literal in object position
  _completeObjectLiteral(token, listItem) {
    const completed = this._completeLiteral(token, "object");
    if (!completed)
      return;
    this._object = completed.literal;
    if (completed.readCb) {
      this._literalListItem = listItem;
      return this._readDirCode;
    }
    return this._completeObjectLiteralPost(completed.token, listItem);
  }
  _completeObjectLiteralPost(token, listItem) {
    if (this._n3Mode && (token === null || token.type === "!" || token.type === "^")) {
      if (listItem) {
        this._saveContext("item", this._graph, this._subject, this.RDF_FIRST, this._object);
        this._subject = this._object, this._predicate = null;
        return this._getPathEndReader(token, this._readListItem);
      }
      return this._getPathEndReader(token, this._getContextEndReader());
    }
    if (listItem)
      this._emit(this._subject, this.RDF_FIRST, this._object, this._graph);
    if (token === null)
      return this._getContextEndReader();
    else {
      this._readCallback = this._getContextEndReader();
      return this._readCallback(token);
    }
  }
  // ### `_readFormulaTail` reads the end of a formula
  _readFormulaTail(token) {
    if (token.type !== "}")
      return this._readPunctuation(token);
    if (this._subject !== null)
      this._emit(this._subject, this._predicate, this._object, this._graph);
    const formula = this._graph, empty = this._emptyFormula;
    this._restoreContext("formula", token);
    if (empty && this._emptyFormulaAsTrue) {
      if (this._subject === formula)
        this._subject = this.N3_TRUE;
      else if (this._predicate === formula)
        this._predicate = this.N3_TRUE;
      else
        this._object = this.N3_TRUE;
    }
    if (this._object !== null)
      return this._getPathReader(this._getContextEndReader(), "object");
    if (this._predicate !== null)
      return this._getPathReader(this._readObject, "predicate");
    return this._getPathReader(this._readPredicate, "subject");
  }
  // ### `_readPunctuation` reads punctuation between quads or quad parts
  _readPunctuation(token) {
    let next, graph = this._graph, startingAnnotation = false;
    const subject = this._subject, inversePredicate = this._inversePredicate;
    switch (token.type) {
      case "}":
        if (this._graph === null)
          return this._error("Unexpected graph closing", token);
        if (this._n3Mode)
          return this._readFormulaTail(token);
        this._graph = null;
      case ".":
        this._subject = null;
        this._tripleTerm = null;
        next = this._getStatementReader();
        if (inversePredicate) this._inversePredicate = false;
        break;
      case ";":
        next = this._readPredicate;
        break;
      case ",":
        next = this._readObject;
        break;
      case "~":
        if (subject !== null)
          this._tripleTerm = null;
        next = this._readReifierInAnnotation;
        startingAnnotation = true;
        break;
      case "{|":
        if (subject !== null)
          this._tripleTerm = null;
        this._subject = this._readTripleTerm();
        this._validAnnotation = false;
        startingAnnotation = true;
        next = this._readPredicate;
        break;
      case "|}":
        if (!this._annotation)
          return this._error("Unexpected annotation syntax closing", token);
        if (!this._validAnnotation)
          return this._error("Annotation block can not be empty", token);
        this._subject = null;
        this._annotation = false;
        next = this._getContextEndReader();
        break;
      default:
        if (this._supportsQuads && this._graph === null && (graph = this._readEntity(token)) !== void 0) {
          next = this._readQuadPunctuation;
          break;
        }
        return this._error(`Expected punctuation to follow "${this._object.id}"`, token);
    }
    if (subject !== null && (!startingAnnotation || startingAnnotation && !this._annotation)) {
      const predicate = this._predicate, object = this._object;
      if (!inversePredicate)
        this._emit(subject, predicate, object, graph);
      else
        this._emit(object, predicate, subject, graph);
    }
    if (startingAnnotation) {
      this._annotation = true;
    }
    return next;
  }
  // ### `_readBlankNodePunctuation` reads punctuation in a blank node
  _readBlankNodePunctuation(token) {
    let next;
    switch (token.type) {
      case ";":
        next = this._readPredicate;
        break;
      case ",":
        next = this._readObject;
        break;
      case "~":
      case "{|":
      case "|}":
        return this._readPunctuation(token);
      default:
        return this._error(`Expected punctuation to follow "${this._object.id}"`, token);
    }
    if (this._subject === null)
      return this._error("Expected ] to follow annotation", token);
    this._emit(this._subject, this._predicate, this._object, this._graph);
    return next;
  }
  // ### `_readQuadPunctuation` reads punctuation after a quad
  _readQuadPunctuation(token) {
    if (token.type !== ".")
      return this._error("Expected dot to follow quad", token);
    return this._readInTopContext;
  }
  // ### `_readPrefix` reads the prefix of a prefix declaration
  _readPrefix(token) {
    if (token.type !== "prefix")
      return this._error("Expected prefix to follow @prefix", token);
    this._prefix = token.value;
    return this._readPrefixIRI;
  }
  // ### `_readPrefixIRI` reads the IRI of a prefix declaration
  _readPrefixIRI(token) {
    if (token.type !== "IRI")
      return this._error(`Expected IRI to follow prefix "${this._prefix}:"`, token);
    const prefixNode = this._readEntity(token);
    this._prefixes[this._prefix] = prefixNode.value;
    this._prefixCallback(this._prefix, prefixNode);
    return this._readDeclarationPunctuation;
  }
  // ### `_readBaseIRI` reads the IRI of a base declaration
  _readBaseIRI(token) {
    const iri = token.type === "IRI" && this._resolveIRI(token.value);
    if (!iri)
      return this._error("Expected valid IRI to follow base declaration", token);
    this._setBase(iri);
    return this._readDeclarationPunctuation;
  }
  // ### `_isValidVersion` checks if the given version is valid for this parser to handle.
  _isValidVersion(version) {
    return this._parseUnsupportedVersions || _N3Parser.SUPPORTED_VERSIONS.includes(version);
  }
  // ### `_readVersion` reads version string declaration
  _readVersion(token) {
    if (token.type !== "literal")
      return this._error("Expected literal to follow version declaration", token);
    if (token.end - token.start !== token.value.length + 2)
      return this._error("Version declarations must use single quotes", token);
    this._versionCallback(token.value);
    if (!this._isValidVersion(token.value))
      return this._error(`Detected unsupported version: "${token.value}"`, token);
    return this._readDeclarationPunctuation;
  }
  // ### `_readNamedGraphLabel` reads the label of a named graph
  _readNamedGraphLabel(token) {
    switch (token.type) {
      case "IRI":
      case "blank":
      case "prefixed":
        return this._readSubject(token), this._readGraph;
      case "[":
        return this._readNamedGraphBlankLabel;
      default:
        return this._error("Invalid graph label", token);
    }
  }
  // ### `_readNamedGraphLabel` reads a blank node label of a named graph
  _readNamedGraphBlankLabel(token) {
    if (token.type !== "]")
      return this._error("Invalid graph label", token);
    this._subject = this._factory.blankNode();
    return this._readGraph;
  }
  // ### `_readDeclarationPunctuation` reads the punctuation of a declaration
  _readDeclarationPunctuation(token) {
    if (this._sparqlStyle) {
      this._sparqlStyle = false;
      return this._getStatementReader().call(this, token);
    }
    if (token.type !== ".")
      return this._error("Expected declaration to end with a dot", token);
    return this._getStatementReader();
  }
  // Reads a list of quantified symbols from a @forSome or @forAll statement
  _readQuantifierList(token) {
    let entity;
    switch (token.type) {
      case "IRI":
      case "prefixed":
        if ((entity = this._readEntity(token, true)) !== void 0)
          break;
      default:
        return this._error(`Unexpected ${token.type}`, token);
    }
    if (!this._explicitQuantifiers)
      this._quantified[entity.id] = this._factory[this._quantifier](this._factory.blankNode().value);
    else {
      if (this._subject === null)
        this._emit(
          this._graph || this.DEFAULTGRAPH,
          this._predicate,
          this._subject = this._factory.blankNode(),
          this.QUANTIFIERS_GRAPH
        );
      else
        this._emit(
          this._subject,
          this.RDF_REST,
          this._subject = this._factory.blankNode(),
          this.QUANTIFIERS_GRAPH
        );
      this._emit(this._subject, this.RDF_FIRST, entity, this.QUANTIFIERS_GRAPH);
    }
    return this._readQuantifierPunctuation;
  }
  // Reads punctuation from a @forSome or @forAll statement
  _readQuantifierPunctuation(token) {
    if (token.type === ",")
      return this._readQuantifierList;
    else {
      if (this._explicitQuantifiers) {
        this._emit(this._subject, this.RDF_REST, this.RDF_NIL, this.QUANTIFIERS_GRAPH);
        this._subject = null;
      }
      this._readCallback = this._getContextEndReader();
      return this._readCallback(token);
    }
  }
  // ### `_getPathReader` reads a potential path and then resumes with the given function
  _getPathReader(afterPath, position) {
    this._afterPath = afterPath;
    this._pathPosition = position || (this._predicate === null ? "subject" : "object");
    return this._readPath;
  }
  // ### `_getPathEndReader` continues reading after a term that might start a path,
  // given the pending token that follows the term (or `null` if it was consumed)
  _getPathEndReader(token, afterPath, position) {
    if (token !== null && token.type !== "!" && token.type !== "^")
      return null;
    const reader = this._getPathReader(afterPath, position);
    return token === null ? reader : reader.call(this, token);
  }
  // ### `_readPath` reads a potential path
  _readPath(token) {
    switch (token.type) {
      case "!":
        return this._readForwardPath;
      case "^":
        return this._readBackwardPath;
      default:
        const afterPath = this._afterPath;
        const stack = this._contextStack, parent = stack.length && stack[stack.length - 1];
        if (parent && parent.type === "item") {
          const item = this._subject;
          this._restoreContext("item", token);
          this._emit(this._subject, this.RDF_FIRST, item, this._graph);
        }
        this._afterPath = null;
        this._pathPosition = null;
        return afterPath.call(this, token);
    }
  }
  // ### `_readForwardPath` reads a '!' path
  _readForwardPath(token) {
    let subject, predicate;
    const object = this._factory.blankNode();
    if ((predicate = this._readEntity(token)) === void 0)
      return;
    if (this._pathPosition === "subject")
      subject = this._subject, this._subject = object;
    else if (this._pathPosition === "predicate")
      subject = this._predicate, this._predicate = object;
    else
      subject = this._object, this._object = object;
    this._emit(subject, predicate, object, this._graph);
    return this._readPath;
  }
  // ### `_readBackwardPath` reads a '^' path
  _readBackwardPath(token) {
    const subject = this._factory.blankNode();
    let predicate, object;
    if ((predicate = this._readEntity(token)) === void 0)
      return;
    if (this._pathPosition === "subject")
      object = this._subject, this._subject = subject;
    else if (this._pathPosition === "predicate")
      object = this._predicate, this._predicate = subject;
    else
      object = this._object, this._object = subject;
    this._emit(subject, predicate, object, this._graph);
    return this._readPath;
  }
  // ### `_readTripleTermTail` reads the end of a triple term
  _readTripleTermTail(token) {
    if (token.type !== ")>>")
      return this._error(`Expected )>> but got ${token.type}`, token);
    const quad2 = this._factory.quad(
      this._subject,
      this._predicate,
      this._object,
      this._graph || this.DEFAULTGRAPH
    );
    this._restoreContext("<<(", token);
    const stack = this._contextStack, parent = stack.length && stack[stack.length - 1];
    if (parent && parent.type === "list") {
      this._emit(this._subject, this.RDF_FIRST, quad2, this._graph);
      return this._getContextEndReader();
    }
    if (this._subject === null) {
      this._subject = quad2;
      return this._readPredicate;
    } else {
      this._object = quad2;
      return this._getContextEndReader();
    }
  }
  // ### `_readReifiedTripleTailOrReifier` reads a reifier or the end of a nested reified triple
  _readReifiedTripleTailOrReifier(token) {
    if (token.type === "~") {
      return this._readReifier;
    }
    return this._readReifiedTripleTail(token);
  }
  // ### `_readReifiedTripleTail` reads the end of a nested reified triple
  _readReifiedTripleTail(token) {
    if (token.type !== ">>")
      return this._error(`Expected >> but got ${token.type}`, token);
    this._tripleTerm = null;
    const reifier = this._readTripleTerm();
    this._restoreContext("<<", token);
    const stack = this._contextStack, parent = stack.length && stack[stack.length - 1];
    if (parent && parent.type === "list") {
      this._emit(this._subject, this.RDF_FIRST, reifier, this._graph);
      return this._getContextEndReader();
    } else if (this._subject === null) {
      this._subject = reifier;
      return this._readPredicateOrReifierTripleEnd;
    } else {
      this._object = reifier;
      return this._getContextEndReader();
    }
  }
  _readPredicateOrReifierTripleEnd(token) {
    if (token.type === ".") {
      this._subject = null;
      return this._readPunctuation(token);
    }
    return this._readPredicate(token);
  }
  // ### `_readReifier` reads the triple term identifier after a tilde when in a reifying triple.
  _readReifier(token) {
    this._reifier = this._readEntity(token);
    return this._readReifiedTripleTail;
  }
  // ### `_readReifier` reads the optional triple term identifier after a tilde when in annotation syntax.
  _readReifierInAnnotation(token) {
    if (token.type === "IRI" || token.type === "typeIRI" || token.type === "type" || token.type === "prefixed" || token.type === "blank" || token.type === "var") {
      this._reifier = this._readEntity(token);
      return this._readAnnotationBlockOrPunctuation;
    }
    this._readTripleTerm();
    this._subject = null;
    return this._getContextEndReader().call(this, token);
  }
  // ### `_readAnnotationBlockOrPunctuation` reads what follows an explicit reifier:
  // either an annotation block, which reuses the reifier as its subject,
  // or punctuation, in which case the reifier stands alone and its triple
  // term still needs to be asserted here.
  _readAnnotationBlockOrPunctuation(token) {
    if (token.type === "{|")
      return this._readPunctuation(token);
    this._readTripleTerm();
    this._annotation = false;
    this._tripleTerm = null;
    switch (token.type) {
      case ";":
        return this._readPredicate;
      case ",":
        return this._readObject;
      default:
        this._subject = null;
        return this._getContextEndReader().call(this, token);
    }
  }
  _readTripleTerm() {
    const stack = this._contextStack, parent = stack.length && stack[stack.length - 1];
    const parentGraph = parent ? parent.graph : void 0;
    const reifier = this._reifier || this._factory.blankNode();
    this._reifier = null;
    this._tripleTerm = this._tripleTerm || this._factory.quad(this._subject, this._predicate, this._object);
    this._emit(reifier, this.RDF_REIFIES, this._tripleTerm, parentGraph || this._graph || this.DEFAULTGRAPH);
    return reifier;
  }
  // ### `_getContextEndReader` gets the next reader function at the end of a context
  _getContextEndReader() {
    const contextStack = this._contextStack;
    if (!contextStack.length)
      return this._readPunctuation;
    switch (contextStack[contextStack.length - 1].type) {
      case "blank":
        return this._readBlankNodeTail;
      case "list":
        return this._readListItem;
      case "formula":
        return this._readFormulaTail;
      case "<<(":
        return this._readTripleTermTail;
      case "<<":
        return this._readReifiedTripleTailOrReifier;
    }
  }
  // ### `_emit` sends a quad through the callback
  _emit(subject, predicate, object, graph) {
    this._callback(null, this._factory.quad(subject, predicate, object, graph || this.DEFAULTGRAPH));
  }
  // ### `_error` emits an error message through the callback
  _error(message, token) {
    const suffix = ` on line ${token.line}.`;
    if (message.length + suffix.length > 200)
      message = `${message.slice(0, 199 - suffix.length)}\u2026`;
    const err = new Error(`${message}${suffix}`);
    err.context = {
      token,
      line: token.line,
      previousToken: this._lexer.previousToken
    };
    this._callback(err);
    this._callback = noop;
  }
  // ### `_resolveIRI` resolves an IRI against the base path
  _resolveIRI(iri) {
    return /^[a-z][a-z0-9+.-]*:/i.test(iri) ? iri : this._resolveRelativeIRI(iri);
  }
  // ### `_resolveRelativeIRI` resolves an IRI against the base path,
  // assuming that a base path has been set and that the IRI is indeed relative
  _resolveRelativeIRI(iri) {
    if (!iri.length)
      return this._base;
    switch (iri[0]) {
      case "#":
        return this._base + iri;
      case "?":
        return this._base.replace(/(?:\?.*)?$/, iri);
      case "/":
        return (iri[1] === "/" ? this._baseScheme : this._baseRoot) + this._removeDotSegments(iri);
      default:
        return /^[^/:]*:/.test(iri) ? null : this._removeDotSegments(this._basePath + iri);
    }
  }
  // ### `_removeDotSegments` resolves './' and '../' path segments in an IRI as per RFC3986
  _removeDotSegments(iri) {
    if (!/(^|\/)\.\.?($|[/#?])/.test(iri))
      return iri;
    const length = iri.length;
    let result = "", i = -1, pathStart = -1, segmentStart = 0, next = "/";
    while (i < length) {
      switch (next) {
        case ":":
          if (pathStart < 0) {
            if (iri[++i] === "/" && iri[++i] === "/")
              while ((pathStart = i + 1) < length && iri[pathStart] !== "/")
                i = pathStart;
          }
          break;
        case "?":
        case "#":
          i = length;
          break;
        case "/":
          if (iri[i + 1] === ".") {
            next = iri[++i + 1];
            switch (next) {
              case "/":
                result += iri.substring(segmentStart, i - 1);
                segmentStart = i + 1;
                break;
              case void 0:
              case "?":
              case "#":
                return result + iri.substring(segmentStart, i) + iri.substr(i + 1);
              case ".":
                next = iri[++i + 1];
                if (next === void 0 || next === "/" || next === "?" || next === "#") {
                  result += iri.substring(segmentStart, i - 2);
                  if ((segmentStart = result.lastIndexOf("/")) >= pathStart)
                    result = result.substr(0, segmentStart);
                  if (next !== "/")
                    return `${result}/${iri.substr(i + 1)}`;
                  segmentStart = i + 1;
                }
            }
          }
      }
      next = iri[++i];
    }
    return result + iri.substring(segmentStart);
  }
  // ## Public methods
  // ### `parse` parses the N3 input and emits each parsed quad through the onQuad callback.
  parse(input, quadCallback, prefixCallback, versionCallback) {
    let onQuad, onPrefix, onComment, onVersion;
    if (quadCallback && (quadCallback.onQuad || quadCallback.onPrefix || quadCallback.onComment || quadCallback.onVersion)) {
      onQuad = quadCallback.onQuad;
      onPrefix = quadCallback.onPrefix;
      onComment = quadCallback.onComment;
      onVersion = quadCallback.onVersion;
    } else {
      onQuad = quadCallback;
      onPrefix = prefixCallback;
      onVersion = versionCallback;
    }
    this._readCallback = this._readBeforeTopContext;
    this._sparqlStyle = false;
    this._prefixes = /* @__PURE__ */ Object.create(null);
    this._prefixes._ = this._blankNodePrefix ? this._blankNodePrefix.substr(2) : `b${blankNodePrefix++}_`;
    if (this._n3Mode && this._implicitEmptyPrefix && this._base)
      this._prefixes[""] = this._resolveIRI("#");
    this._prefixCallback = onPrefix || noop;
    this._versionCallback = onVersion || noop;
    this._inversePredicate = false;
    this._quantified = /* @__PURE__ */ Object.create(null);
    this._emptyFormula = false;
    if (!onQuad) {
      const quads = [];
      let error;
      this._callback = (e, t) => {
        e ? error = e : t && quads.push(t);
      };
      this._lexer.tokenize(input).every((token) => {
        return this._readCallback = this._readCallback(token);
      });
      if (error) throw error;
      return quads;
    }
    let processNextToken = (error, token) => {
      if (error !== null)
        this._callback(error), this._callback = noop;
      else if (this._readCallback)
        this._readCallback = this._readCallback(token);
    };
    if (onComment) {
      this._lexer.comments = true;
      processNextToken = (error, token) => {
        if (error !== null)
          this._callback(error), this._callback = noop;
        else if (this._readCallback) {
          if (token.type === "comment")
            onComment(token.value);
          else
            this._readCallback = this._readCallback(token);
        }
      };
    }
    this._callback = onQuad;
    this._lexer.tokenize(input, processNextToken);
  }
};
function noop() {
}
function initDataFactory(parser, factory) {
  parser._factory = factory;
  parser.DEFAULTGRAPH = factory.defaultGraph();
  parser.RDF_FIRST = factory.namedNode(IRIs_default.rdf.first);
  parser.RDF_REST = factory.namedNode(IRIs_default.rdf.rest);
  parser.RDF_NIL = factory.namedNode(IRIs_default.rdf.nil);
  parser.RDF_REIFIES = factory.namedNode(IRIs_default.rdf.reifies);
  parser.N3_FORALL = factory.namedNode(IRIs_default.r.forAll);
  parser.N3_FORSOME = factory.namedNode(IRIs_default.r.forSome);
  parser.N3_TRUE = factory.literal("true", factory.namedNode(IRIs_default.xsd.boolean));
  parser.ABBREVIATIONS = {
    "a": factory.namedNode(IRIs_default.rdf.type),
    "=": factory.namedNode(IRIs_default.owl.sameAs),
    ">": factory.namedNode(IRIs_default.log.implies),
    "<": factory.namedNode(IRIs_default.log.isImpliedBy)
  };
  parser.QUANTIFIERS_GRAPH = factory.namedNode("urn:n3:quantifiers");
}
N3Parser.SUPPORTED_VERSIONS = [
  "1.2",
  "1.2-basic",
  "1.1"
];
initDataFactory(N3Parser.prototype, N3DataFactory_default);

// node_modules/n3/src/N3Util.js
function isDefaultGraph(term) {
  return !!term && term.termType === "DefaultGraph";
}

// node_modules/n3/src/Util.js
function escapeRegex(regex) {
  return regex.replace(/[\]\/\(\)\*\+\?\.\\\$]/g, "\\$&");
}

// node_modules/n3/src/BaseIRI.js
var BASE_UNSUPPORTED = /^:?[^:?#]*(?:[?#]|$)|^file:|^[^:]*:\/*[^?#]+?\/(?:\.\.?(?:\/|$)|\/)/i;
var SUFFIX_SUPPORTED = /^(?:(?:[^/?#]{3,}|\.?[^/?#.]\.?)(?:\/[^/?#]{3,}|\.?[^/?#.]\.?)*\/?)?(?:[?#]|$)/;
var CURRENT = "./";
var PARENT = "../";
var QUERY = "?";
var FRAGMENT = "#";
var BaseIRI = class _BaseIRI {
  constructor(base) {
    this.base = base;
    this._baseLength = 0;
    this._baseMatcher = null;
    this._pathReplacements = new Array(base.length + 1);
  }
  static supports(base) {
    return !BASE_UNSUPPORTED.test(base);
  }
  _getBaseMatcher() {
    if (this._baseMatcher)
      return this._baseMatcher;
    if (!_BaseIRI.supports(this.base))
      return this._baseMatcher = /.^/;
    const scheme = /^[^:]*:\/*/.exec(this.base)[0];
    const regexHead = ["^", escapeRegex(scheme)];
    const regexTail = [];
    const segments = [], segmenter = /[^/?#]*([/?#])/y;
    let segment, query = 0, fragment = 0, last = segmenter.lastIndex = scheme.length;
    while (!query && !fragment && (segment = segmenter.exec(this.base))) {
      if (segment[1] === FRAGMENT)
        fragment = segmenter.lastIndex - 1;
      else {
        regexHead.push(escapeRegex(segment[0]), "(?:");
        regexTail.push(")?");
        if (segment[1] !== QUERY)
          segments.push(last = segmenter.lastIndex);
        else {
          query = last = segmenter.lastIndex;
          fragment = this.base.indexOf(FRAGMENT, query);
          this._pathReplacements[query] = QUERY;
        }
      }
    }
    for (let i = 0; i < segments.length; i++)
      this._pathReplacements[segments[i]] = PARENT.repeat(segments.length - i - 1);
    this._pathReplacements[segments[segments.length - 1]] = CURRENT;
    this._baseLength = fragment > 0 ? fragment : this.base.length;
    regexHead.push(
      escapeRegex(this.base.substring(last, this._baseLength)),
      query ? "(?:#|$)" : "(?:[?#]|$)"
    );
    return this._baseMatcher = new RegExp([...regexHead, ...regexTail].join(""));
  }
  toRelative(iri) {
    const match = this._getBaseMatcher().exec(iri);
    if (!match)
      return iri;
    const length = match[0].length;
    if (length === this._baseLength && length === iri.length)
      return "";
    const parentPath = this._pathReplacements[length];
    if (parentPath) {
      const suffix = iri.substring(length);
      if (parentPath !== QUERY && !SUFFIX_SUPPORTED.test(suffix))
        return iri;
      if (parentPath === CURRENT && /^[^?#]/.test(suffix))
        return suffix;
      return parentPath + suffix;
    }
    return iri.substring(length - 1);
  }
};

// node_modules/n3/src/N3Writer.js
var DEFAULTGRAPH2 = N3DataFactory_default.defaultGraph();
var { rdf: rdf2, xsd: xsd3 } = IRIs_default;
var escape = /["\\\t\n\r\b\f\u0000-\u0019\ud800-\udbff]/;
var escapeAll = /["\\\t\n\r\b\f\u0000-\u0019]|[\ud800-\udbff][\udc00-\udfff]/g;
var escapedCharacters = {
  "\\": "\\\\",
  '"': '\\"',
  "	": "\\t",
  "\n": "\\n",
  "\r": "\\r",
  "\b": "\\b",
  "\f": "\\f"
};
var SerializedTerm = class extends Term {
  // Pretty-printed nodes are not equal to any other node
  // (e.g., [] does not equal [])
  equals(other) {
    return other === this;
  }
};
var N3Writer = class {
  constructor(outputStream, options) {
    this._prefixRegex = /$0^/;
    this._hasPrefixes = false;
    if (outputStream && typeof outputStream.write !== "function")
      options = outputStream, outputStream = null;
    options = options || {};
    this._lists = options.lists;
    if (!outputStream) {
      let output = "";
      this._outputStream = {
        write(chunk, encoding, done) {
          output += chunk;
          done && done();
        },
        end: (done) => {
          done && done(null, output);
        }
      };
      this._endStream = true;
    } else {
      this._outputStream = outputStream;
      this._endStream = options.end === void 0 ? true : !!options.end;
    }
    this._subject = null;
    if (!/triple|quad/i.test(options.format)) {
      this._lineMode = false;
      this._graph = DEFAULTGRAPH2;
      this._prefixIRIs = /* @__PURE__ */ Object.create(null);
      if (options.baseIRI) {
        this._baseIri = new BaseIRI(options.baseIRI);
        if (options.writeBase)
          this._write(`@base <${options.baseIRI}>.
`);
      }
      options.prefixes && this.addPrefixes(options.prefixes);
    } else {
      this._lineMode = true;
      this._writeQuad = this._writeQuadLine;
    }
  }
  // ## Private methods
  // ### Whether the current graph is the default graph
  get _inDefaultGraph() {
    return DEFAULTGRAPH2.equals(this._graph);
  }
  // ### `_write` writes the argument to the output stream
  _write(string, callback) {
    this._outputStream.write(string, "utf8", callback);
  }
  // ### `_writeQuad` writes the quad to the output stream
  _writeQuad(subject, predicate, object, graph, done) {
    try {
      if (!graph.equals(this._graph) || graph.termType !== this._graph.termType) {
        this._write((this._subject === null ? "" : this._inDefaultGraph ? ".\n" : "\n}\n") + (DEFAULTGRAPH2.equals(graph) ? "" : `${this._encodeIriOrBlank(graph)} {
`));
        this._graph = graph;
        this._subject = null;
      }
      if (subject.equals(this._subject)) {
        if (predicate.equals(this._predicate))
          this._write(`, ${this._encodeObject(object)}`, done);
        else
          this._write(`;
    ${this._encodePredicate(this._predicate = predicate)} ${this._encodeObject(object)}`, done);
      } else
        this._write(`${(this._subject === null ? "" : ".\n") + this._encodeSubject(this._subject = subject)} ${this._encodePredicate(this._predicate = predicate)} ${this._encodeObject(object)}`, done);
    } catch (error) {
      done && done(error);
    }
  }
  // ### `_writeQuadLine` writes the quad to the output stream as a single line
  _writeQuadLine(subject, predicate, object, graph, done) {
    delete this._prefixMatch;
    this._write(this.quadToString(subject, predicate, object, graph), done);
  }
  // ### `quadToString` serializes a quad as a string
  quadToString(subject, predicate, object, graph) {
    return `${this._encodeSubject(subject)} ${this._encodeIriOrBlank(predicate)} ${this._encodeObject(object)}${graph && !isDefaultGraph(graph) ? ` ${this._encodeIriOrBlank(graph)} .
` : " .\n"}`;
  }
  // ### `quadsToString` serializes an array of quads as a string
  quadsToString(quads) {
    let quadsString = "";
    for (const quad2 of quads)
      quadsString += this.quadToString(quad2.subject, quad2.predicate, quad2.object, quad2.graph);
    return quadsString;
  }
  // ### `_encodeSubject` represents a subject
  _encodeSubject(entity) {
    return entity.termType === "Quad" ? this._encodeQuad(entity) : this._encodeIriOrBlank(entity);
  }
  // ### `_encodeIriOrBlank` represents an IRI or blank node
  _encodeIriOrBlank(entity) {
    if (entity.termType !== "NamedNode") {
      if (this._lists && entity.value in this._lists)
        entity = this.list(this._lists[entity.value]);
      return entity.termType === "Variable" ? `?${entity.value}` : "id" in entity ? entity.id : `_:${entity.value}`;
    }
    let iri = entity.value;
    if (this._baseIri) {
      iri = this._baseIri.toRelative(iri);
    }
    if (escape.test(iri))
      iri = iri.replace(escapeAll, characterReplacer);
    const prefixMatch = this._hasPrefixes ? this._prefixRegex.exec(iri) : null;
    return !prefixMatch ? `<${iri}>` : !prefixMatch[1] ? iri : this._prefixIRIs[prefixMatch[1]] + prefixMatch[2];
  }
  // ### `_encodeLiteral` represents a literal
  _encodeLiteral(literal2) {
    let value = literal2.value;
    if (escape.test(value))
      value = value.replace(escapeAll, characterReplacer);
    const direction = literal2.direction ? `--${literal2.direction}` : "";
    if (literal2.language)
      return `"${value}"@${literal2.language}${direction}`;
    if (this._lineMode) {
      if (literal2.datatype.value === xsd3.string)
        return `"${value}"`;
    } else {
      switch (literal2.datatype.value) {
        case xsd3.string:
          return `"${value}"`;
        case xsd3.boolean:
          if (value === "true" || value === "false")
            return value;
          break;
        case xsd3.integer:
          if (/^[+-]?\d+$/.test(value))
            return value;
          break;
        case xsd3.decimal:
          if (/^[+-]?\d*\.\d+$/.test(value))
            return value;
          break;
        case xsd3.double:
          if (/^[+-]?(?:\d+\.\d*|\.?\d+)[eE][+-]?\d+$/.test(value))
            return value;
          break;
      }
    }
    return `"${value}"^^${this._encodeIriOrBlank(literal2.datatype)}`;
  }
  // ### `_encodePredicate` represents a predicate
  _encodePredicate(predicate) {
    return predicate.value === rdf2.type ? "a" : this._encodeIriOrBlank(predicate);
  }
  // ### `_encodeObject` represents an object
  _encodeObject(object) {
    switch (object.termType) {
      case "Quad":
        return this._encodeQuad(object);
      case "Literal":
        return this._encodeLiteral(object);
      default:
        return this._encodeIriOrBlank(object);
    }
  }
  // ### `_encodeQuad` encodes an RDF-star quad
  _encodeQuad({ subject, predicate, object, graph }) {
    return `<<(${this._encodeSubject(subject)} ${this._encodePredicate(predicate)} ${this._encodeObject(object)}${isDefaultGraph(graph) ? "" : ` ${this._encodeIriOrBlank(graph)}`})>>`;
  }
  // ### `_blockedWrite` replaces `_write` after the writer has been closed
  _blockedWrite() {
    throw new Error("Cannot write because the writer has been closed.");
  }
  // ### `addQuad` adds the quad to the output stream
  addQuad(subject, predicate, object, graph, done) {
    if (object === void 0)
      this._writeQuad(subject.subject, subject.predicate, subject.object, subject.graph, predicate);
    else if (typeof graph === "function")
      this._writeQuad(subject, predicate, object, DEFAULTGRAPH2, graph);
    else
      this._writeQuad(subject, predicate, object, graph || DEFAULTGRAPH2, done);
  }
  // ### `addQuads` adds the quads to the output stream
  addQuads(quads) {
    for (let i = 0; i < quads.length; i++)
      this.addQuad(quads[i]);
  }
  // ### `addPrefix` adds the prefix to the output stream
  addPrefix(prefix, iri, done) {
    const prefixes = {};
    prefixes[prefix] = iri;
    this.addPrefixes(prefixes, done);
  }
  // ### `addPrefixes` adds the prefixes to the output stream
  addPrefixes(prefixes, done) {
    if (!this._prefixIRIs)
      return done && done();
    let hasPrefixes = false;
    for (let prefix in prefixes) {
      let iri = prefixes[prefix];
      if (typeof iri !== "string")
        iri = iri.value;
      hasPrefixes = true;
      if (this._subject !== null) {
        this._write(this._inDefaultGraph ? ".\n" : "\n}\n");
        this._subject = null, this._graph = "";
      }
      this._prefixIRIs[iri] = prefix += ":";
      this._write(`@prefix ${prefix} <${iri}>.
`);
    }
    if (hasPrefixes) {
      this._hasPrefixes = true;
      let IRIlist = "", prefixList = "";
      for (const prefixIRI in this._prefixIRIs) {
        IRIlist += IRIlist ? `|${prefixIRI}` : prefixIRI;
        prefixList += (prefixList ? "|" : "") + this._prefixIRIs[prefixIRI];
      }
      IRIlist = escapeRegex(IRIlist, /[\]\/\(\)\*\+\?\.\\\$]/g, "\\$&");
      this._prefixRegex = new RegExp(`^(?:${prefixList})[^/]*$|^(${IRIlist})([_a-zA-Z0-9](?:\\.?[\\-_a-zA-Z0-9])*)$`);
    }
    this._write(hasPrefixes ? "\n" : "", done);
  }
  // ### `blank` creates a blank node with the given content
  blank(predicate, object) {
    let children = predicate, child, length;
    if (predicate === void 0)
      children = [];
    else if (predicate.termType)
      children = [{ predicate, object }];
    else if (!("length" in predicate))
      children = [predicate];
    switch (length = children.length) {
      case 0:
        return new SerializedTerm("[]");
      case 1:
        child = children[0];
        if (!(child.object instanceof SerializedTerm))
          return new SerializedTerm(`[ ${this._encodePredicate(child.predicate)} ${this._encodeObject(child.object)} ]`);
      default:
        let contents = "[";
        for (let i = 0; i < length; i++) {
          child = children[i];
          if (child.predicate.equals(predicate))
            contents += `, ${this._encodeObject(child.object)}`;
          else {
            contents += `${(i ? ";\n  " : "\n  ") + this._encodePredicate(child.predicate)} ${this._encodeObject(child.object)}`;
            predicate = child.predicate;
          }
        }
        return new SerializedTerm(`${contents}
]`);
    }
  }
  // ### `list` creates a list node with the given content
  list(elements) {
    const length = elements && elements.length || 0, contents = new Array(length);
    for (let i = 0; i < length; i++)
      contents[i] = this._encodeObject(elements[i]);
    return new SerializedTerm(`(${contents.join(" ")})`);
  }
  // ### `end` signals the end of the output stream
  end(done) {
    if (this._subject !== null) {
      this._write(this._inDefaultGraph ? ".\n" : "\n}\n");
      this._subject = null;
    }
    this._write = this._blockedWrite;
    let singleDone = done && ((error, result) => {
      singleDone = null, done(error, result);
    });
    if (this._endStream) {
      try {
        return this._outputStream.end(singleDone);
      } catch (error) {
      }
    }
    singleDone && singleDone();
  }
};
function characterReplacer(character) {
  let result = escapedCharacters[character];
  if (result === void 0) {
    if (character.length === 1) {
      result = character.charCodeAt(0).toString(16);
      result = "\\u0000".substr(0, 6 - result.length) + result;
    } else {
      result = ((character.charCodeAt(0) - 55296) * 1024 + character.charCodeAt(1) + 9216).toString(16);
      result = "\\U00000000".substr(0, 10 - result.length) + result;
    }
  }
  return result;
}
export {
  N3Parser as Parser,
  N3Writer as Writer
};
