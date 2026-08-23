// Cores BodyLimits
// designed and built by onyxlabs.

import type { IncomingMessage } from "node:http";

export const MAX_JSON_BODY_BYTES = 1024 * 1024;

export class UnsupportedMediaTypeError extends Error {}
export class PayloadTooLargeError extends Error {}

export function assertJsonContentType(req: IncomingMessage): void {
  const contentType = req.headers["content-type"] ?? "";
  const bare = contentType.split(";")[0]?.trim().toLowerCase();
  if (bare !== "application/json") {
    throw new UnsupportedMediaTypeError(`expected Content-Type: application/json, got "${contentType || "(none)"}"`);
  }
}

export async function readJsonBody(req: IncomingMessage, maxBytes: number = MAX_JSON_BODY_BYTES): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  let overLimit = false;

  for await (const chunk of req) {
    total += (chunk as Buffer).length;
    if (total > maxBytes) {
      overLimit = true;
      continue; // keep draining, stop buffering
    }
    chunks.push(chunk as Buffer);
  }

  if (overLimit) {
    throw new PayloadTooLargeError(`request body exceeds ${maxBytes} bytes`);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    throw new SyntaxError("request body is not valid JSON");
  }
}
