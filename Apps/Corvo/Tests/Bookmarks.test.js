// Corvo
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createStore } from "@ship/datasets";
import { createBookmarksStore } from "../Store/Bookmarks.js";

/**
 * A minimal fake standing in for Mesh's real mediaIngest — Bookmarks.js only
 * ever calls `upload`/`download` on whatever's handed to it (duck-typed),
 * so its own tests don't need to depend on Mesh's actual (and, in the
 * public Ship25 checkout, hidden) implementation to prove the contract.
 */
function createFakeMedia() {
  const blobs = new Map();
  return {
    async upload(bytes) {
      const hash = createHash("sha256").update(bytes).digest("hex");
      blobs.set(hash, bytes);
      return hash;
    },
    async download(hash) {
      const bytes = blobs.get(hash);
      return bytes ? { plaintext: bytes, mimeType: "application/json" } : null;
    },
    _blobCount: () => blobs.size,
  };
}

async function withBookmarks(fn) {
  const dataRoot = await mkdtemp(join(tmpdir(), "corvo-bookmarks-test-"));
  try {
    const media = createFakeMedia();
    await fn(createBookmarksStore(createStore(dataRoot), media), media);
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
  }
}

test("a user with no bookmarks yet gets an empty list, not a throw", async () => {
  await withBookmarks(async (bookmarks) => {
    assert.deepEqual(await bookmarks.list("u1"), []);
  });
});

test("save + list round-trips through a real Mesh-shaped upload/download", async () => {
  await withBookmarks(async (bookmarks) => {
    await bookmarks.save("u1", "post-a");
    await bookmarks.save("u1", "post-b");
    assert.deepEqual(await bookmarks.list("u1"), ["post-a", "post-b"]);
  });
});

test("saving the same post twice doesn't duplicate it", async () => {
  await withBookmarks(async (bookmarks) => {
    await bookmarks.save("u1", "post-a");
    await bookmarks.save("u1", "post-a");
    assert.deepEqual(await bookmarks.list("u1"), ["post-a"]);
  });
});

test("remove takes a post back out of the list", async () => {
  await withBookmarks(async (bookmarks) => {
    await bookmarks.save("u1", "post-a");
    await bookmarks.save("u1", "post-b");
    await bookmarks.remove("u1", "post-a");
    assert.deepEqual(await bookmarks.list("u1"), ["post-b"]);
  });
});

test("isSaved reflects real membership", async () => {
  await withBookmarks(async (bookmarks) => {
    await bookmarks.save("u1", "post-a");
    assert.equal(await bookmarks.isSaved("u1", "post-a"), true);
    assert.equal(await bookmarks.isSaved("u1", "post-b"), false);
  });
});

test("bookmarks are isolated per user", async () => {
  await withBookmarks(async (bookmarks) => {
    await bookmarks.save("u1", "post-a");
    assert.deepEqual(await bookmarks.list("u2"), []);
  });
});

test("each save re-uploads the whole list as a fresh content-addressed blob — the pointer always points at the latest", async () => {
  await withBookmarks(async (bookmarks, media) => {
    await bookmarks.save("u1", "post-a");
    const firstHash = await bookmarks.currentHash("u1");
    await bookmarks.save("u1", "post-b");
    const secondHash = await bookmarks.currentHash("u1");

    assert.notEqual(firstHash, secondHash);
    assert.equal(media._blobCount(), 2); // both versions exist until GC reclaims the orphaned one
  });
});

test("currentHash is null until the first save", async () => {
  await withBookmarks(async (bookmarks) => {
    assert.equal(await bookmarks.currentHash("u1"), null);
  });
});
