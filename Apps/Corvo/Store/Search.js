// Corvo
import { APP_BLOCK } from "./Paths.js";

/**
 * Linear scan over posts/usernames — genuinely fine at current scale, and
 * the honest scaling caveat already noted for listFeed applies here too:
 * this is the thing to replace with a real index once post/user volume
 * outgrows a full scan per query, not before.
 */
export function createSearchStore({ posts, store }) {
  return {
    async posts(query, { limit = 20 } = {}) {
      const q = query.toLowerCase().trim();
      if (!q) return [];
      const all = await posts.listFeed({ limit: Number.POSITIVE_INFINITY });
      return all.filter((p) => p.text.toLowerCase().includes(q) || (p.tags ?? []).some((tag) => tag.includes(q))).slice(0, limit);
    },

    async users(query, { limit = 20 } = {}) {
      const q = query.toLowerCase().trim();
      if (!q) return [];
      const usernames = await store.list([APP_BLOCK, "_Usernames"]);
      const matches = usernames.filter((username) => username.includes(q)).slice(0, limit);
      const userIds = await Promise.all(matches.map((username) => store.read([APP_BLOCK, "_Usernames", username])));
      return matches.map((username, i) => ({ username, userId: userIds[i] }));
    },
  };
}
