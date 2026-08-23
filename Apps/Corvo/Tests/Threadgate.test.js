// Corvo
import { test } from "node:test";
import assert from "node:assert/strict";
import { canReply } from "../Store/Threadgate.js";

test("the author can always reply to their own post, regardless of gate", () => {
  assert.equal(canReply({ replyGate: "nobody", requesterId: "author", authorId: "author" }), true);
});

test("everyone gate allows any requester", () => {
  assert.equal(canReply({ replyGate: "everyone", requesterId: "u2", authorId: "u1" }), true);
});

test("nobody gate blocks even a friend or a mentioned user", () => {
  assert.equal(canReply({ replyGate: "nobody", requesterId: "u2", authorId: "u1", isFriend: true, isMentioned: true }), false);
});

test("friends gate allows a friend and blocks a non-friend", () => {
  assert.equal(canReply({ replyGate: "friends", requesterId: "u2", authorId: "u1", isFriend: true }), true);
  assert.equal(canReply({ replyGate: "friends", requesterId: "u2", authorId: "u1", isFriend: false }), false);
});

test("mentioned gate allows a mentioned user and blocks one who wasn't mentioned", () => {
  assert.equal(canReply({ replyGate: "mentioned", requesterId: "u2", authorId: "u1", isMentioned: true }), true);
  assert.equal(canReply({ replyGate: "mentioned", requesterId: "u2", authorId: "u1", isMentioned: false }), false);
});

test("an unrecognized gate value fails open to 'everyone' behavior rather than throwing", () => {
  assert.equal(canReply({ replyGate: "some-future-gate", requesterId: "u2", authorId: "u1" }), true);
});
