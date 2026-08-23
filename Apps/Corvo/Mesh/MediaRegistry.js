// Corvo
const APP_BLOCK = "Corvo";

/** Per-hash wrapped-key bookkeeping — the only place the (wrapped, still-locked) key material for a piece of media lives, and it lives on the HDD via One, never on a Mesh node. */
const paths = {
  mediaIndex: () => [APP_BLOCK, "_Mesh", "Media"],
  media: (hash) => [APP_BLOCK, "_Mesh", "Media", hash],
};

export function createMediaRegistry(store) {
  return {
    async register(hash, wrappedKey, meta = {}) {
      await store.write(paths.media(hash), { wrappedKey, ...meta, registeredAt: new Date().toISOString() });
    },

    async get(hash) {
      try {
        return await store.read(paths.media(hash));
      } catch {
        return null;
      }
    },

    /** Every hash Corvo has ever ingested — the superset the live manifest is filtered down from. */
    async list() {
      return store.list(paths.mediaIndex());
    },

    /** Called only once GC has confirmed a hash is genuinely orphaned (absent from the live manifest past the grace period) — removes the key, permanently. */
    async delete(hash) {
      await store.remove(paths.media(hash)).catch(() => {});
    },
  };
}
