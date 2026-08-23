// Corvo
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "@ship/datasets";
import { createNotificationsStore } from "../Store/Notifications.js";

async function withNotifications(fn) {
  const dataRoot = await mkdtemp(join(tmpdir(), "corvo-notifications-test-"));
  try {
    await fn(createNotificationsStore(createStore(dataRoot)));
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
  }
}

test("create + list round-trips a real notification", async () => {
  await withNotifications(async (notifications) => {
    await notifications.create("u1", { type: "like", fromUserId: "u2", postId: "p1" });
    const list = await notifications.list("u1");
    assert.equal(list.length, 1);
    assert.equal(list[0].type, "like");
    assert.equal(list[0].read, false);
  });
});

test("a user is never notified about their own action", async () => {
  await withNotifications(async (notifications) => {
    const result = await notifications.create("u1", { type: "like", fromUserId: "u1", postId: "p1" });
    assert.equal(result, null);
    assert.deepEqual(await notifications.list("u1"), []);
  });
});

test("list is newest-first", async () => {
  await withNotifications(async (notifications) => {
    await notifications.create("u1", { type: "like", fromUserId: "u2" });
    await new Promise((r) => setTimeout(r, 5));
    const second = await notifications.create("u1", { type: "comment", fromUserId: "u3" });
    const list = await notifications.list("u1");
    assert.equal(list[0].id, second.id);
  });
});

test("unreadCount reflects only unread notifications", async () => {
  await withNotifications(async (notifications) => {
    const a = await notifications.create("u1", { type: "like", fromUserId: "u2" });
    await notifications.create("u1", { type: "comment", fromUserId: "u3" });
    assert.equal(await notifications.unreadCount("u1"), 2);
    await notifications.markRead("u1", a.id);
    assert.equal(await notifications.unreadCount("u1"), 1);
  });
});

test("markRead on an unknown notification throws", async () => {
  await withNotifications(async (notifications) => {
    await assert.rejects(() => notifications.markRead("u1", "nope"));
  });
});

test("notifications are isolated per recipient", async () => {
  await withNotifications(async (notifications) => {
    await notifications.create("u1", { type: "like", fromUserId: "u2" });
    assert.deepEqual(await notifications.list("u2"), []);
  });
});
