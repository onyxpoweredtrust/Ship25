// Corvo
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "@ship/datasets";
import { createUsersStore } from "../Store/Users.js";

async function withUsers(fn) {
  const dataRoot = await mkdtemp(join(tmpdir(), "corvo-users-test-"));
  try {
    await fn(createUsersStore(createStore(dataRoot)));
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
  }
}

test("updateProfile merges into the existing profile rather than replacing it", async () => {
  await withUsers(async (users) => {
    await users.updateProfile("u1", { bio: "hi" });
    await users.updateProfile("u1", { links: ["https://example.com"] });
    const profile = await users.getProfile("u1");
    assert.equal(profile.bio, "hi");
    assert.deepEqual(profile.links, ["https://example.com"]);
  });
});

test("roles: add, list, hasRole, remove", async () => {
  await withUsers(async (users) => {
    await users.addRole("u1", "pixelartists");
    assert.deepEqual(await users.listRoles("u1"), ["pixelartists"]);
    assert.equal(await users.hasRole("u1", "pixelartists"), true);
    await users.removeRole("u1", "pixelartists");
    assert.equal(await users.hasRole("u1", "pixelartists"), false);
  });
});

test("a friend request is one-directional until accepted, then mutual", async () => {
  await withUsers(async (users) => {
    await users.sendFriendRequest("u2", "u1"); // u1 -> u2
    assert.deepEqual(await users.listFriendRequests("u2"), ["u1"]);
    assert.equal(await users.areFriends("u1", "u2"), false);

    await users.acceptFriendRequest("u2", "u1");
    assert.equal(await users.areFriends("u1", "u2"), true);
    assert.equal(await users.areFriends("u2", "u1"), true);
    assert.equal(await users.friendCount("u1"), 1);
    assert.equal(await users.friendCount("u2"), 1);
    assert.deepEqual(await users.listFriendRequests("u2"), []);
  });
});

test("accepting a friend request that doesn't exist throws rather than silently succeeding", async () => {
  await withUsers(async (users) => {
    await assert.rejects(() => users.acceptFriendRequest("u2", "u1"));
  });
});

test("declining a friend request removes it without creating a friendship", async () => {
  await withUsers(async (users) => {
    await users.sendFriendRequest("u2", "u1");
    await users.declineFriendRequest("u2", "u1");
    assert.equal(await users.areFriends("u1", "u2"), false);
    assert.deepEqual(await users.listFriendRequests("u2"), []);
  });
});

test("removeFriend un-friends both directions", async () => {
  await withUsers(async (users) => {
    await users.sendFriendRequest("u2", "u1");
    await users.acceptFriendRequest("u2", "u1");
    await users.removeFriend("u1", "u2");
    assert.equal(await users.areFriends("u1", "u2"), false);
    assert.equal(await users.areFriends("u2", "u1"), false);
  });
});

test("cannot send a friend request to yourself", async () => {
  await withUsers(async (users) => {
    await assert.rejects(() => users.sendFriendRequest("u1", "u1"));
  });
});

test("block severs an existing friendship, both directions", async () => {
  await withUsers(async (users) => {
    await users.sendFriendRequest("u2", "u1");
    await users.acceptFriendRequest("u2", "u1");
    await users.block("u1", "u2");
    assert.equal(await users.areFriends("u1", "u2"), false);
    assert.equal(await users.areFriends("u2", "u1"), false);
  });
});

test("isBlocked is true regardless of which side blocked the other", async () => {
  await withUsers(async (users) => {
    await users.block("u1", "u2");
    assert.equal(await users.isBlocked("u1", "u2"), true);
    assert.equal(await users.isBlocked("u2", "u1"), true);
  });
});

test("unblock lifts the block", async () => {
  await withUsers(async (users) => {
    await users.block("u1", "u2");
    await users.unblock("u1", "u2");
    assert.equal(await users.isBlocked("u1", "u2"), false);
  });
});

test("cannot block yourself", async () => {
  await withUsers(async (users) => {
    await assert.rejects(() => users.block("u1", "u1"));
  });
});

test("listBlocked returns everyone this user has blocked", async () => {
  await withUsers(async (users) => {
    await users.block("u1", "u2");
    await users.block("u1", "u3");
    assert.deepEqual((await users.listBlocked("u1")).sort(), ["u2", "u3"]);
  });
});

test("mute is one-directional — muting doesn't affect the muted user's own view or friendship", async () => {
  await withUsers(async (users) => {
    await users.sendFriendRequest("u2", "u1");
    await users.acceptFriendRequest("u2", "u1");
    await users.mute("u1", "u2");
    assert.equal(await users.isMuted("u1", "u2"), true);
    assert.equal(await users.isMuted("u2", "u1"), false); // not mutual
    assert.equal(await users.areFriends("u1", "u2"), true); // friendship untouched
  });
});

test("unmute lifts the mute", async () => {
  await withUsers(async (users) => {
    await users.mute("u1", "u2");
    await users.unmute("u1", "u2");
    assert.equal(await users.isMuted("u1", "u2"), false);
  });
});

test("cannot mute yourself", async () => {
  await withUsers(async (users) => {
    await assert.rejects(() => users.mute("u1", "u1"));
  });
});

test("pinning caps at 3 and rejects a 4th", async () => {
  await withUsers(async (users) => {
    await users.pinPost("u1", "p1");
    await users.pinPost("u1", "p2");
    await users.pinPost("u1", "p3");
    await assert.rejects(() => users.pinPost("u1", "p4"));
    assert.deepEqual(await users.listPinned("u1"), ["p1", "p2", "p3"]);
  });
});

test("pinning an already-pinned post is a no-op, not a duplicate or an error", async () => {
  await withUsers(async (users) => {
    await users.pinPost("u1", "p1");
    await users.pinPost("u1", "p1");
    assert.deepEqual(await users.listPinned("u1"), ["p1"]);
  });
});

test("unpinning frees a slot for a new pin", async () => {
  await withUsers(async (users) => {
    await users.pinPost("u1", "p1");
    await users.pinPost("u1", "p2");
    await users.pinPost("u1", "p3");
    await users.unpinPost("u1", "p2");
    await users.pinPost("u1", "p4");
    assert.deepEqual(await users.listPinned("u1"), ["p1", "p3", "p4"]);
  });
});
