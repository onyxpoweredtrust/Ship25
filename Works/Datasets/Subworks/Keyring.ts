// Datasets Keyring
// designed and built by onyxlabs.

import { randomBytes } from "node:crypto";
import { SHIP_ROOT_BLOCK } from "./Blocks/Path.js";
import { SHIP_OWNER } from "./Blocks/Access.js";
import { BlockNotFoundError, type Store } from "./Blocks/Store.js";
import type { BlockPath } from "./Blocks/Path.js";

const KEYS_BLOCK = "Keys";
const DEFAULT_KEY_BYTES = 32;

export interface Keyring {
  loadOrGenerateKey(name: string, byteLength?: number): Promise<Uint8Array>;
  rotateKey(name: string, byteLength?: number): Promise<Uint8Array>;
}

function keyPath(name: string): BlockPath {
  return [SHIP_ROOT_BLOCK, KEYS_BLOCK, name];
}

export function createKeyring(store: Store): Keyring {
  return {
    async loadOrGenerateKey(name, byteLength = DEFAULT_KEY_BYTES) {
      try {
        const stored = (await store.readAs(SHIP_OWNER, keyPath(name))) as string;
        return new Uint8Array(Buffer.from(stored, "hex"));
      } catch (err) {
        if (!(err instanceof BlockNotFoundError)) throw err;
        const key = randomBytes(byteLength);
        await store.writeAs(SHIP_OWNER, keyPath(name), key.toString("hex"));
        return new Uint8Array(key);
      }
    },

    async rotateKey(name, byteLength = DEFAULT_KEY_BYTES) {
      const key = randomBytes(byteLength);
      await store.writeAs(SHIP_OWNER, keyPath(name), key.toString("hex"));
      return new Uint8Array(key);
    },
  };
}
