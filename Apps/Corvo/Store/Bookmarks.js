// Corvo
import { paths } from "./Paths.js";

/**
 * The bookmark list's actual content lives on Mesh, not the HDD — only a
 * tiny content-hash pointer sits in One. This is the same envelope-
 * encrypted, content-addressed path media already goes through
 * (mediaIngest), just carrying JSON instead of an image. Every save/remove
 * re-uploads the whole (small) list as a fresh blob — the previous
 * version becomes orphaned and gets reclaimed by the same manifest-based
 * GC sweep that cleans up deleted posts' media, once the manifest is
 * taught to count the *current* bookmarks hash as live too (see
 * Manifest.js) — otherwise GC would delete a user's own bookmarks out
 * from under them the moment they're no longer the freshest version, and
 * bookmarks change constantly by nature. The client-side browser-cache
 * backup mentioned alongside this is a client concern — nothing to build
 * here until there's a client.
 */
export function createBookmarksStore(store, media) {
  async function currentHash(userId) {
    try {
      return await store.read(paths.userBookmarksPointer(userId));
    } catch {
      return null;
    }
  }

  async function loadList(userId) {
    const hash = await currentHash(userId);
    if (!hash) return [];
    const result = await media.download(hash);
    // Pointer exists but this node doesn't hold the blob yet (not synced) —
    // fail soft to empty rather than throw; a real 404 on someone's own
    // bookmarks would be a worse experience than a transient empty list.
    if (!result) return [];
    return JSON.parse(result.plaintext.toString("utf8"));
  }

  async function saveList(userId, list) {
    const bytes = Buffer.from(JSON.stringify(list));
    const hash = await media.upload(bytes, { mimeType: "application/json", uploadedBy: userId });
    await store.write(paths.userBookmarksPointer(userId), hash);
    return list;
  }

  return {
    list: loadList,
    currentHash,

    async save(userId, postId) {
      const list = await loadList(userId);
      if (list.includes(postId)) return list;
      return saveList(userId, [...list, postId]);
    },

    async remove(userId, postId) {
      const list = await loadList(userId);
      return saveList(
        userId,
        list.filter((id) => id !== postId)
      );
    },

    async isSaved(userId, postId) {
      return (await loadList(userId)).includes(postId);
    },
  };
}
