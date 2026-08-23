#!/usr/bin/env node
// Corvo
/**
 * Runs a satellite Mesh node — real peer-to-peer participation, not just a
 * puller: it syncs from the primary (still the sole authority on what's
 * actually live, since only it knows what a post is), but it also runs its
 * own /mesh/* server so other nodes — the primary included, and other
 * satellites — can read blobs from it too. That's the point: every read a
 * satellite can answer is a read the primary's own HDD never has to serve.
 *
 * Env vars (all required except the ones marked default):
 *   MESH_NODE_ID, MESH_NODE_PUBLIC_KEY, MESH_NODE_PRIVATE_KEY — from RegisterNode.js's one-time printout
 *   MESH_NODE_URL — this satellite's own reachable address, e.g. https://friend-box.example.com:4200 (must match what RegisterNode.js registered for this nodeId)
 *   MESH_AUTHORITY_URL — the primary's reachable address
 *   MESH_PORT — port this satellite's own Mesh server listens on (default 4200)
 *   MESH_DATA_DIR — where this node stores its ciphertext blobs (default ./mesh-data)
 *   MESH_SYNC_INTERVAL_MS — how often to sync (default 5 minutes)
 */
import { createServer } from "node:http";
import { join } from "node:path";
import { createBlobStore } from "../BlobStore.js";
import { createGcState, syncOnce } from "../SyncClient.js";
import { createScheduler } from "../Scheduler.js";
import { createRegistryMirror } from "../RegistryMirror.js";
import { createMeshServer } from "../Server.js";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var ${name}`);
    process.exit(1);
  }
  return value;
}

const identity = {
  nodeId: requireEnv("MESH_NODE_ID"),
  publicKey: requireEnv("MESH_NODE_PUBLIC_KEY"),
  privateKey: requireEnv("MESH_NODE_PRIVATE_KEY"),
};
const authorityUrl = requireEnv("MESH_AUTHORITY_URL");
const dataDir = process.env.MESH_DATA_DIR ?? "./mesh-data";
const intervalMs = Number(process.env.MESH_SYNC_INTERVAL_MS ?? 5 * 60_000);
const port = Number(process.env.MESH_PORT ?? 4200);

const blobs = createBlobStore(join(dataDir, "blobs"));
const gcState = createGcState(join(dataDir, "gc-state.json"));
const registryMirror = createRegistryMirror();

// A satellite has no One store of its own — it verifies peer requests
// against this local, periodically-refreshed mirror of the primary's
// registry instead (see RegistryMirror.js for the staleness tradeoff).
const meshHandler = createMeshServer({ blobs, registry: registryMirror, isManifestAuthority: false });

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (await meshHandler(req, res, url)) return;
  res.writeHead(404);
  res.end("Not found");
});

const scheduler = createScheduler({
  intervalMs,
  task: async () => {
    const result = await syncOnce({ identity, blobs, authorityUrl, gcState, registryMirror });
    console.log(`[mesh sync] fetched ${result.fetched.length}, deleted ${result.deleted.length}, manifest ${result.manifestSize}, held ${result.heldSize}`);
  },
  onError: (err) => console.error("[mesh sync] failed:", err.message),
});

server.listen(port, () => {
  console.log(`Satellite Mesh node ${identity.nodeId} serving on port ${port}, syncing from ${authorityUrl} every ${intervalMs}ms`);
  scheduler.start();
});

process.on("SIGINT", () => {
  scheduler.stop();
  server.close(() => process.exit(0));
});
