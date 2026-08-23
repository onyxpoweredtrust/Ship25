// Security Jose
// designed and built by onyxlabs.

import { jwtVerify, SignJWT } from "./Vendor/Jose/index.js";
import type { ScopedTokenPayload, TokenSigner } from "./Tokens.js";

export function createJoseTokenSigner(secret: Uint8Array): TokenSigner {
  return {
    async sign(payload: ScopedTokenPayload) {
      return new SignJWT({ scope: payload.scope, moduleId: payload.moduleId, dataRole: payload.dataRole })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt(Math.floor(payload.iat / 1000))
        .setExpirationTime(Math.floor(payload.exp / 1000))
        .setIssuer("zero")
        .sign(secret);
    },
    async verify(token: string) {
      const { payload } = await jwtVerify(token, secret, { issuer: "zero" });
      return {
        scope: payload.scope as ScopedTokenPayload["scope"],
        moduleId: payload.moduleId as string | undefined,
        dataRole: payload.dataRole as string | undefined,
        iat: (payload.iat ?? 0) * 1000,
        exp: (payload.exp ?? 0) * 1000,
      };
    },
  };
}
