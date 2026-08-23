// Pipelines AdminAuth
// designed and built by onyxlabs.

import { SignJWT, jwtVerify } from "../../Vendor/Jose/index.js";
import { createKeyring, type Store } from "@ship/datasets";

const RELAY_ADMIN_KEY_NAME = "relay-admin-key";

export async function loadOrGenerateRelayAdminKey(store: Store): Promise<Uint8Array> {
  return createKeyring(store).loadOrGenerateKey(RELAY_ADMIN_KEY_NAME);
}

const DEFAULT_TTL_MS = 15 * 60_000;

export interface RelayAdminToken {
  sub: "relay-admin";
  iat: number;
  exp: number;
}

export async function issueRelayAdminToken(key: Uint8Array, ttlMs = DEFAULT_TTL_MS): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sub: "relay-admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + Math.floor(ttlMs / 1000))
    .setIssuer("ship-relay")
    .sign(key);
}

export async function verifyRelayAdminToken(key: Uint8Array, token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, key, { issuer: "ship-relay" });
    return payload.sub === "relay-admin";
  } catch {
    return false;
  }
}
