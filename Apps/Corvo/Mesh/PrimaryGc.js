// Corvo
import { buildLiveManifest } from "./Manifest.js";

/**
 * The primary's own GC sweep — same grace-period mark-and-sweep idea as a
 * satellite's syncOnce, but the primary has two things to clean up per
 * orphaned hash, not one: its own local blob copy (it's a Mesh node too)
 * AND the MediaRegistry entry (the wrapped key) that no other node ever
 * touches, since only the primary holds key material at all.
 */
export async function runPrimaryGc({ posts, media, blobs, gcState, graceMs, now = () => Date.now(), store, bookmarks }) {
  const manifest = await buildLiveManifest(posts, { store, bookmarks });
  const registered = await media.list();

  const tracking = await gcState.load();
  const deleted = [];
  const stillTracking = {};

  for (const hash of registered) {
    if (manifest.has(hash)) continue; // still live, not a GC candidate
    const firstSeenAbsentAt = tracking[hash] ?? now();
    if (now() - firstSeenAbsentAt >= graceMs) {
      await media.delete(hash);
      await blobs.delete(hash);
      deleted.push(hash);
    } else {
      stillTracking[hash] = firstSeenAbsentAt;
    }
  }

  await gcState.save(stillTracking);
  return { deleted, manifestSize: manifest.size, registeredSize: registered.length };
}
