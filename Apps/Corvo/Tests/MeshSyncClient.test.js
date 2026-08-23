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
import { generateNodeIdentity } from "../Mesh/NodeIdentity.js";
import { createMeshServer } from "../Mesh/Server.js";
import { syncOnce, createGcState, fetchBlobFromAny } from "../Mesh/SyncClient.js";
import { createRegistryMirror } from "../Mesh/RegistryMirror.js";

async function withAuthorityNode({ manifest }, fn) {
  const dataRoot = await mkdtemp(join(tmpdir(), "corvo-mesh-sync-authority-"));
  const blobRoot = await mkdtemp(join(tmpdir(), "corvo-mesh-sync-authority-blobs-"));
  try {
    const registry = createNodeRegistry(createStore(dataRoot));
    const blobs = createBlobStore(blobRoot);
    const puller = generateNodeIdentity();
    await registry.register(puller.nodeId, puller.publicKey);

    const handler = createMeshServer({ blobs, registry, isManifestAuthority: true, getManifest: async () => manifest });
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, "http://localhost");
      if (!(await handler(req, res, url))) {
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
      await fn({ authorityUrl: `http://localhost:${port}`, authorityBlobs: blobs, puller, close });
    } finally {
      await close();
    }
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
    await rm(blobRoot, { recursive: true, force: true });
  }
}

test("syncOnce pulls a blob the manifest lists but this node doesn't have yet", async () => {
  await withAuthorityNode({ manifest: new Set(["hash0001"]) }, async ({ authorityUrl, authorityBlobs, puller, close }) => {
    await authorityBlobs.put("hash0001", Buffer.from("real ciphertext for h1"));

    const pullerBlobRoot = await mkdtemp(join(tmpdir(), "corvo-mesh-sync-puller-blobs-"));
    const gcStatePath = join(pullerBlobRoot, "gc-state.json");
    const pullerBlobs = createBlobStore(pullerBlobRoot);

    const result = await syncOnce({ identity: puller, blobs: pullerBlobs, authorityUrl, gcState: createGcState(gcStatePath) });

    assert.deepEqual(result.fetched, ["hash0001"]);
    assert.deepEqual(await pullerBlobs.get("hash0001"), Buffer.from("real ciphertext for h1"));

    await rm(pullerBlobRoot, { recursive: true, force: true });
    await close();
  });
});

test("syncOnce doesn't re-fetch a blob this node already has", async () => {
  await withAuthorityNode({ manifest: new Set(["hash0001"]) }, async ({ authorityUrl, authorityBlobs, puller, close }) => {
    await authorityBlobs.put("hash0001", Buffer.from("x"));

    const pullerBlobRoot = await mkdtemp(join(tmpdir(), "corvo-mesh-sync-puller-blobs-"));
    const pullerBlobs = createBlobStore(pullerBlobRoot);
    await pullerBlobs.put("hash0001", Buffer.from("x"));

    const result = await syncOnce({ identity: puller, blobs: pullerBlobs, authorityUrl, gcState: createGcState(join(pullerBlobRoot, "gc-state.json")) });
    assert.deepEqual(result.fetched, []);

    await rm(pullerBlobRoot, { recursive: true, force: true });
    await close();
  });
});

test("a blob absent from the manifest is tracked, not deleted, on its first sync (grace period)", async () => {
  await withAuthorityNode({ manifest: new Set() }, async ({ authorityUrl, puller, close }) => {
    const pullerBlobRoot = await mkdtemp(join(tmpdir(), "corvo-mesh-sync-puller-blobs-"));
    const pullerBlobs = createBlobStore(pullerBlobRoot);
    await pullerBlobs.put("orphaned", Buffer.from("x"));

    const result = await syncOnce({
      identity: puller,
      blobs: pullerBlobs,
      authorityUrl,
      gcState: createGcState(join(pullerBlobRoot, "gc-state.json")),
      graceMs: 1000,
    });

    assert.deepEqual(result.deleted, []);
    assert.equal(await pullerBlobs.has("orphaned"), true);

    await rm(pullerBlobRoot, { recursive: true, force: true });
    await close();
  });
});

