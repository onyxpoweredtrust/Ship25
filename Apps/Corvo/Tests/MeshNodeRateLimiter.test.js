// Corvo
import { test } from "node:test";
import assert from "node:assert/strict";
import { createNodeRateLimiter } from "../Mesh/NodeRateLimiter.js";

test("allows up to capacity requests for a node, then blocks the next one", () => {
  const limiter = createNodeRateLimiter({ capacity: 3, refillPerSecond: 0 });
  assert.equal(limiter.consume("node-a"), true);
  assert.equal(limiter.consume("node-a"), true);
  assert.equal(limiter.consume("node-a"), true);
  assert.equal(limiter.consume("node-a"), false);
});

test("different nodes have independent buckets — one node's traffic doesn't starve another's", () => {
  const limiter = createNodeRateLimiter({ capacity: 1, refillPerSecond: 0 });
  assert.equal(limiter.consume("node-a"), true);
  assert.equal(limiter.consume("node-b"), true);
  assert.equal(limiter.consume("node-a"), false);
  assert.equal(limiter.consume("node-b"), false);
});

test("refills over time", () => {
  let clock = 0;
  const limiter = createNodeRateLimiter({ capacity: 1, refillPerSecond: 1, now: () => clock });
  assert.equal(limiter.consume("node-a"), true);
  assert.equal(limiter.consume("node-a"), false);
  clock += 1000;
  assert.equal(limiter.consume("node-a"), true);
});
