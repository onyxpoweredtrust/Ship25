// Security Issuer
// designed and built by onyxlabs.

import type { Store } from "@ship/datasets";
import { createJoseTokenSigner } from "./Jose.js";
import { createTokenIssuer, type TokenIssuer } from "./Tokens.js";
import { loadOrGenerateSigningKey } from "./Keyring.js";
import { createPersistedRevocationStore } from "./Revocations.js";

export async function createDefaultTokenIssuer(store: Store): Promise<TokenIssuer> {
  const key = await loadOrGenerateSigningKey(store);
  return createTokenIssuer(createJoseTokenSigner(key), createPersistedRevocationStore());
}
