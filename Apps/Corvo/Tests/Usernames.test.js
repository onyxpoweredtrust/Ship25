// Corvo
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "@ship/datasets";
import { createUsernameIndex } from "../Store/Usernames.js";

async function withUsernames(fn) {
  const dataRoot = await mkdtemp(join(tmpdir(), "corvo-usernames-test-"));
  try {
    await fn(createUsernameIndex(createStore(dataRoot)));
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
  }
}

test("register + resolve round-trips a real username to a userId", async () => {
  await withUsernames(async (usernames) => {
    await usernames.register("eggman95", "u1");
    assert.equal(await usernames.resolve("eggman95"), "u1");
  });
});

test("resolve is case-insensitive — @Eggman95 finds the same user as @eggman95", async () => {
  await withUsernames(async (usernames) => {
    await usernames.register("eggman95", "u1");
    assert.equal(await usernames.resolve("Eggman95"), "u1");
    assert.equal(await usernames.resolve("EGGMAN95"), "u1");
  });
});

test("resolve returns null for a username never registered", async () => {
  await withUsernames(async (usernames) => {
    assert.equal(await usernames.resolve("nobody"), null);
  });
});

test("re-registering the same username updates the mapping (self-healing on repeated session refresh)", async () => {
  await withUsernames(async (usernames) => {
    await usernames.register("eggman95", "u1");
    await usernames.register("eggman95", "u1"); // idempotent re-registration, same as every authenticated request would do
    assert.equal(await usernames.resolve("eggman95"), "u1");
  });
});

test("register with no username is a safe no-op", async () => {
  await withUsernames(async (usernames) => {
    await usernames.register(undefined, "u1");
    // nothing to assert against directly — just confirming it doesn't throw
  });
});
