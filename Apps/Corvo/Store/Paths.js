// Corvo
/**
 * Single source of truth for every One Block path Corvo writes to — every
 * Store module imports these builders rather than constructing path arrays
 * inline, so the schema only has one place to change.
 *
 * Reserved top-level namespaces under Corvo/ — keep this list current as
 * the data model grows:
 *   Posts/     — posts, likes, dislikes, comments, reposts, quotes
 *   Users/     — profile, roles, friends, friend requests, algorithm
 *                preferences, blocks, mutes, pinned posts, bookmark pointer
 *   DMs/       — direct-message threads (see DirectMessages.js for the
 *                at-rest-encryption caveat — not end-to-end yet)
 *   Reports/   — moderation reports + appeals
 *   Notifications/ — per-user notification feed
 *   _Usernames/    — username -> userId index (see Usernames.js for why
 *                    this lives outside Users/ — it's a lookup table, not
 *                    per-user data, and never role-gated by userId)
 */
export const APP_BLOCK = "Corvo";

export const paths = {
  postsIndex: () => [APP_BLOCK, "Posts"],
  // The post's own data lives at .../<id>/Post, not .../<id> directly — that
  // path is also the parent container for Likes/Dislikes/Comments/Reposts,
  // and a leaf file + a same-named directory both existing under Posts/
  // made `store.list(postsIndex())` return every post ID twice (a real bug
  // caught by an end-to-end feed smoke test, not by the unit tests, which
  // each used a fresh store with only one post's worth of subpaths touched).
  post: (postId) => [APP_BLOCK, "Posts", postId, "Post"],
  /** The whole per-post directory — Post + Likes + Dislikes + Comments + Reposts — for a real delete, not just the Post leaf. */
  postContainer: (postId) => [APP_BLOCK, "Posts", postId],
  postLikesIndex: (postId) => [APP_BLOCK, "Posts", postId, "Likes"],
  postLike: (postId, userId) => [APP_BLOCK, "Posts", postId, "Likes", userId],
  postDislikesIndex: (postId) => [APP_BLOCK, "Posts", postId, "Dislikes"],
  postDislike: (postId, userId) => [APP_BLOCK, "Posts", postId, "Dislikes", userId],
  postCommentsIndex: (postId) => [APP_BLOCK, "Posts", postId, "Comments"],
  postComment: (postId, commentId) => [APP_BLOCK, "Posts", postId, "Comments", commentId],
  postRepostsIndex: (postId) => [APP_BLOCK, "Posts", postId, "Reposts"],
  postRepost: (postId, userId) => [APP_BLOCK, "Posts", postId, "Reposts", userId],
  postQuotesIndex: (postId) => [APP_BLOCK, "Posts", postId, "Quotes"],
  postQuote: (postId, quotingPostId) => [APP_BLOCK, "Posts", postId, "Quotes", quotingPostId],

  userProfile: (userId) => [APP_BLOCK, "Users", userId, "Profile"],
  userRolesIndex: (userId) => [APP_BLOCK, "Users", userId, "Roles"],
  userRole: (userId, role) => [APP_BLOCK, "Users", userId, "Roles", role],
  userFriendsIndex: (userId) => [APP_BLOCK, "Users", userId, "Friends"],
  userFriend: (userId, otherUserId) => [APP_BLOCK, "Users", userId, "Friends", otherUserId],
  userFriendRequestsIndex: (userId) => [APP_BLOCK, "Users", userId, "FriendRequests"],
  userFriendRequest: (userId, fromUserId) => [APP_BLOCK, "Users", userId, "FriendRequests", fromUserId],
  userPreferences: (userId) => [APP_BLOCK, "Users", userId, "Preferences"],
  userBlocksIndex: (userId) => [APP_BLOCK, "Users", userId, "Blocks"],
  userBlock: (userId, blockedUserId) => [APP_BLOCK, "Users", userId, "Blocks", blockedUserId],
  userMutesIndex: (userId) => [APP_BLOCK, "Users", userId, "Mutes"],
  userMute: (userId, mutedUserId) => [APP_BLOCK, "Users", userId, "Mutes", mutedUserId],
  userPinnedPosts: (userId) => [APP_BLOCK, "Users", userId, "PinnedPosts"],
  /** Just the pointer (a Mesh content hash) — the actual bookmark list lives on Mesh, not the HDD. See Bookmarks.js. */
  userBookmarksPointer: (userId) => [APP_BLOCK, "Users", userId, "BookmarksHash"],

  dmThreadMeta: (threadId) => [APP_BLOCK, "DMs", threadId, "Meta"],
  dmMessagesIndex: (threadId) => [APP_BLOCK, "DMs", threadId, "Messages"],
  dmMessage: (threadId, messageId) => [APP_BLOCK, "DMs", threadId, "Messages", messageId],

  reportsIndex: () => [APP_BLOCK, "Reports"],
  report: (reportId) => [APP_BLOCK, "Reports", reportId],

  notificationsIndex: (userId) => [APP_BLOCK, "Notifications", userId],
  notification: (userId, notificationId) => [APP_BLOCK, "Notifications", userId, notificationId],

  username: (username) => [APP_BLOCK, "_Usernames", username.toLowerCase()],
};
