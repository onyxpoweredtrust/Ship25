// Corvo
import { createDefaultTokenIssuer, authorize, ForbiddenError, UnauthorizedError } from "@ship/security";

const MOD_TOKEN_SCOPE = "sdk";
const MOD_TOKEN_TTL_MS = 15 * 60_000;

/**
 * Wraps @ship/security's scoped-token issuer for Corvo's own moderator
 * surface. Session cookies (Ship Auth) stay the primary way a human proves
 * who they are; this is the second, bearer-token path for scripted/service
 * mod tooling that shouldn't have to carry a browser session around — the
 * same shape Zero's own gateway uses internally (see Works/Cores/Subworks/Endpoints/Gateway.ts).
 */
export async function createSecurityGate(store) {
  const issuer = await createDefaultTokenIssuer(store);

  return {
    issuer,

    /** Mints a short-lived bearer token a confirmed mod can use against mod-only routes without a session cookie. */
    async issueModToken(userId) {
      return issuer.issue(MOD_TOKEN_SCOPE, userId, MOD_TOKEN_TTL_MS, "mod");
    },

    /** Returns true if the request carries a valid, non-revoked bearer token scoped to Corvo's "mod" data role. */
    async hasModToken(req) {
      try {
        const payload = await authorize(issuer, req, [MOD_TOKEN_SCOPE]);
        return payload.dataRole === "mod";
      } catch (err) {
        if (err instanceof UnauthorizedError || err instanceof ForbiddenError) return false;
        throw err;
      }
    },
  };
}
