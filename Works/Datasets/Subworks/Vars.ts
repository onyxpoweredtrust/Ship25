// Datasets Vars
// designed and built by onyxlabs.

import { SHIP_ROOT_BLOCK } from "./Blocks/Path.js";
import { SHIP_OWNER } from "./Blocks/Access.js";
import { BlockNotFoundError, type Store } from "./Blocks/Store.js";
import type { BlockPath } from "./Blocks/Path.js";

const VARS_BLOCK = "Vars";

export interface Vars {
  list(): Promise<string[]>;
  get(name: string): Promise<string | undefined>;
  set(name: string, value: string): Promise<void>;
  remove(name: string): Promise<void>;
}

function varPath(name: string): BlockPath {
  return [SHIP_ROOT_BLOCK, VARS_BLOCK, name];
}

export function createVars(store: Store): Vars {
  return {
    async list() {
      return store.list([SHIP_ROOT_BLOCK, VARS_BLOCK]);
    },

    async get(name) {
      try {
        return (await store.readAs(SHIP_OWNER, varPath(name))) as string;
      } catch (err) {
        if (err instanceof BlockNotFoundError) return undefined;
        throw err;
      }
    },

    async set(name, value) {
      await store.writeAs(SHIP_OWNER, varPath(name), value);
    },

    async remove(name) {
      await store.removeAs(SHIP_OWNER, varPath(name));
    },
  };
}
