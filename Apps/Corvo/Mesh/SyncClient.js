// Corvo
import { readFile, writeFile } from "node:fs/promises";
import { buildSignedHeaders } from "./RequestAuth.js";

/** How long a locally-held blob must be absent from the live manifest before this node actually deletes it — protects against an in-flight edit/undo race, not just a theoretical concern. */
export const DEFAULT_GC_GRACE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

async function signedFetch(identity, url, { method = "GET", body } = {}) {
  const path = new URL(url).pathname;
  const headers = buildSignedHeaders(identity, { method, path, body });
  return fetch(url, { method, headers, body });
}

export async function fetchManifest(identity, authorityUrl) {
  const res = await signedFetch(identity, `${authorityUrl}/mesh/manifest`);
  if (!res.ok) throw new Error(`manifest fetch failed: ${res.status}`);
  const { hashes } = await res.json();
  return new Set(hashes);
}

export async function fetchBlob(identity, peerUrl, hash) {
  const res = await signedFetch(identity, `${peerUrl}/mesh/blob/${encodeURIComponent(hash)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`blob fetch failed for ${hash}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function pushBlob(identity, peerUrl, hash, ciphertext) {
  const res = await signedFetch(identity, `${peerUrl}/mesh/blob/${encodeURIComponent(hash)}`, { method: "PUT", body: ciphertext });
  if (!res.ok) throw new Error(`blob push failed for ${hash}: ${res.status}`);
}

/** The primary's authoritative node directory — who else is in the mesh, their public keys, and where to reach them. */
export async function fetchNodeDirectory(identity, authorityUrl) {
  const res = await signedFetch(identity, `${authorityUrl}/mesh/nodes`);
  if (!res.ok) throw new Error(`node directory fetch failed: ${res.status}`);
  const { nodes } = await res.json();
  return nodes;
}

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Real peer-to-peer serving: tries every known candidate (order randomized,
 * so load spreads across the mesh instead of concentrating on whichever
 * peer happens to be listed first), not just "always ask the primary."
 * Matters concretely for the iMac — every read that a satellite can answer
 * instead is a read its HDD never has to serve. One unreachable or
 * blob-lacking peer doesn't fail the whole fetch; it just tries the next.
 */
export async function fetchBlobFromAny(identity, peerUrls, hash) {
  for (const peerUrl of shuffled(peerUrls)) {
    try {
      const ciphertext = await fetchBlob(identity, peerUrl, hash);
      if (ciphertext) return ciphertext;
    } catch {
      // this peer failed or is unreachable — try the next one rather than failing the whole sync
    }
  }
  return null;
}

/** Node-local GC bookkeeping — deliberately not synced or centrally stored: it's this node's own record of "when did I first notice this hash isn't live anymore," not content, not something any other node needs to see. */
export function createGcState(path) {
  async function load() {
    try {
      return JSON.parse(await readFile(path, "utf8"));
    } catch {
      return {};
    }
  }
  async function save(state) {
    await writeFile(path, JSON.stringify(state), "utf8");
  }
  return { load, save };
}

/**
 * One full sync pass: pull anything the manifest says should exist but this
 * node doesn't have, and delete anything this node has that's been absent
 * from the manifest for longer than the grace period. Pull-based rather
 * than waiting for a push, so a node that was offline when a blob first
 * appeared still catches up next time it's reachable.
 *
 * `registryMirror`, if given, gets refreshed from the primary's node
 * directory every pass, and that directory becomes the set of peers a
 * missing blob is fetched from (not just the primary) — real peer-to-peer
 * serving instead of a star topology. Omitting it keeps the old
 * primary-only behavior (used by tests, and by any node that just wants
 * the simplest possible setup).
 */
export async function syncOnce({ identity, blobs, authorityUrl, gcState, graceMs = DEFAULT_GC_GRACE_MS, now = () => Date.now(), registryMirror }) {
  const [manifest, held] = await Promise.all([fetchManifest(identity, authorityUrl), blobs.list().then((list) => new Set(list))]);

  let peerUrls = [authorityUrl];
  if (registryMirror) {
    const directory = await fetchNodeDirectory(identity, authorityUrl);
    registryMirror.refresh(directory);
    const peerAddresses = directory.filter((n) => n.nodeId !== identity.nodeId && n.url).map((n) => n.url);
    peerUrls = [authorityUrl, ...peerAddresses];
  }

  const fetched = [];
  for (const hash of manifest) {
    if (held.has(hash)) continue;
    const ciphertext = await fetchBlobFromAny(identity, peerUrls, hash);
    if (ciphertext) {
      await blobs.put(hash, ciphertext);
      fetched.push(hash);
    }
  }

  const gcTracking = await gcState.load();
  const deleted = [];
  const stillTracking = {};

  for (const hash of held) {
    if (manifest.has(hash)) continue; // still live, not a GC candidate
    const firstSeenAbsentAt = gcTracking[hash] ?? now();
    if (now() - firstSeenAbsentAt >= graceMs) {
      await blobs.delete(hash);
      deleted.push(hash);
    } else {
      stillTracking[hash] = firstSeenAbsentAt;
    }
  }

  await gcState.save(stillTracking);
  return { fetched, deleted, manifestSize: manifest.size, heldSize: held.size };
}
