// Corvo
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore, createKeyring } from "@ship/datasets";
import { createBlobStore } from "../Mesh/BlobStore.js";
import { createMediaRegistry } from "../Mesh/MediaRegistry.js";
import { createMediaIngest } from "../Mesh/Ingest.js";
import { hashContent } from "../Mesh/Crypto.js";

async function withIngest(fn) {
  const dataRoot = await mkdtemp(join(tmpdir(), "corvo-mesh-ingest-test-"));
  const blobRoot = await mkdtemp(join(tmpdir(), "corvo-mesh-ingest-blobs-"));
  try {
    const store = createStore(dataRoot);
    const blobs = createBlobStore(blobRoot);
    const media = createMediaRegistry(store);
    const ingest = createMediaIngest({ blobs, media, keyring: createKeyring(store) });
    await fn({ ingest, blobs, media });
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
    await rm(blobRoot, { recursive: true, force: true });
  }
}

test("upload + download round-trips real plaintext bytes", async () => {
  await withIngest(async ({ ingest }) => {
    const plaintext = Buffer.from("a real (pretend) image's bytes");
    const hash = await ingest.upload(plaintext, { mimeType: "image/png", uploadedBy: "u1" });

    const downloaded = await ingest.download(hash);
    assert.deepEqual(downloaded.plaintext, plaintext);
    assert.equal(downloaded.mimeType, "image/png");
  });
});

test("the hash returned is the real content hash — same bytes uploaded twice hash the same", async () => {
  await withIngest(async ({ ingest }) => {
    const plaintext = Buffer.from("identical content");
    const hash = await ingest.upload(plaintext);
    assert.equal(hash, hashContent(plaintext));
  });
});

test("uploading identical content twice dedupes — one blob stored, not two", async () => {
  await withIngest(async ({ ingest, blobs }) => {
    const plaintext = Buffer.from("duplicate content");
    const first = await ingest.upload(plaintext, { uploadedBy: "u1" });
    const second = await ingest.upload(plaintext, { uploadedBy: "u2" });
    assert.equal(first, second);
    assert.equal((await blobs.list()).length, 1);
  });
});

test("the blob actually stored on disk is ciphertext, never the plaintext", async () => {
  await withIngest(async ({ ingest, blobs }) => {
    const plaintext = Buffer.from("this exact string must never appear in the blob store");
    const hash = await ingest.upload(plaintext);
    const stored = await blobs.get(hash);
    assert.equal(stored.includes(plaintext), false);
  });
});

test("download returns null for a hash that was never uploaded", async () => {
  await withIngest(async ({ ingest }) => {
    assert.equal(await ingest.download("never-uploaded-hash"), null);
  });
});

test("download returns null if the media key is registered but this node doesn't hold the blob (not yet synced)", async () => {
  await withIngest(async ({ ingest, blobs }) => {
    const hash = await ingest.upload(Buffer.from("x"));
    await blobs.delete(hash); // simulate: registered centrally, but not (yet) replicated to this node
    assert.equal(await ingest.download(hash), null);
  });
});

test("two different uploads on the same ingest use independent data keys (compromising one doesn't expose the other)", async () => {
  await withIngest(async ({ ingest, media }) => {
    const hashA = await ingest.upload(Buffer.from("content A"));
    const hashB = await ingest.upload(Buffer.from("content B"));
    const recordA = await media.get(hashA);
    const recordB = await media.get(hashB);
    assert.notEqual(recordA.wrappedKey.wrapped, recordB.wrappedKey.wrapped);
  });
});
