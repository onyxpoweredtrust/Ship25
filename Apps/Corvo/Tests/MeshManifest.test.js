// Corvo
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "@ship/datasets";
import { createPostsStore } from "../Store/Posts.js";
import { createBookmarksStore } from "../Store/Bookmarks.js";
import { buildLiveManifest } from "../Mesh/Manifest.js";

async function withPosts(fn) {
  const dataRoot = await mkdtemp(join(tmpdir(), "corvo-mesh-manifest-test-"));
  try {
    await fn(createPostsStore(createStore(dataRoot)));
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
  }
}

function createFakeMedia() {
  const blobs = new Map();
  let counter = 0;
  return {
    async upload(bytes) {
      const hash = `fake-hash-${counter++}`;
      blobs.set(hash, bytes);
      return hash;
    },
    async download(hash) {
      const bytes = blobs.get(hash);
      return bytes ? { plaintext: bytes, mimeType: "application/json" } : null;
    },
  };
}

async function withPostsAndBookmarks(fn) {
  const dataRoot = await mkdtemp(join(tmpdir(), "corvo-mesh-manifest-bookmarks-test-"));
  try {
    const store = createStore(dataRoot);
    const posts = createPostsStore(store);
    const bookmarks = createBookmarksStore(store, createFakeMedia());
    await fn({ store, posts, bookmarks });
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
  }
}

test("the manifest includes every image hash referenced by a live post", async () => {
  await withPosts(async (posts) => {
    await posts.create({ authorId: "u1", text: "x", images: ["h1", "h2"] });
    await posts.create({ authorId: "u2", text: "y", images: ["h3"] });
    const manifest = await buildLiveManifest(posts);
    assert.deepEqual([...manifest].sort(), ["h1", "h2", "h3"]);
  });
});

test("deleting a post removes its images from the manifest — this is exactly what drives GC", async () => {
  await withPosts(async (posts) => {
    const post = await posts.create({ authorId: "u1", text: "x", images: ["h1"] });
    await posts.create({ authorId: "u2", text: "y", images: ["h2"] });
    await posts.delete(post.id);
    assert.deepEqual([...(await buildLiveManifest(posts))], ["h2"]);
  });
});

test("the same hash reused across two posts appears once, not twice", async () => {
  await withPosts(async (posts) => {
    await posts.create({ authorId: "u1", text: "x", images: ["shared-hash"] });
    await posts.create({ authorId: "u2", text: "y", images: ["shared-hash"] });
    const manifest = await buildLiveManifest(posts);
    assert.equal(manifest.size, 1);
  });
});

test("a post with no images contributes nothing, and an empty feed yields an empty manifest", async () => {
  await withPosts(async (posts) => {
    await posts.create({ authorId: "u1", text: "text only" });
    assert.equal((await buildLiveManifest(posts)).size, 0);
  });
});

test("without store/bookmarks given, the manifest is post-images-only (backward compatible)", async () => {
  await withPosts(async (posts) => {
    await posts.create({ authorId: "u1", text: "x", images: ["h1"] });
    const manifest = await buildLiveManifest(posts);
    assert.deepEqual([...manifest], ["h1"]);
  });
});

test("a user's current bookmarks hash counts as live when store/bookmarks are given", async () => {
  await withPostsAndBookmarks(async ({ store, posts, bookmarks }) => {
    await bookmarks.save("u1", "some-post-id");
    const bookmarksHash = await bookmarks.currentHash("u1");

    const manifest = await buildLiveManifest(posts, { store, bookmarks });
    assert.ok(manifest.has(bookmarksHash));
  });
});

test("a superseded (old) bookmarks hash is NOT counted live — GC should be free to reclaim it", async () => {
  await withPostsAndBookmarks(async ({ store, posts, bookmarks }) => {
    await bookmarks.save("u1", "post-a");
    const staleHash = await bookmarks.currentHash("u1");
    await bookmarks.save("u1", "post-b"); // re-uploads, new hash supersedes the old one

    const manifest = await buildLiveManifest(posts, { store, bookmarks });
    assert.equal(manifest.has(staleHash), false);
  });
});

test("bookmarks hashes from multiple users are all counted live", async () => {
  await withPostsAndBookmarks(async ({ store, posts, bookmarks }) => {
    await bookmarks.save("u1", "post-a");
    await bookmarks.save("u2", "post-b");
    const hash1 = await bookmarks.currentHash("u1");
    const hash2 = await bookmarks.currentHash("u2");

    const manifest = await buildLiveManifest(posts, { store, bookmarks });
    assert.ok(manifest.has(hash1));
    assert.ok(manifest.has(hash2));
  });
});
