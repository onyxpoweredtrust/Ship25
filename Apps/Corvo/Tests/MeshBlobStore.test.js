// Corvo
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBlobStore } from "../Mesh/BlobStore.js";
import { hashContent } from "../Mesh/Crypto.js";

async function withBlobStore(fn) {
  const root = await mkdtemp(join(tmpdir(), "corvo-mesh-blobstore-test-"));
  try {
    await fn(createBlobStore(root), root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("put + get round-trips real ciphertext bytes", async () => {
  await withBlobStore(async (blobs) => {
    const hash = hashContent(Buffer.from("plaintext, hypothetically"));
    const ciphertext = Buffer.from("not-actually-plaintext-bytes");
    await blobs.put(hash, ciphertext);
    assert.deepEqual(await blobs.get(hash), ciphertext);
  });
});

test("get returns null (not throw) for a hash never stored", async () => {
  await withBlobStore(async (blobs) => {
    assert.equal(await blobs.get("nonexistent"), null);
  });
});

test("has reflects real presence, before and after delete", async () => {
  await withBlobStore(async (blobs) => {
    const hash = "aabbcc";
    assert.equal(await blobs.has(hash), false);
    await blobs.put(hash, Buffer.from("x"));
    assert.equal(await blobs.has(hash), true);
    await blobs.delete(hash);
    assert.equal(await blobs.has(hash), false);
  });
});

test("list returns every stored hash, across different shard prefixes", async () => {
  await withBlobStore(async (blobs) => {
    await blobs.put("aabbcc11", Buffer.from("1"));
    await blobs.put("ffeedd22", Buffer.from("2"));
    const list = await blobs.list();
    assert.deepEqual(list.sort(), ["aabbcc11", "ffeedd22"]);
  });
});

test("blobs are actually sharded on disk by hash prefix, not dumped in one flat directory", async () => {
  await withBlobStore(async (blobs, root) => {
    const hash = "ab" + "cd" + "ef123456";
    await blobs.put(hash, Buffer.from("x"));
    const { readFile } = await import("node:fs/promises");
    const raw = await readFile(join(root, "ab", "cd", hash));
    assert.deepEqual(raw, Buffer.from("x"));
  });
});

test("list on an empty store returns an empty array, not a throw", async () => {
  await withBlobStore(async (blobs) => {
    assert.deepEqual(await blobs.list(), []);
  });
});
