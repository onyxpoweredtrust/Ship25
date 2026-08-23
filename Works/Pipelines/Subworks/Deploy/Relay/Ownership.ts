// Pipelines Ownership
// designed and built by onyxlabs.

import type { Store } from "@ship/datasets";
import type { ClaimRecord } from "../Types.js";

const RELAY_BLOCK = "_Relay";
const CLAIMS_BLOCK = "Claims";
const RELAY_ROLE = "relay-admin";

export interface ClaimResult {
  ok: boolean;
  record?: ClaimRecord;
  reason?: string;
}

export interface OwnershipStore {
  get: (name: string) => Promise<ClaimRecord | undefined>;
  claim: (name: string, identity: string, email?: string) => Promise<ClaimResult>;
  touch: (name: string) => Promise<void>;
  reclaim: (name: string) => Promise<ClaimRecord | undefined>;
  all: () => Promise<ClaimRecord[]>;
}

export function createOwnershipStore(store: Store): OwnershipStore {
  let declared = false;
  async function ensureSudoblock(): Promise<void> {
    if (declared) return;
    await store.declareSudoblock([RELAY_BLOCK, CLAIMS_BLOCK], [RELAY_ROLE]);
    declared = true;
  }

  function path(name: string) {
    return [RELAY_BLOCK, CLAIMS_BLOCK, name];
  }

  return {
    async get(name) {
      try {
        return (await store.readAs(RELAY_ROLE, path(name))) as ClaimRecord;
      } catch {
        return undefined;
      }
    },

    async claim(name, identity, email) {
      const existing = await this.get(name);
      if (existing && existing.identity !== identity) {
        return { ok: false, reason: `${name} is already claimed` };
      }
      const record: ClaimRecord = {
        name,
        identity,
        email: email ?? existing?.email,
        claimedAt: existing?.claimedAt ?? Date.now(),
        lastSeenAt: Date.now(),
      };
      await ensureSudoblock();
      await store.writeAs(RELAY_ROLE, path(name), record);
      return { ok: true, record };
    },

    async touch(name) {
      const record = await this.get(name);
      if (!record) return;
      record.lastSeenAt = Date.now();
      await ensureSudoblock();
      await store.writeAs(RELAY_ROLE, path(name), record);
    },

    async reclaim(name) {
      const record = await this.get(name);
      if (!record) return undefined;
      await store.removeAs(RELAY_ROLE, path(name));
      return record;
    },

    async all() {
      const names = await store.list([RELAY_BLOCK, CLAIMS_BLOCK]).catch(() => [] as string[]);
      const records = await Promise.all(names.map((n) => this.get(n)));
      return records.filter((r): r is ClaimRecord => r !== undefined);
    },
  };
}
