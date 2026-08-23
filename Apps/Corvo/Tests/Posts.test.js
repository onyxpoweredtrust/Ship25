// Corvo
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "@ship/datasets";
import { createPostsStore } from "../Store/Posts.js";

async function withPosts(fn) {
  const dataRoot = await mkdtemp(join(tmpdir(), "corvo-posts-test-"));
  try {
    await fn(createPostsStore(createStore(dataRoot)));
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
  }
}

test("create + get round-trips a real post through One", async () => {
  await withPosts(async (posts) => {
    const post = await posts.create({ authorId: "u1", text: "hello", images: ["a.png"] });
    const found = await posts.get(post.id);
    assert.equal(found.text, "hello");
    assert.deepEqual(found.images, ["a.png"]);
  });
});

test("listFeed returns posts newest-first", async () => {
  await withPosts(async (posts) => {
    const first = await posts.create({ authorId: "u1", text: "first" });
    await new Promise((r) => setTimeout(r, 5));
    const second = await posts.create({ authorId: "u1", text: "second" });
    const feed = await posts.listFeed();
    assert.deepEqual(feed.map((p) => p.id), [second.id, first.id]);
  });
});

test("like/like toggles off, and clears any existing dislike", async () => {
  await withPosts(async (posts) => {
    const post = await posts.create({ authorId: "u1", text: "x" });
    await posts.dislike(post.id, "u2");
    assert.deepEqual(await posts.counts(post.id), { likes: 0, dislikes: 1, comments: 0, reposts: 0, quotes: 0 });

    const liked = await posts.like(post.id, "u2");
    assert.equal(liked.liked, true);
    assert.deepEqual(await posts.counts(post.id), { likes: 1, dislikes: 0, comments: 0, reposts: 0, quotes: 0 });

    const unliked = await posts.like(post.id, "u2");
    assert.equal(unliked.liked, false);
    assert.deepEqual(await posts.counts(post.id), { likes: 0, dislikes: 0, comments: 0, reposts: 0, quotes: 0 });
  });
});

test("repost is recorded per user and reflected in counts", async () => {
  await withPosts(async (posts) => {
    const post = await posts.create({ authorId: "u1", text: "x" });
    await posts.repost(post.id, "u2");
    await posts.repost(post.id, "u3");
    assert.equal((await posts.counts(post.id)).reposts, 2);
  });
});

test("delete removes the post entirely", async () => {
  await withPosts(async (posts) => {
    const post = await posts.create({ authorId: "u1", text: "x" });
    await posts.delete(post.id);
    assert.equal(await posts.get(post.id), null);
  });
});

test("a quote post carries quotedPostId, and shows up in the quoted post's listQuotes", async () => {
  await withPosts(async (posts) => {
    const original = await posts.create({ authorId: "u1", text: "original take" });
    const quote = await posts.create({ authorId: "u2", text: "hard disagree", quotedPostId: original.id });

    assert.equal(quote.quotedPostId, original.id);
    assert.deepEqual(await posts.listQuotes(original.id), [quote.id]);
    assert.equal((await posts.counts(original.id)).quotes, 1);
  });
});

test("a plain post (no quotedPostId) has an empty quotes list", async () => {
  await withPosts(async (posts) => {
    const post = await posts.create({ authorId: "u1", text: "x" });
    assert.equal(post.quotedPostId, null);
    assert.deepEqual(await posts.listQuotes(post.id), []);
  });
});

test("tags default to everyone, and a post stores its own replyGate", async () => {
  await withPosts(async (posts) => {
    const defaultGate = await posts.create({ authorId: "u1", text: "x" });
    assert.equal(defaultGate.replyGate, "everyone");

    const gated = await posts.create({ authorId: "u1", text: "y", replyGate: "friends" });
    assert.equal(gated.replyGate, "friends");
  });
});
