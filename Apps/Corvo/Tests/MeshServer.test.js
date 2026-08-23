// Corvo
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "@ship/datasets";
import { createBlobStore } from "../Mesh/BlobStore.js";
import { createNodeRegistry } from "../Mesh/NodeRegistry.js";
import { generateNodeIdentity, signPayload } from "../Mesh/NodeIdentity.js";
import { createMeshServer } from "../Mesh/Server.js";
import { buildSignedHeaders } from "../Mesh/RequestAuth.js";
import { createNodeRateLimiter } from "../Mesh/NodeRateLimiter.js";

async function withMeshServer({ isManifestAuthority = false, manifest = new Set(), rateLimiter } = {}, fn) {
  const dataRoot = await mkdtemp(join(tmpdir(), "corvo-mesh-server-test-"));
  const blobRoot = await mkdtemp(join(tmpdir(), "corvo-mesh-server-blobs-"));
  try {
    const registry = createNodeRegistry(createStore(dataRoot));
    const blobs = createBlobStore(blobRoot);
    const peer = generateNodeIdentity();
    await registry.register(peer.nodeId, peer.publicKey);

    const handler = createMeshServer({ blobs, registry, isManifestAuthority, getManifest: async () => manifest, ...(rateLimiter ? { rateLimiter } : {}) });
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, "http://localhost");
      const handled = await handler(req, res, url);
      if (!handled) {
        res.writeHead(404);
        res.end();
      }
    });

    const sockets = new Set();
    server.on("connection", (s) => {
      sockets.add(s);
      s.on("close", () => sockets.delete(s));
    });

    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    let closed = false;
    const close = () =>
      closed
        ? Promise.resolve()
        : ((closed = true),
          new Promise((resolve) => {
            for (const s of sockets) s.destroy();
            server.close(() => resolve());
          }));

    try {
      await fn({ baseUrl: `http://localhost:${port}`, identity: peer, blobs, registry, close });
    } finally {
      await close();
    }
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
    await rm(blobRoot, { recursive: true, force: true });
  }
}

test("PUT then GET a blob round-trips real ciphertext bytes over real HTTP, signed", async () => {
  await withMeshServer({}, async ({ baseUrl, identity }) => {
    const ciphertext = Buffer.from("real ciphertext bytes");
    const putHeaders = buildSignedHeaders(identity, { method: "PUT", path: "/mesh/blob/abc123", body: ciphertext });
    const putRes = await fetch(`${baseUrl}/mesh/blob/abc123`, { method: "PUT", headers: putHeaders, body: ciphertext });
    assert.equal(putRes.status, 200);

    const getHeaders = buildSignedHeaders(identity, { method: "GET", path: "/mesh/blob/abc123" });
    const getRes = await fetch(`${baseUrl}/mesh/blob/abc123`, { headers: getHeaders });
    assert.equal(getRes.status, 200);
    assert.deepEqual(Buffer.from(await getRes.arrayBuffer()), ciphertext);
  });
});

test("GET for a hash never pushed returns 404, not a 500 or empty 200", async () => {
  await withMeshServer({}, async ({ baseUrl, identity }) => {
    const headers = buildSignedHeaders(identity, { method: "GET", path: "/mesh/blob/never-existed" });
    const res = await fetch(`${baseUrl}/mesh/blob/never-existed`, { headers });
    assert.equal(res.status, 404);
  });
});

test("an unsigned request is rejected before it ever reaches the blob store", async () => {
  await withMeshServer({}, async ({ baseUrl }) => {
    const res = await fetch(`${baseUrl}/mesh/blob/abc123`);
    assert.equal(res.status, 401);
  });
});

test("a request signed by an unregistered node is rejected", async () => {
  await withMeshServer({}, async ({ baseUrl }) => {
    const impostor = generateNodeIdentity();
    const headers = buildSignedHeaders(impostor, { method: "GET", path: "/mesh/held" });
    const res = await fetch(`${baseUrl}/mesh/held`, { headers });
    assert.equal(res.status, 403);
  });
});

