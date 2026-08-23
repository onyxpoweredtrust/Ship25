// Corvo
import { test } from "node:test";
import assert from "node:assert/strict";
import { rankFeed } from "../Store/Feed.js";

const DEFAULT_PREFS = { tagWeights: {}, whitelist: [], blacklist: [], show18Plus: false };

function post(id, { tags = [], nsfw = false, createdAt = "2026-01-01T00:00:00.000Z" } = {}) {
  return { id, tags, nsfw, createdAt, authorId: "u1", text: id };
}

test("with no preferences at all, posts come back newest-first", () => {
  const posts = [post("a", { createdAt: "2026-01-01T00:00:00.000Z" }), post("b", { createdAt: "2026-01-02T00:00:00.000Z" })];
  const ranked = rankFeed(posts, DEFAULT_PREFS);
  assert.deepEqual(ranked.map((p) => p.id), ["b", "a"]);
});

test("a blacklisted tag hard-excludes the post entirely, not just downranks it", () => {
  const posts = [post("a", { tags: ["politics"] }), post("b", { tags: ["art"] })];
  const ranked = rankFeed(posts, { ...DEFAULT_PREFS, blacklist: ["politics"] });
  assert.deepEqual(ranked.map((p) => p.id), ["b"]);
});

test("an NSFW post is hidden when show18Plus is off, and shown when it's on", () => {
  const posts = [post("sfw"), post("nsfw", { nsfw: true })];
  assert.deepEqual(rankFeed(posts, DEFAULT_PREFS).map((p) => p.id), ["sfw"]);
  assert.deepEqual(
    rankFeed(posts, { ...DEFAULT_PREFS, show18Plus: true }).map((p) => p.id).sort(),
    ["nsfw", "sfw"]
  );
});

test("a whitelisted tag outranks ordinary tag-weight scores, however high those get", () => {
  const posts = [post("high-weight", { tags: ["popular"] }), post("whitelisted", { tags: ["niche"] })];
  const prefs = { ...DEFAULT_PREFS, whitelist: ["niche"], tagWeights: { popular: 500 } };
  const ranked = rankFeed(posts, prefs);
  assert.deepEqual(ranked.map((p) => p.id), ["whitelisted", "high-weight"]);
});

test("higher accumulated tag weight ranks above lower, among non-whitelisted posts", () => {
  const a = post("a", { tags: ["fursuits"] });
  const b = post("b", { tags: ["art"] });
  const ranked = rankFeed([a, b], { ...DEFAULT_PREFS, tagWeights: { fursuits: 5, art: 1 } });
  assert.deepEqual(ranked.map((p) => p.id), ["a", "b"]);
});

test("a disliked (negative-weight) tag ranks below a neutral post", () => {
  const disliked = post("disliked", { tags: ["politics"] });
  const neutral = post("neutral", { tags: ["unrelated"] });
  const ranked = rankFeed([disliked, neutral], { ...DEFAULT_PREFS, tagWeights: { politics: -3 } });
  assert.deepEqual(ranked.map((p) => p.id), ["neutral", "disliked"]);
});

test("equal score ties break by recency, newest first", () => {
  const older = post("older", { createdAt: "2026-01-01T00:00:00.000Z" });
  const newer = post("newer", { createdAt: "2026-01-02T00:00:00.000Z" });
  const ranked = rankFeed([older, newer], DEFAULT_PREFS);
  assert.deepEqual(ranked.map((p) => p.id), ["newer", "older"]);
});

test("blacklist takes priority over whitelist if a post somehow carries both (shouldn't happen given Preferences.js's mutual exclusion, but the filter must still be safe)", () => {
  const conflicted = post("conflicted", { tags: ["both-tag"] });
  const ranked = rankFeed([conflicted], { ...DEFAULT_PREFS, whitelist: ["both-tag"], blacklist: ["both-tag"] });
  assert.deepEqual(ranked, []);
});

test("a post with no tags at all is neither boosted nor excluded — just scored 0", () => {
  const untagged = post("untagged");
  const ranked = rankFeed([untagged], { ...DEFAULT_PREFS, blacklist: ["politics"], whitelist: ["art"] });
  assert.deepEqual(ranked.map((p) => p.id), ["untagged"]);
});
