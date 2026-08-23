// Corvo
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "@ship/datasets";
import { createMediaRegistry } from "../Mesh/MediaRegistry.js";
import { generateDataKey, wrapDataKey, unwrapDataKey } from "../Mesh/Crypto.js";

async function withMediaRegistry(fn) {
  const dataRoot = await mkdtemp(join(tmpdir(), "corvo-mesh-media-test-"));
  try {
    await fn(createMediaRegistry(createStore(dataRoot)));
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
  }
}

test("register + get round-trips a real wrapped key through One", async () => {
  await withMediaRegistry(async (media) => {
    const masterKey = generateDataKey();
    const dataKey = generateDataKey();
    const wrapped = wrapDataKey(masterKey, dataKey);

    await media.register("hash1", wrapped, { uploadedBy: "u1" });
    const found = await media.get("hash1");

    assert.equal(found.uploadedBy, "u1");
    assert.deepEqual(unwrapDataKey(masterKey, found.wrappedKey), dataKey);
  });
});

test("get returns null for a hash never registered", async () => {
  await withMediaRegistry(async (media) => {
    assert.equal(await media.get("never-registered"), null);
  });
});

test("list returns every hash Corvo has ever ingested, regardless of live/orphaned status", async () => {
  await withMediaRegistry(async (media) => {
    const masterKey = generateDataKey();
    await media.register("h1", wrapDataKey(masterKey, generateDataKey()));
    await media.register("h2", wrapDataKey(masterKey, generateDataKey()));
    assert.deepEqual((await media.list()).sort(), ["h1", "h2"]);
  });
});

test("delete removes the key permanently — only meant to be called after GC confirms a hash is orphaned", async () => {
  await withMediaRegistry(async (media) => {
    await media.register("h1", wrapDataKey(generateDataKey(), generateDataKey()));
    await media.delete("h1");
    assert.equal(await media.get("h1"), null);
  });
});
