// Corvo
import { paths } from "./Paths.js";

/**
 * Profile fields beyond what Ship Auth already owns (username/name/pfp/
 * legalAgreedAt live in Auth's own user table) — bio/links here. Friends
 * are mutual by design (Corvo has no one-way "follower" concept): a
 * request from A becomes a friendship only once B accepts, at which point
 * both sides get a Friends/ entry and count each other.
 */
export function createUsersStore(store) {
  return {
    async getProfile(userId) {
      try {
        return await store.read(paths.userProfile(userId));
      } catch {
        return null;
      }
    },

    async updateProfile(userId, { bio, links } = {}) {
      const existing = (await this.getProfile(userId)) ?? {};
      const profile = { ...existing, ...(bio !== undefined ? { bio } : {}), ...(links !== undefined ? { links } : {}) };
      await store.write(paths.userProfile(userId), profile);
      return profile;
    },

    async listRoles(userId) {
      return store.list(paths.userRolesIndex(userId));
    },

    async addRole(userId, role) {
      await store.write(paths.userRole(userId, role), { grantedAt: new Date().toISOString() });
    },

    async removeRole(userId, role) {
      await store.remove(paths.userRole(userId, role)).catch(() => {});
    },

    async hasRole(userId, role) {
      return store.exists(paths.userRole(userId, role));
    },

    async friendCount(userId) {
      const friends = await store.list(paths.userFriendsIndex(userId));
      return friends.length;
    },

    async listFriends(userId) {
      return store.list(paths.userFriendsIndex(userId));
    },

    async areFriends(userId, otherUserId) {
      return store.exists(paths.userFriend(userId, otherUserId));
    },

    /** A pending request from `fromUserId` to `toUserId` — one-directional until accepted. */
    async sendFriendRequest(toUserId, fromUserId) {
      if (toUserId === fromUserId) throw Object.assign(new Error("cannot friend-request yourself"), { status: 400 });
      await store.write(paths.userFriendRequest(toUserId, fromUserId), { at: new Date().toISOString() });
    },

    async listFriendRequests(userId) {
      return store.list(paths.userFriendRequestsIndex(userId));
    },

    /** Accepting makes the friendship mutual — both sides get a Friends/ entry, the pending request is consumed. */
    async acceptFriendRequest(userId, fromUserId) {
      const pending = await store.exists(paths.userFriendRequest(userId, fromUserId));
      if (!pending) throw Object.assign(new Error("no pending friend request from that user"), { status: 404 });

      const at = new Date().toISOString();
      await store.write(paths.userFriend(userId, fromUserId), { at });
      await store.write(paths.userFriend(fromUserId, userId), { at });
      await store.remove(paths.userFriendRequest(userId, fromUserId));
    },

    async declineFriendRequest(userId, fromUserId) {
      await store.remove(paths.userFriendRequest(userId, fromUserId)).catch(() => {});
    },

    async removeFriend(userId, otherUserId) {
      await store.remove(paths.userFriend(userId, otherUserId)).catch(() => {});
      await store.remove(paths.userFriend(otherUserId, userId)).catch(() => {});
    },

    /** Blocking severs any existing friendship too — a block is a hard safety boundary, not just a content filter, so it shouldn't leave a stale friendship behind it. */
    async block(userId, blockedUserId) {
      if (userId === blockedUserId) throw Object.assign(new Error("cannot block yourself"), { status: 400 });
      await store.write(paths.userBlock(userId, blockedUserId), { at: new Date().toISOString() });
      await store.remove(paths.userFriend(userId, blockedUserId)).catch(() => {});
      await store.remove(paths.userFriend(blockedUserId, userId)).catch(() => {});
    },

    async unblock(userId, blockedUserId) {
      await store.remove(paths.userBlock(userId, blockedUserId)).catch(() => {});
    },

    async listBlocked(userId) {
      return store.list(paths.userBlocksIndex(userId));
    },

    /** Bidirectional by effect, even though the underlying record is one-directional — if either side blocked the other, neither should see the other's content. */
    async isBlocked(userId, otherUserId) {
      const [blockedByMe, blockedByThem] = await Promise.all([
        store.exists(paths.userBlock(userId, otherUserId)),
        store.exists(paths.userBlock(otherUserId, userId)),
      ]);
      return blockedByMe || blockedByThem;
    },

    /** Muting is one-directional and silent by design — unlike a block, the muted user is never told and nothing about the relationship (friendship included) changes for them. */
    async mute(userId, mutedUserId) {
      if (userId === mutedUserId) throw Object.assign(new Error("cannot mute yourself"), { status: 400 });
      await store.write(paths.userMute(userId, mutedUserId), { at: new Date().toISOString() });
    },

    async unmute(userId, mutedUserId) {
      await store.remove(paths.userMute(userId, mutedUserId)).catch(() => {});
    },

    async listMuted(userId) {
      return store.list(paths.userMutesIndex(userId));
    },

    async isMuted(userId, otherUserId) {
      return store.exists(paths.userMute(userId, otherUserId));
    },

    async listPinned(userId) {
      try {
        return await store.read(paths.userPinnedPosts(userId));
      } catch {
        return [];
      }
    },

    /** Capped at 3 — enforced here, not left to the caller, since "up to three" is a real product rule, not a UI suggestion. */
    async pinPost(userId, postId) {
      const pinned = await this.listPinned(userId);
      if (pinned.includes(postId)) return pinned;
      if (pinned.length >= 3) throw Object.assign(new Error("already have 3 pinned posts — unpin one first"), { status: 409 });
      const updated = [...pinned, postId];
      await store.write(paths.userPinnedPosts(userId), updated);
      return updated;
    },

    async unpinPost(userId, postId) {
      const pinned = await this.listPinned(userId);
      const updated = pinned.filter((id) => id !== postId);
      await store.write(paths.userPinnedPosts(userId), updated);
      return updated;
    },
  };
}