test("/mesh/held lists exactly what this node has stored", async () => {
  await withMeshServer({}, async ({ baseUrl, identity, blobs }) => {
    await blobs.put("hash1", Buffer.from("a"));
    await blobs.put("hash2", Buffer.from("b"));
    const headers = buildSignedHeaders(identity, { method: "GET", path: "/mesh/held" });
    const res = await fetch(`${baseUrl}/mesh/held`, { headers });
    const { hashes } = await res.json();
    assert.deepEqual(hashes.sort(), ["hash1", "hash2"]);
  });
});

test("/mesh/manifest 404s on a non-authority node — it has no manifest to serve", async () => {
  await withMeshServer({ isManifestAuthority: false }, async ({ baseUrl, identity }) => {
    const headers = buildSignedHeaders(identity, { method: "GET", path: "/mesh/manifest" });
    const res = await fetch(`${baseUrl}/mesh/manifest`, { headers });
    assert.equal(res.status, 404);
  });
});

test("/mesh/manifest serves the live hash set on the authority node", async () => {
  await withMeshServer({ isManifestAuthority: true, manifest: new Set(["h1", "h2"]) }, async ({ baseUrl, identity }) => {
    const headers = buildSignedHeaders(identity, { method: "GET", path: "/mesh/manifest" });
    const res = await fetch(`${baseUrl}/mesh/manifest`, { headers });
    const { hashes } = await res.json();
    assert.deepEqual(hashes.sort(), ["h1", "h2"]);
  });
});

test("an authenticated-but-over-limit node gets 429, independent of Shield entirely — Mesh rate-limits its own node identities", async () => {
  const rateLimiter = createNodeRateLimiter({ capacity: 1, refillPerSecond: 0 });
  await withMeshServer({ rateLimiter }, async ({ baseUrl, identity }) => {
    const headers1 = buildSignedHeaders(identity, { method: "GET", path: "/mesh/held" });
    const first = await fetch(`${baseUrl}/mesh/held`, { headers: headers1 });
    assert.equal(first.status, 200);

    const headers2 = buildSignedHeaders(identity, { method: "GET", path: "/mesh/held" });
    const second = await fetch(`${baseUrl}/mesh/held`, { headers: headers2 });
    assert.equal(second.status, 429);
  });
});

test("/mesh/nodes 404s on a non-authority node — same reasoning as /mesh/manifest", async () => {
  await withMeshServer({ isManifestAuthority: false }, async ({ baseUrl, identity }) => {
    const headers = buildSignedHeaders(identity, { method: "GET", path: "/mesh/nodes" });
    const res = await fetch(`${baseUrl}/mesh/nodes`, { headers });
    assert.equal(res.status, 404);
  });
});

test("/mesh/nodes serves the active node directory with public keys and URLs, on the authority node", async () => {
  await withMeshServer({ isManifestAuthority: true }, async ({ baseUrl, identity, registry }) => {
    const other = generateNodeIdentity();
    await registry.register(other.nodeId, other.publicKey, { url: "https://peer.example", label: "friend's box" });

    const headers = buildSignedHeaders(identity, { method: "GET", path: "/mesh/nodes" });
    const res = await fetch(`${baseUrl}/mesh/nodes`, { headers });
    const { nodes } = await res.json();

    const found = nodes.find((n) => n.nodeId === other.nodeId);
    assert.ok(found);
    assert.equal(found.publicKey, other.publicKey);
    assert.equal(found.url, "https://peer.example");
    assert.equal(found.label, "friend's box");
  });
});

test("/mesh/nodes excludes revoked nodes from the directory", async () => {
  await withMeshServer({ isManifestAuthority: true }, async ({ baseUrl, identity, registry }) => {
    const other = generateNodeIdentity();
    await registry.register(other.nodeId, other.publicKey, { url: "https://peer.example" });
    await registry.revoke(other.nodeId);

    const headers = buildSignedHeaders(identity, { method: "GET", path: "/mesh/nodes" });
    const res = await fetch(`${baseUrl}/mesh/nodes`, { headers });
    const { nodes } = await res.json();
    assert.equal(nodes.some((n) => n.nodeId === other.nodeId), false);
  });
});
