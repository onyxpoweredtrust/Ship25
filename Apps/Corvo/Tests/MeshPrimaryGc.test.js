// Corvo
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "@ship/datasets";
import { createPostsStore } from "../Store/Posts.js";
import { createBookmarksStore } from "../Store/Bookmarks.js";
import { createBlobStore } from "../Mesh/BlobStore.js";
import { createMediaRegistry } from "../Mesh/MediaRegistry.js";
import { createGcState } from "../Mesh/SyncClient.js";
import { runPrimaryGc } from "../Mesh/PrimaryGc.js";
import { wrapDataKey, generateDataKey } from "../Mesh/Crypto.js";

/** Routes bookmarks' upload/download through the SAME real MediaRegistry + BlobStore the GC sweep under test operates on — a separate fake store would make the "GC doesn't delete a live bookmarks blob" test meaningless, since GC would never see it. */
function createMediaAdapter(media, blobs) {
  let counter = 0;
  return {
    async upload(bytes) {
      const hash = `bookmarks-hash-${counter++}`;
      await blobs.put(hash, bytes);
      await media.register(hash, wrapDataKey(generateDataKey(), generateDataKey()));
      return hash;
    },
    async download(hash) {
      const bytes = await blobs.get(hash);
      return bytes ? { plaintext: bytes, mimeType: "application/json" } : null;
    },
  };
}

async function withPrimaryGc(fn) {
  const dataRoot = await mkdtemp(join(tmpdir(), "corvo-mesh-primarygc-test-"));
  const blobRoot = await mkdtemp(join(tmpdir(), "corvo-mesh-primarygc-blobs-"));
  try {
    const store = createStore(dataRoot);
    const posts = createPostsStore(store);
    const media = createMediaRegistry(store);
    const blobs = createBlobStore(blobRoot);
    const gcState = createGcState(join(blobRoot, "gc-state.json"));
    const bookmarks = createBookmarksStore(store, createMediaAdapter(media, blobs));
    await fn({ store, posts, media, blobs, gcState, bookmarks });
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
    await rm(blobRoot, { recursive: true, force: true });
  }
}

async function seedMedia(media, blobs, hash) {
  await media.register(hash, wrapDataKey(generateDataKey(), generateDataKey()));
  await blobs.put(hash, Buffer.from("ciphertext"));
}

test("a hash still referenced by a live post is never touched", async () => {
  await withPrimaryGc(async ({ posts, media, blobs, gcState }) => {
    await posts.create({ authorId: "u1", text: "x", images: ["live-hash"] });
    await seedMedia(media, blobs, "live-hash");

    const result = await runPrimaryGc({ posts, media, blobs, gcState, graceMs: 1000 });
    assert.deepEqual(result.deleted, []);
    assert.ok(await media.get("live-hash"));
    assert.equal(await blobs.has("live-hash"), true);
  });
});

test("an orphaned hash is tracked, not deleted, on its first sweep", async () => {
  await withPrimaryGc(async ({ posts, media, blobs, gcState }) => {
    await seedMedia(media, blobs, "orphan-hash");
    const result = await runPrimaryGc({ posts, media, blobs, gcState, graceMs: 1000 });
    assert.deepEqual(result.deleted, []);
    assert.equal(await blobs.has("orphan-hash"), true);
  });
});

test("an orphaned hash past the grace period is deleted from both MediaRegistry and BlobStore", async () => {
  await withPrimaryGc(async ({ posts, media, blobs, gcState }) => {
    await seedMedia(media, blobs, "orphan-hash");
    let clock = 0;
    const now = () => clock;

    await runPrimaryGc({ posts, media, blobs, gcState, graceMs: 1000, now });
    clock = 2000;
    const result = await runPrimaryGc({ posts, media, blobs, gcState, graceMs: 1000, now });

    assert.deepEqual(result.deleted, ["orphan-hash"]);
    assert.equal(await media.get("orphan-hash"), null);
    assert.equal(await blobs.has("orphan-hash"), false);
  });
});

test("deleting the referencing post is what actually starts the grace clock — this is the real end-to-end trigger", async () => {
  await withPrimaryGc(async ({ posts, media, blobs, gcState }) => {
    const post = await posts.create({ authorId: "u1", text: "x", images: ["shared-hash"] });
    await seedMedia(media, blobs, "shared-hash");

    // Still live — not even tracked yet.
    let result = await runPrimaryGc({ posts, media, blobs, gcState, graceMs: 1000 });
    assert.deepEqual(result.deleted, []);
    assert.ok(await media.get("shared-hash"));

    await posts.delete(post.id);

    let clock = 0;
    const now = () => clock;
    await runPrimaryGc({ posts, media, blobs, gcState, graceMs: 1000, now });
    clock = 2000;
    result = await runPrimaryGc({ posts, media, blobs, gcState, graceMs: 1000, now });
    assert.deepEqual(result.deleted, ["shared-hash"]);
  });
});

test("a user's current bookmarks blob is protected from GC when store/bookmarks are passed", async () => {
  await withPrimaryGc(async ({ store, posts, media, blobs, gcState, bookmarks }) => {
    await bookmarks.save("u1", "some-post-id");
    const bookmarksHash = await bookmarks.currentHash("u1");

    let clock = 0;
    const now = () => clock;
    await runPrimaryGc({ posts, media, blobs, gcState, graceMs: 1000, now, store, bookmarks });
    clock = 2000;
    const result = await runPrimaryGc({ posts, media, blobs, gcState, graceMs: 1000, now, store, bookmarks });

    assert.equal(result.deleted.includes(bookmarksHash), false);
    assert.equal(await blobs.has(bookmarksHash), true);
  });
});

test("a superseded bookmarks blob IS reclaimed by GC once past the grace period — this is what makes re-saving bookmarks not leak storage forever", async () => {
  await withPrimaryGc(async ({ store, posts, media, blobs, gcState, bookmarks }) => {
    await bookmarks.save("u1", "post-a");
    const staleHash = await bookmarks.currentHash("u1");
    await bookmarks.save("u1", "post-b"); // supersedes staleHash

    let clock = 0;
    const now = () => clock;
    await runPrimaryGc({ posts, media, blobs, gcState, graceMs: 1000, now, store, bookmarks });
    clock = 2000;
    const result = await runPrimaryGc({ posts, media, blobs, gcState, graceMs: 1000, now, store, bookmarks });

    assert.ok(result.deleted.includes(staleHash));
    assert.equal(await blobs.has(staleHash), false);
  });
});

test("without store/bookmarks passed, GC is backward compatible — falls back to post-images-only, doesn't throw", async () => {
  await withPrimaryGc(async ({ posts, media, blobs, gcState }) => {
    const result = await runPrimaryGc({ posts, media, blobs, gcState, graceMs: 1000 });
    assert.deepEqual(result.deleted, []);
  });
});
