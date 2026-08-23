// Security Keyring
// designed and built by onyxlabs.

import { createKeyring, type Store } from "@ship/datasets";

const SIGNING_KEY_NAME = "zero-signing-key";

export async function loadOrGenerateSigningKey(store: Store): Promise<Uint8Array> {
  return createKeyring(store).loadOrGenerateKey(SIGNING_KEY_NAME);
}

export async function rotateSigningKey(store: Store): Promise<Uint8Array> {
  return createKeyring(store).rotateKey(SIGNING_KEY_NAME);
}
