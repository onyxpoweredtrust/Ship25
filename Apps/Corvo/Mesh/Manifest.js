// Corvo
import { APP_BLOCK } from "../Store/Paths.js";

/**
 * The authoritative "what's actually still referenced" set — computed by
 * walking live posts fresh each time, not incrementally tracked. Mesh nodes
 * never see a post; only the iMac (the only thing that knows what a post
 * is) can produce this, which is exactly why Mesh itself stays a dumb blob
 * store instead of needing to understand Corvo's data model. (This file
 * is the deliberate exception — it's Corvo-specific glue, not part of
 * Mesh's generic, extractable core.)
 *
 * A full walk over a small community's post volume is cheap and, more
 * importantly, self-healing — an incrementally-tracked refcount can drift
 * out of sync with reality if a write is ever lost or a bug double-counts;
 * recomputing from source can't drift, it just recomputes.
 *
 * `store` + `bookmarks`, if given, also count every user's *current*
 * bookmarks-list hash as live — bookmarks live on Mesh too (see
 * Bookmarks.js), and without this, GC would delete a user's own bookmark
 * list the moment a newer version supersedes the old one, which happens
 * on every single save/unsave by design.
 */
export async function buildLiveManifest(posts, { store, bookmarks } = {}) {
  const feed = await posts.listFeed({ limit: Number.POSITIVE_INFINITY });
  const live = new Set();
  for (const post of feed) {
    for (const hash of post.images ?? []) live.add(hash);
  }

  if (store && bookmarks) {
    const userIds = await store.list([APP_BLOCK, "Users"]);
    for (const userId of userIds) {
      const hash = await bookmarks.currentHash(userId);
      if (hash) live.add(hash);
    }
  }

  return live;
}
