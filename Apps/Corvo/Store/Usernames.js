// Corvo
import { paths } from "./Paths.js";

/**
 * A username -> userId lookup Corvo maintains itself. Ship Auth owns the
 * real username field (via better-auth's own user table), but Corvo's own
 * Store layer has no direct read access into that — so this index is kept
 * self-updating instead: Auth/Session.js registers the current session's
 * username here on every authenticated request, rather than requiring an
 * explicit signup hook into Ship Auth. It's eventually-consistent (a
 * brand-new user isn't resolvable until their first authenticated request
 * after signup) but self-healing, with no cross-connector coupling.
 */
export function createUsernameIndex(store) {
  return {
    async register(username, userId) {
      if (!username) return;
      await store.write(paths.username(username), userId);
    },

    async resolve(username) {
      try {
        return await store.read(paths.username(username));
      } catch {
        return null;
      }
    },
  };
}
