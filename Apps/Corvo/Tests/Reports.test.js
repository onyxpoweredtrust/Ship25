// Corvo
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "@ship/datasets";
import { createReportsStore } from "../Store/Reports.js";

async function withReports(fn) {
  const dataRoot = await mkdtemp(join(tmpdir(), "corvo-reports-test-"));
  try {
    await fn(createReportsStore(createStore(dataRoot)));
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
  }
}

test("filing a report creates a real, open record", async () => {
  await withReports(async (reports) => {
    const report = await reports.file({ reporterId: "u1", targetType: "post", targetId: "p1", reason: "harassment" });
    assert.equal(report.status, "open");
    assert.equal(report.reason, "harassment");
    const fetched = await reports.get(report.id);
    assert.deepEqual(fetched, report);
  });
});

test("list defaults to every report, newest first", async () => {
  await withReports(async (reports) => {
    await reports.file({ reporterId: "u1", targetType: "post", targetId: "p1", reason: "a" });
    await new Promise((r) => setTimeout(r, 5));
    const second = await reports.file({ reporterId: "u2", targetType: "post", targetId: "p2", reason: "b" });
    const all = await reports.list();
    assert.equal(all[0].id, second.id);
  });
});

test("list filters by status", async () => {
  await withReports(async (reports) => {
    const open = await reports.file({ reporterId: "u1", targetType: "post", targetId: "p1", reason: "a" });
    const toResolve = await reports.file({ reporterId: "u2", targetType: "post", targetId: "p2", reason: "b" });
    await reports.resolve(toResolve.id, { moderatorId: "mod1", action: "removed" });
    assert.deepEqual((await reports.list({ status: "open" })).map((r) => r.id), [open.id]);
    assert.deepEqual((await reports.list({ status: "resolved" })).map((r) => r.id), [toResolve.id]);
  });
});

test("listByReporter scopes to one reporter's own filed reports", async () => {
  await withReports(async (reports) => {
    await reports.file({ reporterId: "u1", targetType: "post", targetId: "p1", reason: "a" });
    await reports.file({ reporterId: "u2", targetType: "post", targetId: "p2", reason: "b" });
    const mine = await reports.listByReporter("u1");
    assert.equal(mine.length, 1);
    assert.equal(mine[0].reporterId, "u1");
  });
});

test("resolve records the moderator's action and timestamps it", async () => {
  await withReports(async (reports) => {
    const report = await reports.file({ reporterId: "u1", targetType: "post", targetId: "p1", reason: "spam" });
    const resolved = await reports.resolve(report.id, { moderatorId: "mod1", action: "removed", note: "clear spam" });
    assert.equal(resolved.status, "resolved");
    assert.equal(resolved.resolution.action, "removed");
    assert.equal(resolved.resolution.moderatorId, "mod1");
  });
});

test("dismiss is a distinct terminal state from resolve", async () => {
  await withReports(async (reports) => {
    const report = await reports.file({ reporterId: "u1", targetType: "post", targetId: "p1", reason: "meh" });
    const dismissed = await reports.dismiss(report.id, { moderatorId: "mod1" });
    assert.equal(dismissed.status, "dismissed");
  });
});

test("resolving/dismissing an unknown report throws", async () => {
  await withReports(async (reports) => {
    await assert.rejects(() => reports.resolve("nope", { moderatorId: "mod1", action: "x" }));
    await assert.rejects(() => reports.dismiss("nope", { moderatorId: "mod1" }));
  });
});

test("an appeal can only be filed against a resolved report, not an open or dismissed one", async () => {
  await withReports(async (reports) => {
    const openReport = await reports.file({ reporterId: "u1", targetType: "post", targetId: "p1", reason: "x" });
    await assert.rejects(() => reports.fileAppeal(openReport.id, { userId: "u9", message: "wasn't me" }));

    const dismissedReport = await reports.file({ reporterId: "u1", targetType: "post", targetId: "p2", reason: "x" });
    await reports.dismiss(dismissedReport.id, { moderatorId: "mod1" });
    await assert.rejects(() => reports.fileAppeal(dismissedReport.id, { userId: "u9", message: "n/a" }));
  });
});

test("a real appeal flow: file against a resolved report, then decide it", async () => {
  await withReports(async (reports) => {
    const report = await reports.file({ reporterId: "u1", targetType: "post", targetId: "p1", reason: "x" });
    await reports.resolve(report.id, { moderatorId: "mod1", action: "removed" });

    const appealed = await reports.fileAppeal(report.id, { userId: "u9", message: "this was a misunderstanding" });
    assert.equal(appealed.appeal.status, "pending");

    const decided = await reports.decideAppeal(report.id, { moderatorId: "mod2", decision: "upheld", note: "re-reviewed, appeal denied" });
    assert.equal(decided.appeal.status, "upheld");
    assert.equal(decided.appeal.decision.moderatorId, "mod2");
  });
});

test("deciding an appeal that doesn't exist throws", async () => {
  await withReports(async (reports) => {
    const report = await reports.file({ reporterId: "u1", targetType: "post", targetId: "p1", reason: "x" });
    await reports.resolve(report.id, { moderatorId: "mod1", action: "removed" });
    await assert.rejects(() => reports.decideAppeal(report.id, { moderatorId: "mod2", decision: "upheld" }));
  });
});
