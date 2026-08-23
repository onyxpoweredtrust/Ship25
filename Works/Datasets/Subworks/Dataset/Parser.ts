// Datasets Parser
// designed and built by onyxlabs.

export class DatasetParseError extends Error {
  constructor(message: string, readonly position: number) {
    super(`${message} (at position ${position})`);
    this.name = "DatasetParseError";
  }
}

const RESERVED = new Set(["/", ",", "(", ")"]);

class Cursor {
  pos = 0;
  constructor(private readonly src: string) {}

  peek(): string | undefined {
    return this.src[this.pos];
  }

  atEnd(): boolean {
    return this.pos >= this.src.length;
  }

  advance(): string {
    return this.src[this.pos++];
  }

  skipWs(): void {
    while (!this.atEnd() && /\s/.test(this.peek()!)) this.pos++;
  }

  expect(char: string): void {
    if (this.peek() !== char) {
      throw new DatasetParseError(`expected "${char}", got "${this.peek() ?? "<end>"}"`, this.pos);
    }
    this.pos++;
  }
}

interface Token {
  raw: string;
  wasQuoted: boolean;
}

function readQuoted(c: Cursor): Token {
  c.expect('"');
  let out = "";
  while (!c.atEnd() && c.peek() !== '"') {
    const ch = c.advance();
    if (ch === "\\") {
      const next = c.advance();
      const escapes: Record<string, string> = { n: "\n", t: "\t", r: "\r", '"': '"', "\\": "\\" };
      out += escapes[next] ?? next;
    } else {
      out += ch;
    }
  }
  c.expect('"');
  return { raw: out, wasQuoted: true };
}

function readBare(c: Cursor): Token {
  let out = "";
  while (!c.atEnd() && !RESERVED.has(c.peek()!)) out += c.advance();
  return { raw: out.trim(), wasQuoted: false };
}

function readToken(c: Cursor): Token {
  c.skipWs();
  return c.peek() === '"' ? readQuoted(c) : readBare(c);
}

function coerceBareValue(raw: string): unknown {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(raw)) return Number(raw);
  return raw;
}

function tokenToValue(t: Token): unknown {
  return t.wasQuoted ? t.raw : coerceBareValue(t.raw);
}

function parseValue(c: Cursor): unknown {
  c.skipWs();
  if (c.peek() === "(") return parseContainer(c);
  return tokenToValue(readToken(c));
}

function parseContainer(c: Cursor): unknown {
  c.expect("(");
  c.skipWs();
  if (c.peek() === ")") {
    c.advance();
    return [];
  }
  const result = parseBody(c, ")", false);
  c.skipWs();
  c.expect(")");
  return result;
}

function parseBody(c: Cursor, closing: string | null, topLevel: boolean): unknown {
  c.skipWs();
  if (c.atEnd() || c.peek() === closing) return topLevel ? {} : [];

  if (c.peek() === "(") {
    const arr = [parseValue(c)];
    c.skipWs();
    while (c.peek() === ",") {
      c.advance();
      arr.push(parseValue(c));
      c.skipWs();
    }
    if (topLevel && arr.length === 1 && (c.atEnd() || c.peek() === closing)) return arr[0];
    return arr;
  }

  const firstToken = readToken(c);
  c.skipWs();

  if (c.peek() === "/" || c.peek() === "(") {
    const readPairValue = () => (c.peek() === "/" ? (c.advance(), parseValue(c)) : parseContainer(c));
    const obj: Record<string, unknown> = { [firstToken.raw]: readPairValue() };
    c.skipWs();
    while (c.peek() === ",") {
      c.advance();
      const key = readToken(c);
      c.skipWs();
      if (c.peek() !== "/" && c.peek() !== "(") {
        throw new DatasetParseError(`expected "/" or "(" after key "${key.raw}"`, c.pos);
      }
      obj[key.raw] = readPairValue();
      c.skipWs();
    }
    return obj;
  }

  if (!topLevel && c.peek() !== "," && c.peek() !== closing) {
    throw new DatasetParseError(`unexpected character "${c.peek()}"`, c.pos);
  }

  if (topLevel && c.peek() !== ",") {
    return tokenToValue(firstToken);
  }

  const arr = [tokenToValue(firstToken)];
  c.skipWs();
  while (c.peek() === ",") {
    c.advance();
    arr.push(parseValue(c));
    c.skipWs();
  }
  return arr;
}

export function parseDataset(text: string): unknown {
  const c = new Cursor(text);
  const result = parseBody(c, null, true);
  c.skipWs();
  if (!c.atEnd()) throw new DatasetParseError(`unexpected trailing content`, c.pos);
  return result;
}
