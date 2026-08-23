// Corvo
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "@ship/datasets";
import { createPostsStore } from "../Store/Posts.js";
import { createUsernameIndex } from "../Store/Usernames.js";
import { createSearchStore } from "../Store/Search.js";

async function withSearch(fn) {
  const dataRoot = await mkdtemp(join(tmpdir(), "corvo-search-test-"));
  try {
    const store = createStore(dataRoot);
    const posts = createPostsStore(store);
    const usernames = createUsernameIndex(store);
    const search = createSearchStore({ posts, store });
    await fn({ search, posts, usernames });
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
  }
}

test("posts search matches on text content, case-insensitively", async () => {
  await withSearch(async ({ search, posts }) => {
    await posts.create({ authorId: "u1", text: "I love Fursuits" });
    await posts.create({ authorId: "u1", text: "unrelated post" });
    const results = await search.posts("fursuit");
    assert.equal(results.length, 1);
    assert.match(results[0].text, /Fursuits/);
  });
});

test("posts search also matches on tags", async () => {
  await withSearch(async ({ search, posts }) => {
    await posts.create({ authorId: "u1", text: "no matching words here", tags: ["fursuits"] });
    const results = await search.posts("fursuit");
    assert.equal(results.length, 1);
  });
});

test("posts search returns nothing for an empty query rather than the whole feed", async () => {
  await withSearch(async ({ search, posts }) => {
    await posts.create({ authorId: "u1", text: "anything" });
    assert.deepEqual(await search.posts(""), []);
    assert.deepEqual(await search.posts("   "), []);
  });
});

test("posts search respects the limit", async () => {
  await withSearch(async ({ search, posts }) => {
    for (let i = 0; i < 5; i++) await posts.create({ authorId: "u1", text: "art post" });
    assert.equal((await search.posts("art", { limit: 2 })).length, 2);
  });
});

test("users search matches on username substring", async () => {
  await withSearch(async ({ search, usernames }) => {
    await usernames.register("eggman95", "u1");
    await usernames.register("someoneelse", "u2");
    const results = await search.users("egg");
    assert.deepEqual(results, [{ username: "eggman95", userId: "u1" }]);
  });
});

test("users search returns nothing for an empty query", async () => {
  await withSearch(async ({ search, usernames }) => {
    await usernames.register("eggman95", "u1");
    assert.deepEqual(await search.users(""), []);
  });
});