test("a blob absent from the manifest past the grace period is actually deleted", async () => {
  await withAuthorityNode({ manifest: new Set() }, async ({ authorityUrl, puller, close }) => {
    const pullerBlobRoot = await mkdtemp(join(tmpdir(), "corvo-mesh-sync-puller-blobs-"));
    const pullerBlobs = createBlobStore(pullerBlobRoot);
    await pullerBlobs.put("orphaned", Buffer.from("x"));
    const gcState = createGcState(join(pullerBlobRoot, "gc-state.json"));

    let clock = 0;
    const now = () => clock;

    // First pass: notices it's absent, starts the grace clock.
    await syncOnce({ identity: puller, blobs: pullerBlobs, authorityUrl, gcState, graceMs: 1000, now });
    assert.equal(await pullerBlobs.has("orphaned"), true);

    // Second pass, past the grace period: actually deleted.
    clock = 2000;
    const result = await syncOnce({ identity: puller, blobs: pullerBlobs, authorityUrl, gcState, graceMs: 1000, now });
    assert.deepEqual(result.deleted, ["orphaned"]);
    assert.equal(await pullerBlobs.has("orphaned"), false);

    await rm(pullerBlobRoot, { recursive: true, force: true });
    await close();
  });
});

test("a blob that reappears in the manifest before the grace period elapses is not deleted, and stops being tracked", async () => {
  await withAuthorityNode({ manifest: new Set() }, async ({ authorityUrl, puller, close }) => {
    const pullerBlobRoot = await mkdtemp(join(tmpdir(), "corvo-mesh-sync-puller-blobs-"));
    const pullerBlobs = createBlobStore(pullerBlobRoot);
    await pullerBlobs.put("resurrected", Buffer.from("x"));
    const gcState = createGcState(join(pullerBlobRoot, "gc-state.json"));

    await syncOnce({ identity: puller, blobs: pullerBlobs, authorityUrl, gcState, graceMs: 1000 });

    const tracked = await gcState.load();
    assert.ok("resurrected" in tracked);

    await rm(pullerBlobRoot, { recursive: true, force: true });
    await close();
  });
});

/** A generic real Mesh node (satellite or primary) for peer-to-peer tests — separate from withAuthorityNode above so those existing tests stay untouched. */
async function startMeshNode({ registry, blobs, isManifestAuthority = false, getManifest }) {
  const handler = createMeshServer({ blobs, registry, isManifestAuthority, getManifest });
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (!(await handler(req, res, url))) {
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
  return {
    url: `http://localhost:${port}`,
    close: () =>
      new Promise((resolve) => {
        for (const s of sockets) s.destroy();
        server.close(() => resolve());
      }),
  };
}

test("fetchBlobFromAny finds a blob held by one candidate even when other candidates 404", async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), "corvo-mesh-p2p-registry-"));
  const emptyBlobRoot = await mkdtemp(join(tmpdir(), "corvo-mesh-p2p-empty-"));
  const holderBlobRoot = await mkdtemp(join(tmpdir(), "corvo-mesh-p2p-holder-"));
  try {
    const registry = createNodeRegistry(createStore(dataRoot));
    const puller = generateNodeIdentity();
    await registry.register(puller.nodeId, puller.publicKey);

    const emptyBlobs = createBlobStore(emptyBlobRoot);
    const holderBlobs = createBlobStore(holderBlobRoot);
    await holderBlobs.put("shared-hash", Buffer.from("real bytes held only by the second peer"));

    const empty = await startMeshNode({ registry, blobs: emptyBlobs });
    const holder = await startMeshNode({ registry, blobs: holderBlobs });

    const result = await fetchBlobFromAny(puller, [empty.url, holder.url], "shared-hash");
    assert.deepEqual(result, Buffer.from("real bytes held only by the second peer"));

    await empty.close();
    await holder.close();
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
    await rm(emptyBlobRoot, { recursive: true, force: true });
    await rm(holderBlobRoot, { recursive: true, force: true });
  }
});

