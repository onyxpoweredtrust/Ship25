// Corvo
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "@ship/datasets";
import { createPreferencesStore } from "../Store/Preferences.js";

async function withPreferences(fn) {
  const dataRoot = await mkdtemp(join(tmpdir(), "corvo-preferences-test-"));
  try {
    await fn(createPreferencesStore(createStore(dataRoot)));
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
  }
}

test("a user with no saved preferences gets real, usable defaults, not a throw", async () => {
  await withPreferences(async (prefs) => {
    const p = await prefs.get("u1");
    assert.deepEqual(p, { tagWeights: {}, whitelist: [], blacklist: [], show18Plus: false });
  });
});

test("setShow18Plus persists and round-trips", async () => {
  await withPreferences(async (prefs) => {
    await prefs.setShow18Plus("u1", true);
    assert.equal((await prefs.get("u1")).show18Plus, true);
  });
});

test("whitelisting a tag adds it, and removes it from the blacklist if it was there", async () => {
  await withPreferences(async (prefs) => {
    await prefs.addToBlacklist("u1", "spoilers");
    await prefs.addToWhitelist("u1", "spoilers");
    const p = await prefs.get("u1");
    assert.deepEqual(p.whitelist, ["spoilers"]);
    assert.deepEqual(p.blacklist, []);
  });
});

test("blacklisting a tag adds it, and removes it from the whitelist if it was there", async () => {
  await withPreferences(async (prefs) => {
    await prefs.addToWhitelist("u1", "art");
    await prefs.addToBlacklist("u1", "art");
    const p = await prefs.get("u1");
    assert.deepEqual(p.blacklist, ["art"]);
    assert.deepEqual(p.whitelist, []);
  });
});

test("removeFromWhitelist / removeFromBlacklist actually remove, and are no-ops if the tag wasn't there", async () => {
  await withPreferences(async (prefs) => {
    await prefs.addToWhitelist("u1", "art");
    await prefs.removeFromWhitelist("u1", "art");
    await prefs.removeFromBlacklist("u1", "never-there");
    const p = await prefs.get("u1");
    assert.deepEqual(p.whitelist, []);
    assert.deepEqual(p.blacklist, []);
  });
});

test("setTagWeight lets a user hand-set an exact value, not just accumulate via feedback", async () => {
  await withPreferences(async (prefs) => {
    await prefs.setTagWeight("u1", "fursuits", 42);
    assert.equal((await prefs.get("u1")).tagWeights.fursuits, 42);
  });
});

test("recordFeedback('like') nudges every tag on the post upward", async () => {
  await withPreferences(async (prefs) => {
    await prefs.recordFeedback("u1", ["art", "fursuits"], "like");
    const p = await prefs.get("u1");
    assert.equal(p.tagWeights.art, 1);
    assert.equal(p.tagWeights.fursuits, 1);
  });
});

test("recordFeedback('dislike') nudges tags downward, and accumulates across multiple calls", async () => {
  await withPreferences(async (prefs) => {
    await prefs.recordFeedback("u1", ["politics"], "dislike");
    await prefs.recordFeedback("u1", ["politics"], "dislike");
    assert.equal((await prefs.get("u1")).tagWeights.politics, -2);
  });
});

test("recordFeedback with an unrecognized direction is a safe no-op, not a throw", async () => {
  await withPreferences(async (prefs) => {
    const before = await prefs.get("u1");
    const after = await prefs.recordFeedback("u1", ["art"], "neutral");
    assert.deepEqual(after, before);
  });
});

test("preferences are isolated per user", async () => {
  await withPreferences(async (prefs) => {
    await prefs.addToBlacklist("u1", "spoilers");
    assert.deepEqual((await prefs.get("u2")).blacklist, []);
  });
});
