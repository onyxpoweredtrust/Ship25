// Corvo
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore, createKeyring } from "@ship/datasets";
import { createDirectMessagesStore } from "../Store/DirectMessages.js";

async function withDms(fn) {
  const dataRoot = await mkdtemp(join(tmpdir(), "corvo-dms-test-"));
  try {
    const store = createStore(dataRoot);
    await fn(createDirectMessagesStore(store, createKeyring(store)), dataRoot);
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
  }
}

test("threadIdFor is order-independent — same two users always resolve to the same thread", async () => {
  await withDms(async (dms) => {
    assert.equal(dms.threadIdFor("u1", "u2"), dms.threadIdFor("u2", "u1"));
  });
});

test("send + list round-trips real plaintext through real encrypt/decrypt", async () => {
  await withDms(async (dms) => {
    const threadId = await dms.ensureThread("u1", "u2");
    await dms.send(threadId, "u1", "hey there");
    await new Promise((r) => setTimeout(r, 5));
    await dms.send(threadId, "u2", "hi!");

    const messages = await dms.list(threadId);
    assert.deepEqual(messages.map((m) => ({ from: m.fromUserId, text: m.text })), [
      { from: "u1", text: "hey there" },
      { from: "u2", text: "hi!" },
    ]);
  });
});

test("messages are actually encrypted at rest — the raw stored record never contains the plaintext", async () => {
  await withDms(async (dms, dataRoot) => {
    const threadId = await dms.ensureThread("u1", "u2");
    await dms.send(threadId, "u1", "super secret message");

    const store = createStore(dataRoot);
    const ids = await store.list(["Corvo", "DMs", threadId, "Messages"]);
    const raw = await store.read(["Corvo", "DMs", threadId, "Messages", ids[0]]);
    assert.equal(raw.ciphertext.includes("super secret message"), false);
    assert.ok(raw.iv && raw.tag);
  });
});

test("ensureThread is idempotent — calling it twice for the same pair doesn't reset thread state", async () => {
  await withDms(async (dms) => {
    const first = await dms.ensureThread("u1", "u2");
    await dms.send(first, "u1", "hello");
    const second = await dms.ensureThread("u1", "u2");
    assert.equal(first, second);
    assert.equal((await dms.list(second)).length, 1);
  });
});
