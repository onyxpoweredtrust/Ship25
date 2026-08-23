// Corvo
import { randomUUID, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { paths } from "./Paths.js";

const ALGORITHM = "aes-256-gcm";

/**
 * At-rest encryption only — not end-to-end. Each thread gets its own
 * AES-256-GCM key via One's Keyring (`_Ship/Keys/dm-thread-<id>`, same
 * reserved-subtree convention as every other Ship secret); the server
 * holds that key, so this protects the data at rest (a stolen disk, a
 * dump of One's Dataset files) but not from the server process itself.
 * Real end-to-end encryption needs client-held keys and a key-exchange
 * design — meaningless before there's a real client to hold them, so
 * that's deferred, not forgotten.
 *
 * This module doesn't check that the caller is actually a thread
 * participant — same trust boundary as every other Store module here,
 * enforced by the API layer's session check, not per-call inside Store.
 */
export function createDirectMessagesStore(store, keyring) {
  function threadIdFor(userIdA, userIdB) {
    return [userIdA, userIdB].sort().join("--");
  }

  async function keyFor(threadId) {
    return Buffer.from(await keyring.loadOrGenerateKey(`dm-thread-${threadId}`));
  }

  function encrypt(key, plaintext) {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return { iv: iv.toString("hex"), ciphertext: ciphertext.toString("hex"), tag: cipher.getAuthTag().toString("hex") };
  }

  function decrypt(key, { iv, ciphertext, tag }) {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, "hex"));
    decipher.setAuthTag(Buffer.from(tag, "hex"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "hex")), decipher.final()]).toString("utf8");
  }

  return {
    threadIdFor,

    async ensureThread(userIdA, userIdB) {
      const id = threadIdFor(userIdA, userIdB);
      if (!(await store.exists(paths.dmThreadMeta(id)))) {
        await store.write(paths.dmThreadMeta(id), { participants: [userIdA, userIdB].sort(), createdAt: new Date().toISOString() });
      }
      return id;
    },

    async getThreadMeta(threadId) {
      try {
        return await store.read(paths.dmThreadMeta(threadId));
      } catch {
        return null;
      }
    },

    async send(threadId, fromUserId, text) {
      const key = await keyFor(threadId);
      const id = randomUUID();
      const { iv, ciphertext, tag } = encrypt(key, text);
      const message = { id, fromUserId, iv, ciphertext, tag, createdAt: new Date().toISOString() };
      await store.write(paths.dmMessage(threadId, id), message);
      return { id, fromUserId, text, createdAt: message.createdAt };
    },

    async list(threadId) {
      const key = await keyFor(threadId);
      const ids = await store.list(paths.dmMessagesIndex(threadId));
      const messages = await Promise.all(
        ids.map(async (id) => {
          const stored = await store.read(paths.dmMessage(threadId, id)).catch(() => null);
          if (!stored) return null;
          return { id: stored.id, fromUserId: stored.fromUserId, text: decrypt(key, stored), createdAt: stored.createdAt };
        })
      );
      return messages.filter(Boolean).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
  };
}
