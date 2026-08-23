// Corvo
import { randomUUID } from "node:crypto";
import { paths } from "./Paths.js";

/**
 * Reports live in one flat namespace, not nested under a user or post —
 * moderation needs to list "everything open" regardless of who or what
 * it's about, which a per-target index can't do cheaply. `targetType` is
 * "post" | "comment" | "user" — kept as a plain string rather than an enum
 * module since Store modules elsewhere use the same convention (tags,
 * roles) and a real moderator-role gate isn't built yet either — this
 * relies on the caller (Api.js) checking `mod` via Users.js's existing
 * role-tag mechanism, the same bootstrap-minimal approach used everywhere
 * else a privilege check is needed before a real permissions system exists.
 */
export function createReportsStore(store) {
  async function get(reportId) {
    try {
      return await store.read(paths.report(reportId));
    } catch {
      return null;
    }
  }

  return {
    get,

    async file({ reporterId, targetType, targetId, reason }) {
      const id = randomUUID();
      const report = {
        id,
        reporterId,
        targetType,
        targetId,
        reason,
        status: "open",
        createdAt: new Date().toISOString(),
        resolution: null,
        appeal: null,
      };
      await store.write(paths.report(id), report);
      return report;
    },

    async list({ status } = {}) {
      const ids = await store.list(paths.reportsIndex());
      const reports = (await Promise.all(ids.map(get))).filter(Boolean);
      const filtered = status ? reports.filter((r) => r.status === status) : reports;
      return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async listByReporter(reporterId) {
      const all = await this.list();
      return all.filter((r) => r.reporterId === reporterId);
    },

    async resolve(reportId, { moderatorId, action, note }) {
      const report = await get(reportId);
      if (!report) throw Object.assign(new Error(`unknown report "${reportId}"`), { status: 404 });
      const updated = { ...report, status: "resolved", resolution: { moderatorId, action, note: note ?? null, at: new Date().toISOString() } };
      await store.write(paths.report(reportId), updated);
      return updated;
    },

    async dismiss(reportId, { moderatorId, note }) {
      const report = await get(reportId);
      if (!report) throw Object.assign(new Error(`unknown report "${reportId}"`), { status: 404 });
      const updated = { ...report, status: "dismissed", resolution: { moderatorId, action: "dismissed", note: note ?? null, at: new Date().toISOString() } };
      await store.write(paths.report(reportId), updated);
      return updated;
    },

    /** Only makes sense against a resolved (actioned) report — filing an appeal against something still open or already dismissed isn't a real appeal. */
    async fileAppeal(reportId, { userId, message }) {
      const report = await get(reportId);
      if (!report) throw Object.assign(new Error(`unknown report "${reportId}"`), { status: 404 });
      if (report.status !== "resolved") throw Object.assign(new Error("can only appeal a resolved report"), { status: 409 });
      const updated = { ...report, appeal: { userId, message, status: "pending", at: new Date().toISOString(), decision: null } };
      await store.write(paths.report(reportId), updated);
      return updated;
    },

    async decideAppeal(reportId, { moderatorId, decision, note }) {
      const report = await get(reportId);
      if (!report?.appeal) throw Object.assign(new Error(`report "${reportId}" has no appeal to decide`), { status: 404 });
      const updated = { ...report, appeal: { ...report.appeal, status: decision, decision: { moderatorId, note: note ?? null, at: new Date().toISOString() } } };
      await store.write(paths.report(reportId), updated);
      return updated;
    },
  };
}
