// Connectors OneAdapter
// designed and built by onyxlabs.

import { BlockNotFoundError, type Store, type Role, type BlockPath } from "@ship/datasets";
import type { ConnectorStorageAdapter } from "./Adapter.js";

const CONNECTORS_BLOCK = "Connectors";

export function createOneConnectorAdapter(
  store: Store,
  appBlock: string,
  role: Role
): ConnectorStorageAdapter {
  let declared = false;

  function path(connectorId: string, key: string): BlockPath {
    return [appBlock, CONNECTORS_BLOCK, connectorId, key];
  }

  async function ensureSudoblock(): Promise<void> {
    if (declared) return;
    await store.declareSudoblock([appBlock, CONNECTORS_BLOCK], typeof role === "string" ? [role] : []);
    declared = true;
  }

  return {
    async get(connectorId, key) {
      try {
        return await store.readAs(role, path(connectorId, key));
      } catch (err) {
        if (err instanceof BlockNotFoundError) return undefined;
        throw err;
      }
    },

    async set(connectorId, key, value) {
      await ensureSudoblock();
      await store.writeAs(role, path(connectorId, key), value);
    },

    async remove(connectorId, key) {
      await store.removeAs(role, path(connectorId, key));
    },
  };
}
