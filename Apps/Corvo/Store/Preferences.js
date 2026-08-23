// Corvo
import { paths } from "./Paths.js";

const DEFAULT_PREFERENCES = { tagWeights: {}, whitelist: [], blacklist: [], show18Plus: false };

/** Small, deliberately gentle nudge per like/dislike — many small signals accumulate into real preference, one post never dominates it. */
const FEEDBACK_STEP = 1;

/**
 * Every knob the feed algorithm runs on, per user — and every one of them
 * is a real, readable, directly-editable value, not a hidden model weight.
 * `tagWeights` is the only "learned" part, and it's learned by simple,
 * inspectable addition (see recordFeedback), not by anything a user
 * couldn't independently reconstruct by hand from their own like history.
 */
export function createPreferencesStore(store) {
  async function get(userId) {
    try {
      const stored = await store.read(paths.userPreferences(userId));
      return { ...DEFAULT_PREFERENCES, ...stored };
    } catch {
      return { ...DEFAULT_PREFERENCES };
    }
  }

  async function save(userId, preferences) {
    await store.write(paths.userPreferences(userId), preferences);
    return preferences;
  }

  return {
    get,

    async setShow18Plus(userId, enabled) {
      const prefs = await get(userId);
      return save(userId, { ...prefs, show18Plus: Boolean(enabled) });
    },

    /** Whitelisting a tag removes it from any blacklist entry — a tag can't meaningfully be both hard-boosted and hard-excluded at once. */
    async addToWhitelist(userId, tag) {
      const prefs = await get(userId);
      return save(userId, {
        ...prefs,
        whitelist: [...new Set([...prefs.whitelist, tag])],
        blacklist: prefs.blacklist.filter((t) => t !== tag),
      });
    },

    async removeFromWhitelist(userId, tag) {
      const prefs = await get(userId);
      return save(userId, { ...prefs, whitelist: prefs.whitelist.filter((t) => t !== tag) });
    },

    async addToBlacklist(userId, tag) {
      const prefs = await get(userId);
      return save(userId, {
        ...prefs,
        blacklist: [...new Set([...prefs.blacklist, tag])],
        whitelist: prefs.whitelist.filter((t) => t !== tag),
      });
    },

    async removeFromBlacklist(userId, tag) {
      const prefs = await get(userId);
      return save(userId, { ...prefs, blacklist: prefs.blacklist.filter((t) => t !== tag) });
    },

    /** Lets a user directly zero out or hand-tune a tag's weight — the whole point of this being plain numbers, not a black box, is that they don't have to reverse-engineer it through more clicking. */
    async setTagWeight(userId, tag, weight) {
      const prefs = await get(userId);
      return save(userId, { ...prefs, tagWeights: { ...prefs.tagWeights, [tag]: weight } });
    },

    /**
     * A like/dislike on a post nudges the weight of every tag on that post —
     * this is the entire "learning" mechanism, and it's just addition. Only
     * applied when a like/dislike is newly set, not when toggled back off
     * (un-liking is "never mind," not a signal worth actively reversing).
     */
    async recordFeedback(userId, tags, direction) {
      if (direction !== "like" && direction !== "dislike") return get(userId);
      const delta = direction === "like" ? FEEDBACK_STEP : -FEEDBACK_STEP;
      const prefs = await get(userId);
      const tagWeights = { ...prefs.tagWeights };
      for (const tag of tags) tagWeights[tag] = (tagWeights[tag] ?? 0) + delta;
      return save(userId, { ...prefs, tagWeights });
    },
  };
}
