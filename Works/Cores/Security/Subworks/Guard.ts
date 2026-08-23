// Security Guard
// designed and built by onyxlabs.

import type { IncomingMessage } from "node:http";
import type { ScopedTokenPayload, TokenIssuer, TokenScope } from "./Tokens.js";

export class UnauthorizedError extends Error {}
export class ForbiddenError extends Error {}

function extractBearerToken(req: IncomingMessage): string {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw new UnauthorizedError("missing bearer token");
  return header.slice("Bearer ".length);
}

function scopeAllowed(scope: TokenScope, allowed: TokenScope[]): boolean {
  return scope === "zero" || allowed.includes(scope);
}

export async function authorize(
  issuer: TokenIssuer,
  req: IncomingMessage,
  allowedScopes: TokenScope[]
): Promise<ScopedTokenPayload> {
  const token = extractBearerToken(req);

  let payload: ScopedTokenPayload;
  try {
    payload = await issuer.verify(token);
  } catch (err) {
    throw new UnauthorizedError((err as Error).message);
  }

  if (!scopeAllowed(payload.scope, allowedScopes)) {
    throw new ForbiddenError(`scope "${payload.scope}" cannot access this endpoint`);
  }

  return payload;
}
