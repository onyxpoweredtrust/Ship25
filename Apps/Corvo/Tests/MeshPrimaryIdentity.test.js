// Corvo
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "@ship/datasets";
import { loadOrGeneratePrimaryIdentity } from "../Mesh/PrimaryIdentity.js";

test("the same identity persists across separate calls (survives a restart)", async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), "corvo-mesh-primary-identity-test-"));
  try {
    const store = createStore(dataRoot);
    const first = await loadOrGeneratePrimaryIdentity(store);
    const second = await loadOrGeneratePrimaryIdentity(store);
    assert.equal(first.nodeId, second.nodeId);
    assert.equal(first.privateKey, second.privateKey);
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
  }
});

test("a fresh dataRoot generates a distinct identity from another fresh dataRoot", async () => {
  const rootA = await mkdtemp(join(tmpdir(), "corvo-mesh-primary-identity-a-"));
  const rootB = await mkdtemp(join(tmpdir(), "corvo-mesh-primary-identity-b-"));
  try {
    const a = await loadOrGeneratePrimaryIdentity(createStore(rootA));
    const b = await loadOrGeneratePrimaryIdentity(createStore(rootB));
    assert.notEqual(a.nodeId, b.nodeId);
  } finally {
    await rm(rootA, { recursive: true, force: true });
    await rm(rootB, { recursive: true, force: true });
  }
});
