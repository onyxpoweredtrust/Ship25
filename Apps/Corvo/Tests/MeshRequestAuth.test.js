// Corvo
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "@ship/datasets";
import { createNodeRegistry } from "../Mesh/NodeRegistry.js";
import { generateNodeIdentity } from "../Mesh/NodeIdentity.js";
import { buildSignedHeaders, verifyMeshRequest, MAX_REQUEST_AGE_MS } from "../Mesh/RequestAuth.js";

function fakeReq(method, path, headers) {
  return { method, url: path, headers };
}

async function withRegisteredNode(fn) {
  const dataRoot = await mkdtemp(join(tmpdir(), "corvo-mesh-requestauth-test-"));
  try {
    const registry = createNodeRegistry(createStore(dataRoot));
    const identity = generateNodeIdentity();
    await registry.register(identity.nodeId, identity.publicKey);
    await fn(registry, identity);
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
  }
}

test("a real signed request from a registered node verifies and returns its nodeId", async () => {
  await withRegisteredNode(async (registry, identity) => {
    const body = Buffer.from("hello");
    const headers = buildSignedHeaders(identity, { method: "POST", path: "/mesh/blob/abc123", body });
    const nodeId = await verifyMeshRequest(registry, fakeReq("POST", "/mesh/blob/abc123", headers), body);
    assert.equal(nodeId, identity.nodeId);
  });
});

test("a GET request (no body) verifies with an empty-body hash", async () => {
  await withRegisteredNode(async (registry, identity) => {
    const headers = buildSignedHeaders(identity, { method: "GET", path: "/mesh/held" });
    const nodeId = await verifyMeshRequest(registry, fakeReq("GET", "/mesh/held", headers), undefined);
    assert.equal(nodeId, identity.nodeId);
  });
});

test("rejects when the body was tampered with in transit — signed bodyHash no longer matches", async () => {
  await withRegisteredNode(async (registry, identity) => {
    const headers = buildSignedHeaders(identity, { method: "POST", path: "/mesh/blob/abc123", body: Buffer.from("original") });
    await assert.rejects(
      () => verifyMeshRequest(registry, fakeReq("POST", "/mesh/blob/abc123", headers), Buffer.from("tampered")),
      /invalid node signature/
    );
  });
});

test("rejects a request for a different path than what was signed", async () => {
  await withRegisteredNode(async (registry, identity) => {
    const headers = buildSignedHeaders(identity, { method: "GET", path: "/mesh/held" });
    await assert.rejects(() => verifyMeshRequest(registry, fakeReq("GET", "/mesh/blob/other-hash", headers), undefined));
  });
});

test("rejects a request from a revoked node even with a perfectly valid signature", async () => {
  await withRegisteredNode(async (registry, identity) => {
    const headers = buildSignedHeaders(identity, { method: "GET", path: "/mesh/held" });
    await registry.revoke(identity.nodeId);
    await assert.rejects(() => verifyMeshRequest(registry, fakeReq("GET", "/mesh/held", headers), undefined), /invalid node signature/);
  });
});

test("rejects a stale request outside the replay window, even with a genuinely valid signature", async () => {
  await withRegisteredNode(async (registry, identity) => {
    const headers = buildSignedHeaders(identity, { method: "GET", path: "/mesh/held" });
    headers["x-node-timestamp"] = String(Date.now() - MAX_REQUEST_AGE_MS - 5_000);
    await assert.rejects(() => verifyMeshRequest(registry, fakeReq("GET", "/mesh/held", headers), undefined), /stale/);
  });
});

test("rejects a request missing auth headers entirely", async () => {
  await withRegisteredNode(async (registry) => {
    await assert.rejects(() => verifyMeshRequest(registry, fakeReq("GET", "/mesh/held", {}), undefined), /missing node auth headers/);
  });
});

test("rejects a request claiming a nodeId that was never registered", async () => {
  await withRegisteredNode(async (registry) => {
    const impostor = generateNodeIdentity();
    const headers = buildSignedHeaders(impostor, { method: "GET", path: "/mesh/held" });
    await assert.rejects(() => verifyMeshRequest(registry, fakeReq("GET", "/mesh/held", headers), undefined), /invalid node signature/);
  });
});
