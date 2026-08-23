// Corvo
import { SHIP_OWNER } from "@ship/datasets";
import { generateNodeIdentity } from "./NodeIdentity.js";

const IDENTITY_PATH = ["Corvo", "_Mesh", "PrimaryIdentity"];

/**
 * The iMac's own Mesh node identity needs to survive a restart — a fresh
 * keypair every boot would mean every other node treats it as a brand new,
 * unregistered node each time. Stored the same way Ship's own signing keys
 * are (owner-gated, never reachable through any App-facing role), since a
 * node's private key is exactly that class of secret.
 */
export async function loadOrGeneratePrimaryIdentity(store) {
  try {
    return await store.readAs(SHIP_OWNER, IDENTITY_PATH);
  } catch {
    const identity = generateNodeIdentity();
    await store.writeAs(SHIP_OWNER, IDENTITY_PATH, identity);
    return identity;
  }
}
