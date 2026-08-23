// Corvo
import { hashContent, generateDataKey, wrapDataKey, unwrapDataKey, encryptBlob, decryptBlob } from "./Crypto.js";

const MASTER_KEY_NAME = "corvo-mesh-master-key";

/**
 * The only place plaintext media ever exists outside a request in flight —
 * hash it, generate a one-off key, encrypt, push ciphertext to the local
 * (primary) node's BlobStore, and store the wrapped key + a little metadata
 * on the HDD via MediaRegistry. The plaintext itself is never written to
 * disk anywhere in this path.
 */
export function createMediaIngest({ blobs, media, keyring }) {
  async function masterKey() {
    return Buffer.from(await keyring.loadOrGenerateKey(MASTER_KEY_NAME));
  }

  return {
    async upload(plaintext, { mimeType, uploadedBy } = {}) {
      const hash = hashContent(plaintext);

      // Same content, same hash — already ingested, no need to re-encrypt
      // and re-store it under a fresh key (real dedup, not just a cache hit).
      const existing = await media.get(hash);
      if (existing) return hash;

      const dataKey = generateDataKey();
      const { ciphertext, iv, tag } = encryptBlob(dataKey, plaintext);
      await blobs.put(hash, ciphertext);

      const wrappedKey = wrapDataKey(await masterKey(), dataKey);
      await media.register(hash, wrappedKey, { mimeType: mimeType ?? "application/octet-stream", uploadedBy, byteLength: plaintext.length, blobIv: iv, blobTag: tag });

      return hash;
    },

    async download(hash) {
      const record = await media.get(hash);
      if (!record) return null;

      const ciphertext = await blobs.get(hash);
      if (!ciphertext) return null; // key exists but this node doesn't hold the blob (yet) — a real Mesh fetch-from-peer path is future work

      const dataKey = unwrapDataKey(await masterKey(), record.wrappedKey);
      const plaintext = decryptBlob(dataKey, { ciphertext, iv: record.blobIv, tag: record.blobTag });

      return { plaintext, mimeType: record.mimeType };
    },
  };
}
