// Security Tokens
// designed and built by onyxlabs.

import { createInMemoryRevocationStore, type RevocationStore } from "./Revocations.js";

export type TokenScope = "zero" | "one" | "two" | "three" | "sdk";

export interface ScopedTokenPayload {
  scope: TokenScope;
  moduleId?: string;
  dataRole?: string;
  iat: number;
  exp: number;
}

export interface TokenIssuer {
  issue(scope: TokenScope, moduleId?: string, ttlMs?: number, dataRole?: string): Promise<string>;
  verify(token: string): Promise<ScopedTokenPayload>;
  revoke(token: string): Promise<void>;
}

export interface TokenSigner {
  sign(payload: ScopedTokenPayload): Promise<string>;
  verify(token: string): Promise<ScopedTokenPayload>;
}

const DEFAULT_TTL_MS = 15 * 60_000;

export function createTokenIssuer(
  signer: TokenSigner,
  revocationStore: RevocationStore = createInMemoryRevocationStore()
): TokenIssuer {
  return {
    async issue(scope, moduleId, ttlMs = DEFAULT_TTL_MS, dataRole) {
      const now = Date.now();
      return signer.sign({ scope, moduleId, dataRole, iat: now, exp: now + ttlMs });
    },
    async verify(token) {
      if (await revocationStore.has(token)) throw new Error("token revoked");
      const payload = await signer.verify(token);
      if (payload.exp < Date.now()) throw new Error("token expired");
      return payload;
    },
    async revoke(token) {
      const payload = await signer.verify(token).catch(() => null);
      await revocationStore.add(token, payload?.exp ?? Date.now() + DEFAULT_TTL_MS);
    },
  };
}

export function isNearExpiry(payload: ScopedTokenPayload, bufferMs = 60_000): boolean {
  return payload.exp - Date.now() <= bufferMs;
}