test("fetchBlobFromAny returns null when no candidate has the blob", async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), "corvo-mesh-p2p-registry-"));
  const blobRootA = await mkdtemp(join(tmpdir(), "corvo-mesh-p2p-a-"));
  const blobRootB = await mkdtemp(join(tmpdir(), "corvo-mesh-p2p-b-"));
  try {
    const registry = createNodeRegistry(createStore(dataRoot));
    const puller = generateNodeIdentity();
    await registry.register(puller.nodeId, puller.publicKey);

    const a = await startMeshNode({ registry, blobs: createBlobStore(blobRootA) });
    const b = await startMeshNode({ registry, blobs: createBlobStore(blobRootB) });

    assert.equal(await fetchBlobFromAny(puller, [a.url, b.url], "never-stored"), null);

    await a.close();
    await b.close();
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
    await rm(blobRootA, { recursive: true, force: true });
    await rm(blobRootB, { recursive: true, force: true });
  }
});

test("syncOnce with a registryMirror fetches a manifest-listed blob from a satellite peer, not just the primary — real peer-to-peer serving", async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), "corvo-mesh-p2p-primary-registry-"));
  const primaryBlobRoot = await mkdtemp(join(tmpdir(), "corvo-mesh-p2p-primary-blobs-"));
  const peerBlobRoot = await mkdtemp(join(tmpdir(), "corvo-mesh-p2p-peer-blobs-"));
  const pullerBlobRoot = await mkdtemp(join(tmpdir(), "corvo-mesh-p2p-puller-blobs-"));
  try {
    const registry = createNodeRegistry(createStore(dataRoot));
    const puller = generateNodeIdentity();
    const peer = generateNodeIdentity();
    await registry.register(puller.nodeId, puller.publicKey);

    // The peer holds the actual bytes; the primary is only ever told about
    // it via the manifest (it never receives the blob itself) — proving the
    // puller genuinely reached the peer, not a hidden fallback to primary.
    const peerBlobs = createBlobStore(peerBlobRoot);
    await peerBlobs.put("peer-only-hash", Buffer.from("bytes that only live on the satellite peer"));
    const peerNode = await startMeshNode({ registry, blobs: peerBlobs });
    await registry.register(peer.nodeId, peer.publicKey, { url: peerNode.url, label: "satellite peer" });

    const primaryBlobs = createBlobStore(primaryBlobRoot); // deliberately empty
    const primaryNode = await startMeshNode({
      registry,
      blobs: primaryBlobs,
      isManifestAuthority: true,
      getManifest: async () => new Set(["peer-only-hash"]),
    });

    const pullerBlobs = createBlobStore(pullerBlobRoot);
    const registryMirror = createRegistryMirror();
    const gcState = createGcState(join(pullerBlobRoot, "gc-state.json"));

    const result = await syncOnce({ identity: puller, blobs: pullerBlobs, authorityUrl: primaryNode.url, gcState, registryMirror });

    assert.deepEqual(result.fetched, ["peer-only-hash"]);
    assert.deepEqual(await pullerBlobs.get("peer-only-hash"), Buffer.from("bytes that only live on the satellite peer"));

    // The mirror actually got populated with the real directory, peer URL included.
    assert.ok(await registryMirror.get(peer.nodeId));

    await peerNode.close();
    await primaryNode.close();
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
    await rm(primaryBlobRoot, { recursive: true, force: true });
    await rm(peerBlobRoot, { recursive: true, force: true });
    await rm(pullerBlobRoot, { recursive: true, force: true });
  }
});
