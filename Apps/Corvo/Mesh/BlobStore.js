// Corvo
import { mkdir, readFile, writeFile, rm, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * A node's own local ciphertext storage — sharded by hash prefix (the same
 * trick git's object store uses) so one directory never ends up with
 * hundreds of thousands of entries choking an HDD's filesystem. Deliberately
 * dumb: it stores bytes keyed by a hash it never interprets. No idea what a
 * post is, no idea what a user is — that separation is what keeps this
 * extractable into its own repo later without a rewrite.
 */
/** SHA-256 hex is always 64 chars, but a too-short hash silently collapses the shard path (e.g. `"h1".slice(2,4)` is `""`), producing a shallower path that `list()`'s fixed two-level walk then miscounts. Fail loudly instead of silently mis-storing. */
const MIN_HASH_LENGTH = 4;

export function createBlobStore(root) {
  function shardPath(hash) {
    if (typeof hash !== "string" || hash.length < MIN_HASH_LENGTH) {
      throw new TypeError(`hash must be a string of at least ${MIN_HASH_LENGTH} characters, got ${JSON.stringify(hash)}`);
    }
    return join(root, hash.slice(0, 2), hash.slice(2, 4), hash);
  }

  return {
    async put(hash, ciphertext) {
      const path = shardPath(hash);
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, ciphertext);
    },

    async get(hash) {
      try {
        return await readFile(shardPath(hash));
      } catch {
        return null;
      }
    },

    async has(hash) {
      try {
        await stat(shardPath(hash));
        return true;
      } catch {
        return false;
      }
    },

    async delete(hash) {
      await rm(shardPath(hash), { force: true });
    },

    /** Every hash this node currently holds — walks the two shard levels rather than assuming any particular prefix set exists. */
    async list() {
      const hashes = [];
      let level1;
      try {
        level1 = await readdir(root);
      } catch {
        return hashes;
      }
      for (const a of level1) {
        let level2;
        try {
          level2 = await readdir(join(root, a));
        } catch {
          continue;
        }
        for (const b of level2) {
          let entries;
          try {
            entries = await readdir(join(root, a, b));
          } catch {
            continue;
          }
          hashes.push(...entries);
        }
      }
      return hashes;
    },
  };
}
