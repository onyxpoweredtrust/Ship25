// Datasets Serializer
// designed and built by onyxlabs.

const RESERVED_CHARS = /[/,()]/;
const RESERVED_WORDS = new Set(["true", "false", "null"]);
const NUMBER_LIKE = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;

function needsQuoting(value: string): boolean {
  if (value === "") return true;
  if (RESERVED_CHARS.test(value)) return true;
  if (RESERVED_WORDS.has(value)) return true;
  if (NUMBER_LIKE.test(value)) return true;
  if (value.trim() !== value) return true;
  return false;
}

function serializeString(value: string): string {
  if (!needsQuoting(value)) return value;
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
  return `"${escaped}"`;
}

function serializeScalar(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (typeof value === "string") return serializeString(value);
  throw new Error(`cannot serialize value of type ${typeof value} as a scalar`);
}

function serializeValue(value: unknown): string {
  if (Array.isArray(value)) return `(${value.map(serializeValue).join(", ")})`;
  if (value !== null && typeof value === "object") return `(${serializeObjectBody(value as Record<string, unknown>)})`;
  return serializeScalar(value);
}

function serializePair(key: string, val: unknown): string {
  const isContainer = Array.isArray(val) || (val !== null && typeof val === "object");
  return isContainer ? `${serializeString(key)}${serializeValue(val)}` : `${serializeString(key)}/${serializeValue(val)}`;
}

function serializeObjectBody(obj: Record<string, unknown>): string {
  return Object.entries(obj)
    .map(([key, val]) => serializePair(key, val))
    .join(", ");
}

export function serializeDataset(value: unknown): string {
  if (Array.isArray(value)) return `(${value.map(serializeValue).join(", ")})`;
  if (value !== null && typeof value === "object") return serializeObjectBody(value as Record<string, unknown>);
  return serializeScalar(value);
}
