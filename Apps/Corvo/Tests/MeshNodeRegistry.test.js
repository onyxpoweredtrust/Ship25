// Corvo
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "@ship/datasets";
import { createNodeRegistry } from "../Mesh/NodeRegistry.js";
import { generateNodeIdentity, signPayload } from "../Mesh/NodeIdentity.js";

async function withRegistry(fn) {
  const dataRoot = await mkdtemp(join(tmpdir(), "corvo-mesh-registry-test-"));
  try {
    await fn(createNodeRegistry(createStore(dataRoot)));
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
  }
}

test("register + get round-trips a real node through One", async () => {
  await withRegistry(async (registry) => {
    const node = generateNodeIdentity();
    await registry.register(node.nodeId, node.publicKey, { label: "friend's box" });
    const found = await registry.get(node.nodeId);
    assert.equal(found.publicKey, node.publicKey);
    assert.equal(found.label, "friend's box");
    assert.equal(found.revoked, false);
  });
});

test("get returns null for a node that was never registered — no self-service join", async () => {
  await withRegistry(async (registry) => {
    assert.equal(await registry.get("never-registered"), null);
  });
});

test("verifyRequest accepts a real signature from a registered, non-revoked node", async () => {
  await withRegistry(async (registry) => {
    const node = generateNodeIdentity();
    await registry.register(node.nodeId, node.publicKey);
    const payload = { op: "replicate", hash: "abc123" };
    const signature = signPayload(node.privateKey, payload);
    assert.equal(await registry.verifyRequest(node.nodeId, payload, signature), true);
  });
});

test("verifyRequest rejects a well-formed signature from a node that was never registered", async () => {
  await withRegistry(async (registry) => {
    const node = generateNodeIdentity();
    const signature = signPayload(node.privateKey, { op: "replicate" });
    assert.equal(await registry.verifyRequest(node.nodeId, { op: "replicate" }, signature), false);
  });
});

test("revoke cuts a node off immediately — a previously-valid signature stops verifying", async () => {
  await withRegistry(async (registry) => {
    const node = generateNodeIdentity();
    await registry.register(node.nodeId, node.publicKey);
    const payload = { op: "replicate" };
    const signature = signPayload(node.privateKey, payload);
    assert.equal(await registry.verifyRequest(node.nodeId, payload, signature), true);

    await registry.revoke(node.nodeId);
    assert.equal(await registry.verifyRequest(node.nodeId, payload, signature), false);
    assert.equal(await registry.isRevoked(node.nodeId), true);
  });
});

test("revoke is a real audit trail, not a delete — the node record still exists afterward", async () => {
  await withRegistry(async (registry) => {
    const node = generateNodeIdentity();
    await registry.register(node.nodeId, node.publicKey);
    await registry.revoke(node.nodeId);
    const found = await registry.get(node.nodeId);
    assert.ok(found);
    assert.equal(found.revoked, true);
    assert.ok(found.revokedAt);
  });
});

test("revoking a node that was never registered throws rather than silently succeeding", async () => {
  await withRegistry(async (registry) => {
    await assert.rejects(() => registry.revoke("never-registered"));
  });
});

test("list returns every registered node with its metadata", async () => {
  await withRegistry(async (registry) => {
    const a = generateNodeIdentity();
    const b = generateNodeIdentity();
    await registry.register(a.nodeId, a.publicKey, { label: "node a" });
    await registry.register(b.nodeId, b.publicKey, { label: "node b" });
    const list = await registry.list();
    assert.equal(list.length, 2);
    assert.deepEqual(list.map((n) => n.label).sort(), ["node a", "node b"]);
  });
});

test("isRevoked is true for an unregistered node too — unknown is treated as untrusted, not as allowed", async () => {
  await withRegistry(async (registry) => {
    assert.equal(await registry.isRevoked("never-registered"), true);
  });
});
