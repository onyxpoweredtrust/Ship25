// Corvo
import { generateKeyPairSync, sign, verify, createPublicKey, createPrivateKey, randomUUID } from "node:crypto";

/**
 * One Ed25519 keypair per Mesh node — public-key over a shared secret
 * specifically because it supports real per-node revocation: pulling one
 * node's public key out of the registry cuts it off instantly, with no
 * shared-secret rotation touching every other node in the mesh.
 */
export function generateNodeIdentity() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    nodeId: randomUUID(),
    publicKey: publicKey.export({ type: "spki", format: "pem" }),
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }),
  };
}

/** Signs a request payload (any JSON-serializable body) so a receiving node can verify it really came from the claimed node identity. */
export function signPayload(privateKeyPem, payload) {
  const key = createPrivateKey(privateKeyPem);
  const message = Buffer.from(typeof payload === "string" ? payload : JSON.stringify(payload));
  return sign(null, message, key).toString("hex");
}

export function verifySignature(publicKeyPem, payload, signatureHex) {
  try {
    const key = createPublicKey(publicKeyPem);
    const message = Buffer.from(typeof payload === "string" ? payload : JSON.stringify(payload));
    return verify(null, message, key, Buffer.from(signatureHex, "hex"));
  } catch {
    return false;
  }
}
