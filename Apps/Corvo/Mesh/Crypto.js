// Corvo
import { createHash, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

const ALGORITHM = "aes-256-gcm";

/** The content ID — sha256 of the *plaintext*, computed before it's ever encrypted. This is what a post references, what a client verifies against on download, and what every Mesh node indexes by. */
export function hashContent(plaintext) {
  return createHash("sha256").update(plaintext).digest("hex");
}

/** A fresh, random per-blob AES-256 key — never reused across blobs, so compromising one blob's key exposes exactly that one blob. */
export function generateDataKey() {
  return randomBytes(32);
}

/**
 * Envelope encryption: the returned `wrappedKey` is what lives on the HDD
 * (via One), tied to the master key only the iMac holds. `ciphertext` is
 * what actually leaves for a Mesh node — a node holding it without the
 * wrapped key (and without the master key to unwrap it) has unusable bytes.
 */
export function wrapDataKey(masterKey, dataKey) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, masterKey, iv);
  const wrapped = Buffer.concat([cipher.update(dataKey), cipher.final()]);
  return { iv: iv.toString("hex"), wrapped: wrapped.toString("hex"), tag: cipher.getAuthTag().toString("hex") };
}

export function unwrapDataKey(masterKey, { iv, wrapped, tag }) {
  const decipher = createDecipheriv(ALGORITHM, masterKey, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(wrapped, "hex")), decipher.final()]);
}

/** What a Mesh node actually stores — ciphertext plus the bookkeeping needed to decrypt it, but never the key itself. */
export function encryptBlob(dataKey, plaintext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, dataKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { ciphertext, iv: iv.toString("hex"), tag: cipher.getAuthTag().toString("hex") };
}

export function decryptBlob(dataKey, { ciphertext, iv, tag }) {
  const decipher = createDecipheriv(ALGORITHM, dataKey, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
