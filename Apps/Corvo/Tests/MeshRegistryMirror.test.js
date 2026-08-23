// Corvo
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRegistryMirror } from "../Mesh/RegistryMirror.js";
import { generateNodeIdentity, signPayload } from "../Mesh/NodeIdentity.js";

test("a node present in the last refresh verifies a real signature", async () => {
  const node = generateNodeIdentity();
  const mirror = createRegistryMirror();
  mirror.refresh([{ nodeId: node.nodeId, publicKey: node.publicKey, url: "https://peer.example" }]);

  const payload = { op: "test" };
  const signature = signPayload(node.privateKey, payload);
  assert.equal(await mirror.verifyRequest(node.nodeId, payload, signature), true);
});

test("a node absent from the mirror is treated as unverifiable, not just unknown", async () => {
  const node = generateNodeIdentity();
  const mirror = createRegistryMirror();
  mirror.refresh([]); // never told about this node

  const signature = signPayload(node.privateKey, { op: "test" });
  assert.equal(await mirror.verifyRequest(node.nodeId, { op: "test" }, signature), false);
  assert.equal(await mirror.isRevoked(node.nodeId), true);
});

test("refreshing replaces the mirror entirely — a node dropped from the new directory stops verifying", async () => {
  const node = generateNodeIdentity();
  const mirror = createRegistryMirror();
  mirror.refresh([{ nodeId: node.nodeId, publicKey: node.publicKey, url: null }]);

  const payload = { op: "test" };
  const signature = signPayload(node.privateKey, payload);
  assert.equal(await mirror.verifyRequest(node.nodeId, payload, signature), true);

  mirror.refresh([]); // the primary's next directory no longer lists this node (revoked)
  assert.equal(await mirror.verifyRequest(node.nodeId, payload, signature), false);
});

test("list reflects the current directory", async () => {
  const a = generateNodeIdentity();
  const b = generateNodeIdentity();
  const mirror = createRegistryMirror();
  mirror.refresh([
    { nodeId: a.nodeId, publicKey: a.publicKey, url: "https://a.example" },
    { nodeId: b.nodeId, publicKey: b.publicKey, url: "https://b.example" },
  ]);
  const list = await mirror.list();
  assert.equal(list.length, 2);
  assert.deepEqual(list.map((n) => n.nodeId).sort(), [a.nodeId, b.nodeId].sort());
});

test("get returns null for a node not in the mirror", async () => {
  const mirror = createRegistryMirror();
  mirror.refresh([]);
  assert.equal(await mirror.get("unknown"), null);
});
