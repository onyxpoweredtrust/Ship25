// Corvo
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "@ship/datasets";
import { createCommentsStore } from "../Store/Comments.js";

async function withComments(fn) {
  const dataRoot = await mkdtemp(join(tmpdir(), "corvo-comments-test-"));
  try {
    await fn(createCommentsStore(createStore(dataRoot)));
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
  }
}

test("add + list round-trips comments in creation order", async () => {
  await withComments(async (comments) => {
    await comments.add("post-1", { authorId: "u1", text: "first" });
    await new Promise((r) => setTimeout(r, 5));
    await comments.add("post-1", { authorId: "u2", text: "second" });

    const list = await comments.list("post-1");
    assert.deepEqual(list.map((c) => c.text), ["first", "second"]);
  });
});

test("comments on different posts don't leak into each other's list", async () => {
  await withComments(async (comments) => {
    await comments.add("post-1", { authorId: "u1", text: "on post 1" });
    await comments.add("post-2", { authorId: "u1", text: "on post 2" });
    assert.equal((await comments.list("post-1")).length, 1);
    assert.equal((await comments.list("post-2")).length, 1);
  });
});

test("delete removes a specific comment", async () => {
  await withComments(async (comments) => {
    const comment = await comments.add("post-1", { authorId: "u1", text: "x" });
    await comments.delete("post-1", comment.id);
    assert.deepEqual(await comments.list("post-1"), []);
  });
});
