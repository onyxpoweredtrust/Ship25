// Corvo
import { createHash } from "node:crypto";
import { signPayload } from "./NodeIdentity.js";

/** Requests older than this are rejected outright — a basic anti-replay window (a captured, valid signed request stops being usable after this long). Nonce-tracking would be stronger but adds real state every node has to keep; a timestamp window is the pragmatic v1 defense. */
export const MAX_REQUEST_AGE_MS = 60_000;

function sha256Hex(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function canonicalPayload({ nodeId, timestamp, method, path, bodyHash }) {
  return { nodeId, timestamp, method, path, bodyHash };
}

/** Client side — every outgoing node-to-node request gets these headers. */
export function buildSignedHeaders(identity, { method, path, body }) {
  const timestamp = Date.now();
  const bodyHash = sha256Hex(body ?? Buffer.alloc(0));
  const payload = canonicalPayload({ nodeId: identity.nodeId, timestamp, method, path, bodyHash });
  const signature = signPayload(identity.privateKey, payload);
  return {
    "x-node-id": identity.nodeId,
    "x-node-timestamp": String(timestamp),
    "x-node-signature": signature,
  };
}

/**
 * Server side — verifies a real incoming request against the node registry.
 * Returns the authenticated nodeId on success; throws (with a `.status`) on
 * any failure, so callers can respond consistently without duplicating the
 * branching (missing headers, stale timestamp, unknown/revoked node, bad
 * signature all fail the exact same way to the caller: rejected).
 */
export async function verifyMeshRequest(registry, req, body) {
  const nodeId = req.headers["x-node-id"];
  const timestamp = Number(req.headers["x-node-timestamp"]);
  const signature = req.headers["x-node-signature"];

  if (!nodeId || !signature || !Number.isFinite(timestamp)) {
    throw Object.assign(new Error("missing node auth headers"), { status: 401 });
  }
  if (Math.abs(Date.now() - timestamp) > MAX_REQUEST_AGE_MS) {
    throw Object.assign(new Error("stale request timestamp"), { status: 401 });
  }

  const url = new URL(req.url, "http://mesh");
  const payload = canonicalPayload({ nodeId, timestamp, method: req.method, path: url.pathname, bodyHash: sha256Hex(body ?? Buffer.alloc(0)) });

  const ok = await registry.verifyRequest(nodeId, payload, signature);
  if (!ok) throw Object.assign(new Error("invalid node signature"), { status: 403 });

  return nodeId;
}
