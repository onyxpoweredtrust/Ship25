// Corvo
import { randomUUID } from "node:crypto";
import { paths } from "./Paths.js";

/**
 * One notification feed per recipient. Created by Api.js at the point an
 * event actually happens (a like, a comment, a mention, a friend request)
 * — this store just persists them, it doesn't decide when to fire one,
 * same separation Feed.js keeps from Posts.js.
 */
export function createNotificationsStore(store) {
  return {
    async create(userId, { type, fromUserId, postId = null }) {
      if (userId === fromUserId) return null; // never notify someone about their own action
      const id = randomUUID();
      const notification = { id, type, fromUserId, postId, read: false, createdAt: new Date().toISOString() };
      await store.write(paths.notification(userId, id), notification);
      return notification;
    },

    async list(userId, { limit = 50 } = {}) {
      const ids = await store.list(paths.notificationsIndex(userId));
      const notifications = await Promise.all(ids.map((id) => store.read(paths.notification(userId, id)).catch(() => null)));
      return notifications
        .filter(Boolean)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit);
    },

    async unreadCount(userId) {
      const all = await this.list(userId, { limit: Number.POSITIVE_INFINITY });
      return all.filter((n) => !n.read).length;
    },

    async markRead(userId, notificationId) {
      const notification = await store.read(paths.notification(userId, notificationId)).catch(() => null);
      if (!notification) throw Object.assign(new Error(`unknown notification "${notificationId}"`), { status: 404 });
      const updated = { ...notification, read: true };
      await store.write(paths.notification(userId, notificationId), updated);
      return updated;
    },
  };
}
