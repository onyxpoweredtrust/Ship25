// Corvo
/** A whitelisted tag should reliably outrank ordinary tag-weight scores without needing to know how high those can get — a large, fixed boost rather than a multiplier keeps that true regardless of how much like/dislike history a user has. */
const WHITELIST_BOOST = 1000;

/**
 * Pure ranking — no I/O, no randomness, entirely reconstructable by hand
 * from a user's own preferences record. That's deliberate: "the algorithm"
 * here is meant to be inspectable, not a black box the user has to trust.
 *
 * Order of operations: blacklist and the 18+ toggle are hard filters (a
 * blacklisted tag or a hidden-NSFW post never appears, full stop, not just
 * downranked) — only after that does scoring (whitelist boost + accumulated
 * tag weight) decide order among what's left, with recency as the tiebreak.
 */
export function rankFeed(posts, preferences) {
  const blacklist = new Set(preferences.blacklist ?? []);
  const whitelist = new Set(preferences.whitelist ?? []);
  const tagWeights = preferences.tagWeights ?? {};
  const show18Plus = preferences.show18Plus ?? false;

  const visible = posts.filter((post) => {
    if (post.nsfw && !show18Plus) return false;
    if ((post.tags ?? []).some((tag) => blacklist.has(tag))) return false;
    return true;
  });

  const scored = visible.map((post) => {
    const tags = post.tags ?? [];
    const isWhitelisted = tags.some((tag) => whitelist.has(tag));
    const tagScore = tags.reduce((sum, tag) => sum + (tagWeights[tag] ?? 0), 0);
    return { post, score: (isWhitelisted ? WHITELIST_BOOST : 0) + tagScore };
  });

  scored.sort((a, b) => (b.score !== a.score ? b.score - a.score : b.post.createdAt.localeCompare(a.post.createdAt)));

  return scored.map((s) => s.post);
}
