// Corvo
import { verifyMeshRequest } from "./RequestAuth.js";
import { createNodeRateLimiter } from "./NodeRateLimiter.js";

const MAX_BLOB_BYTES = 200 * 1024 * 1024; // 200MB per blob — generous for media, still a real cap rather than none

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BLOB_BYTES) throw Object.assign(new Error("blob too large"), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(payload) });
  res.end(payload);
}

/**
 * Node-to-node HTTP surface — every request here is another Mesh node, not
 * a browser, so every route (not just writes) requires a valid signed
 * request; there's no anonymous read path the way Corvo's own /api/*
 * requires a session, not a signature. Deliberately does NOT sit behind
 * Ship Shield: Shield's bot-scoring is calibrated to catch anonymous
 * clients pretending to be human, which would misfire hard on a
 * legitimate, correctly-signed Mesh node (a different HTTP client library
 * shaped like exactly the scraper UAs Shield blocks) and has no recovery
 * path for a machine client (Shield's PoW challenge expects a browser to
 * solve it). Signature verification against the node registry is the
 * right-shaped gate for this channel instead — see index.js for where
 * /mesh/* is routed around shield.guard().
 */
export function createMeshServer({ blobs, registry, isManifestAuthority = false, getManifest, rateLimiter = createNodeRateLimiter() }) {
  return async function handleMesh(req, res, url) {
    if (!url.pathname.startsWith("/mesh/")) return false;

    let body;
    try {
      body = req.method === "GET" ? undefined : await readBody(req);
    } catch (err) {
      sendJson(res, err.status ?? 500, { error: err.message });
      return true;
    }

    let nodeId;
    try {
      nodeId = await verifyMeshRequest(registry, req, body);
    } catch (err) {
      sendJson(res, err.status ?? 401, { error: err.message });
      return true;
    }

    // Rate-limited per already-authenticated node identity — a registered
    // node gone rogue (compromised, buggy, or just misconfigured) still
    // can't hammer replication endpoints unbounded.
    if (!rateLimiter.consume(nodeId)) {
      res.writeHead(429, { "Retry-After": "5" });
      res.end();
      return true;
    }

    if (req.method === "GET" && url.pathname === "/mesh/held") {
      sendJson(res, 200, { hashes: await blobs.list() });
      return true;
    }

    if (req.method === "GET" && url.pathname === "/mesh/manifest") {
      if (!isManifestAuthority) return sendJson(res, 404, { error: "this node is not the manifest authority" }), true;
      sendJson(res, 200, { hashes: [...(await getManifest())] });
      return true;
    }

    // The node directory — who else is in the mesh, their public keys, and
    // where to reach them — only the primary's registry (One-backed) is
    // authoritative for this; a satellite's own registry is just a local
    // mirror of it, so only isManifestAuthority nodes serve this route.
    if (req.method === "GET" && url.pathname === "/mesh/nodes") {
      if (!isManifestAuthority) return sendJson(res, 404, { error: "this node is not the directory authority" }), true;
      const nodes = await registry.list();
      const active = nodes.filter((n) => !n.revoked).map((n) => ({ nodeId: n.nodeId, publicKey: n.publicKey, url: n.url ?? null, label: n.label ?? null }));
      sendJson(res, 200, { nodes: active });
      return true;
    }

    const blobMatch = url.pathname.match(/^\/mesh\/blob\/([^/]+)$/);
    if (blobMatch) {
      const hash = decodeURIComponent(blobMatch[1]);

      if (req.method === "GET") {
        const ciphertext = await blobs.get(hash);
        if (!ciphertext) return sendJson(res, 404, { error: "not held by this node" }), true;
        res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": ciphertext.length });
        res.end(ciphertext);
        return true;
      }

      if (req.method === "PUT") {
        await blobs.put(hash, body);
        sendJson(res, 200, { ok: true, receivedFrom: nodeId });
        return true;
      }
    }

    sendJson(res, 404, { error: "not found" });
    return true;
  };
}
