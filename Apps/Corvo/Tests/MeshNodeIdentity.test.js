// Corvo
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateNodeIdentity, signPayload, verifySignature } from "../Mesh/NodeIdentity.js";

test("generateNodeIdentity produces a distinct keypair + nodeId each time", () => {
  const a = generateNodeIdentity();
  const b = generateNodeIdentity();
  assert.notEqual(a.nodeId, b.nodeId);
  assert.notEqual(a.publicKey, b.publicKey);
  assert.notEqual(a.privateKey, b.privateKey);
});

test("a real signature verifies against the matching public key", () => {
  const { publicKey, privateKey } = generateNodeIdentity();
  const payload = { hash: "abc123", op: "replicate" };
  const signature = signPayload(privateKey, payload);
  assert.equal(verifySignature(publicKey, payload, signature), true);
});

test("a signature does not verify against a different node's public key (an impersonation attempt)", () => {
  const nodeA = generateNodeIdentity();
  const nodeB = generateNodeIdentity();
  const signature = signPayload(nodeA.privateKey, { hash: "abc123" });
  assert.equal(verifySignature(nodeB.publicKey, { hash: "abc123" }, signature), false);
});

test("a signature does not verify if the payload was altered after signing", () => {
  const { publicKey, privateKey } = generateNodeIdentity();
  const signature = signPayload(privateKey, { hash: "abc123" });
  assert.equal(verifySignature(publicKey, { hash: "tampered" }, signature), false);
});

test("verifySignature returns false (not throw) for a garbage signature", () => {
  const { publicKey } = generateNodeIdentity();
  assert.equal(verifySignature(publicKey, { hash: "abc123" }, "not-a-real-signature"), false);
});

test("verifySignature returns false (not throw) for a malformed public key", () => {
  assert.equal(verifySignature("not-a-real-key", { hash: "abc123" }, "00"), false);
});
