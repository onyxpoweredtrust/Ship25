// Corvo
import { rankFeed } from "./Store/Feed.js";
import { canReply } from "./Store/Threadgate.js";
import { parseMentions } from "./Store/Mentions.js";

const MAX_BODY_BYTES = 1_000_000;
const MAX_MEDIA_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB — a real cap, raise later if actual media sizes need it

async function readRawBody(req, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error("payload too large"), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJsonBody(req) {
  const raw = await readRawBody(req, MAX_BODY_BYTES);
  if (raw.length === 0) return {};
  try {
    return JSON.parse(raw.toString("utf8"));
  } catch {
    throw Object.assign(new Error("malformed JSON body"), { status: 400 });
  }
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(payload) });
  res.end(payload);
}

function compilePath(path) {
  const paramNames = [];
  const pattern = path.replace(/:([a-zA-Z]+)/g, (_, name) => {
    paramNames.push(name);
    return "([^/]+)";
  });
  return { pattern: new RegExp(`^${pattern}$`), paramNames };
}

const FORBIDDEN = Object.assign(new Error("forbidden"), { status: 403 });

/**
 * Every /api/* route requires a real session — there's no logged-out
 * content to serve here at all (see Corvo's splash-screen note: an
 * unauthenticated visitor's whole surface is the splash page, not this API).
 */
export function createApiRouter({ posts, comments, users, dms, media, preferences, reports, notifications, bookmarks, search, usernames, session, security }) {
  const routes = [];
  function route(method, path, handler) {
    const { pattern, paramNames } = compilePath(path);
    routes.push({ method, pattern, paramNames, handler });
  }

  /**
   * Moderator gate — reuses the existing role-tag mechanism (a "mod" role is
   * just a role like any other) as the primary check, backed by the caller's
   * session. `req` is optional and only used for the second path: a valid
   * @ship/security bearer token scoped to Corvo's "mod" data role, for
   * scripted mod tooling that shouldn't need a browser session. Either path
   * passing is sufficient.
   */
  async function requireMod(userId, req) {
    if (await users.hasRole(userId, "mod")) return;
    if (req && security && (await security.hasModToken(req))) return;
    throw FORBIDDEN;
  }

  /** Resolves @tokens in text to real userIds, dropping anything that isn't a registered username (e.g. a role mention — fanning those out needs a reverse role index, future work) and the author's own mention of themselves. */
  async function resolveMentions(text, excludeUserId) {
    const tokens = parseMentions(text);
    const resolved = await Promise.all(tokens.map((t) => usernames.resolve(t)));
    return resolved.filter((id) => id && id !== excludeUserId);
  }

  route("GET", "/api/feed", async (_req, res, _params, userId) => {
    const candidates = await posts.listFeed({ limit: Number.POSITIVE_INFINITY });
    const visible = [];
    for (const post of candidates) {
      if (post.authorId === userId) {
        visible.push(post);
        continue;
      }
      if (await users.isBlocked(userId, post.authorId)) continue;
      if (await users.isMuted(userId, post.authorId)) continue;
      visible.push(post);
    }
    const userPrefs = await preferences.get(userId);
    sendJson(res, 200, rankFeed(visible, userPrefs));
  });

  route("POST", "/api/posts", async (req, res, _params, userId) => {
    const body = await readJsonBody(req);
    if (typeof body.text !== "string" || !body.text.trim()) return sendJson(res, 400, { error: "text is required" });

    const post = await posts.create({
      authorId: userId,
      text: body.text,
      images: Array.isArray(body.images) ? body.images : [],
      tags: Array.isArray(body.tags) ? body.tags : [],
      nsfw: Boolean(body.nsfw),
      quotedPostId: typeof body.quotedPostId === "string" ? body.quotedPostId : null,
      replyGate: typeof body.replyGate === "string" ? body.replyGate : "everyone",
    });

    for (const mentionedId of await resolveMentions(post.text, userId)) {
      await notifications.create(mentionedId, { type: "mention", fromUserId: userId, postId: post.id });
    }
    if (post.quotedPostId) {
      const quoted = await posts.get(post.quotedPostId);
      if (quoted) await notifications.create(quoted.authorId, { type: "quote", fromUserId: userId, postId: post.id });
    }

    sendJson(res, 201, post);
  });

  route("GET", "/api/posts/:id", async (_req, res, { id }, userId) => {
    const post = await posts.get(id);
    if (!post) return sendJson(res, 404, { error: "not found" });
    if (post.authorId !== userId && (await users.isBlocked(userId, post.authorId))) return sendJson(res, 403, { error: "not available" });
    sendJson(res, 200, { ...post, counts: await posts.counts(id) });
  });

  route("GET", "/api/posts/:id/quotes", async (_req, res, { id }) => {
    const quoteIds = await posts.listQuotes(id);
    const quotePosts = (await Promise.all(quoteIds.map((qid) => posts.get(qid)))).filter(Boolean);
    sendJson(res, 200, quotePosts);
  });

  route("DELETE", "/api/posts/:id", async (_req, res, { id }, userId) => {
    const post = await posts.get(id);
    if (!post) return sendJson(res, 404, { error: "not found" });
    if (post.authorId !== userId) return sendJson(res, 403, { error: "not your post" });
    await posts.delete(id);
    sendJson(res, 200, { ok: true });
  });

  route("POST", "/api/posts/:id/like", async (_req, res, { id }, userId) => {
    const result = await posts.like(id, userId);
    // Only a newly-set like feeds the algorithm — un-liking is "never mind," not a signal worth reversing.
    if (result.liked) {
      const post = await posts.get(id);
      if (post) {
        await preferences.recordFeedback(userId, post.tags, "like");
        await notifications.create(post.authorId, { type: "like", fromUserId: userId, postId: id });
      }
    }
    sendJson(res, 200, result);
  });

  route("POST", "/api/posts/:id/dislike", async (_req, res, { id }, userId) => {
    const result = await posts.dislike(id, userId);
    // Deliberately no notification on dislike — a negative signal isn't something worth pushing to the author.
    if (result.disliked) {
      const post = await posts.get(id);
      if (post) await preferences.recordFeedback(userId, post.tags, "dislike");
    }
    sendJson(res, 200, result);
  });

  route("POST", "/api/posts/:id/repost", async (_req, res, { id }, userId) => {
    await posts.repost(id, userId);
    const post = await posts.get(id);
    if (post) await notifications.create(post.authorId, { type: "repost", fromUserId: userId, postId: id });
    sendJson(res, 200, { ok: true });
  });

  route("DELETE", "/api/posts/:id/repost", async (_req, res, { id }, userId) => {
    await posts.unrepost(id, userId);
    sendJson(res, 200, { ok: true });
  });

  route("GET", "/api/posts/:id/comments", async (_req, res, { id }) => {
    sendJson(res, 200, await comments.list(id));
  });

  route("POST", "/api/posts/:id/comments", async (req, res, { id }, userId) => {
    const body = await readJsonBody(req);
    if (typeof body.text !== "string" || !body.text.trim()) return sendJson(res, 400, { error: "text is required" });

    const post = await posts.get(id);
    if (!post) return sendJson(res, 404, { error: "not found" });

    const isFriend = await users.areFriends(userId, post.authorId);
    const isMentioned = (await resolveMentions(post.text, null)).includes(userId);
    if (!canReply({ replyGate: post.replyGate, requesterId: userId, authorId: post.authorId, isFriend, isMentioned })) {
      return sendJson(res, 403, { error: `this post only allows replies from: ${post.replyGate}` });
    }

    const comment = await comments.add(id, { authorId: userId, text: body.text });
    await notifications.create(post.authorId, { type: "comment", fromUserId: userId, postId: id });
    for (const mentionedId of await resolveMentions(comment.text, userId)) {
      await notifications.create(mentionedId, { type: "mention", fromUserId: userId, postId: id });
    }
    sendJson(res, 201, comment);
  });

  route("POST", "/api/media", async (req, res, _params, userId) => {
    const body = await readRawBody(req, MAX_MEDIA_UPLOAD_BYTES);
    if (body.length === 0) return sendJson(res, 400, { error: "empty upload" });
    const hash = await media.upload(body, { mimeType: req.headers["content-type"], uploadedBy: userId });
    sendJson(res, 201, { hash });
  });

  route("GET", "/api/media/:hash", async (_req, res, { hash }) => {
    const result = await media.download(hash);
    if (!result) return sendJson(res, 404, { error: "not found" });
    res.writeHead(200, { "Content-Type": result.mimeType, "Content-Length": result.plaintext.length });
    res.end(result.plaintext);
  });

  // Every knob the feed algorithm runs on, readable and directly editable —
  // "the algorithm" is meant to be inspectable and steerable, not a black box.
  route("GET", "/api/preferences", async (_req, res, _params, userId) => {
    sendJson(res, 200, await preferences.get(userId));
  });

  route("PUT", "/api/preferences/show18plus", async (req, res, _params, userId) => {
    const body = await readJsonBody(req);
    sendJson(res, 200, await preferences.setShow18Plus(userId, Boolean(body.enabled)));
  });

  route("PUT", "/api/preferences/tag-weight", async (req, res, _params, userId) => {
    const body = await readJsonBody(req);
    if (typeof body.tag !== "string" || !body.tag.trim() || typeof body.weight !== "number") {
      return sendJson(res, 400, { error: "tag (string) and weight (number) are required" });
    }
    sendJson(res, 200, await preferences.setTagWeight(userId, body.tag, body.weight));
  });

  route("POST", "/api/preferences/whitelist/:tag", async (_req, res, { tag }, userId) => {
    sendJson(res, 200, await preferences.addToWhitelist(userId, tag));
  });

  route("DELETE", "/api/preferences/whitelist/:tag", async (_req, res, { tag }, userId) => {
    sendJson(res, 200, await preferences.removeFromWhitelist(userId, tag));
  });

  route("POST", "/api/preferences/blacklist/:tag", async (_req, res, { tag }, userId) => {
    sendJson(res, 200, await preferences.addToBlacklist(userId, tag));
  });

  route("DELETE", "/api/preferences/blacklist/:tag", async (_req, res, { tag }, userId) => {
    sendJson(res, 200, await preferences.removeFromBlacklist(userId, tag));
  });

  route("GET", "/api/users/:id/profile", async (_req, res, { id }) => {
    sendJson(res, 200, (await users.getProfile(id)) ?? {});
  });

  route("PUT", "/api/users/me/profile", async (req, res, _params, userId) => {
    const body = await readJsonBody(req);
    sendJson(res, 200, await users.updateProfile(userId, { bio: body.bio, links: body.links }));
  });

  route("GET", "/api/users/:id/roles", async (_req, res, { id }) => {
    sendJson(res, 200, await users.listRoles(id));
  });

  route("GET", "/api/users/:id/friend-count", async (_req, res, { id }) => {
    sendJson(res, 200, { count: await users.friendCount(id) });
  });

  route("POST", "/api/users/:id/friend-request", async (_req, res, { id }, userId) => {
    await users.sendFriendRequest(id, userId);
    await notifications.create(id, { type: "friend-request", fromUserId: userId });
    sendJson(res, 200, { ok: true });
  });

  route("POST", "/api/users/:id/friend-accept", async (_req, res, { id }, userId) => {
    await users.acceptFriendRequest(userId, id);
    await notifications.create(id, { type: "friend-accept", fromUserId: userId });
    sendJson(res, 200, { ok: true });
  });

  route("POST", "/api/users/:id/friend-decline", async (_req, res, { id }, userId) => {
    await users.declineFriendRequest(userId, id);
    sendJson(res, 200, { ok: true });
  });

  route("DELETE", "/api/users/:id/friend", async (_req, res, { id }, userId) => {
    await users.removeFriend(userId, id);
    sendJson(res, 200, { ok: true });
  });

  route("POST", "/api/users/:id/block", async (_req, res, { id }, userId) => {
    await users.block(userId, id);
    sendJson(res, 200, { ok: true });
  });

  route("DELETE", "/api/users/:id/block", async (_req, res, { id }, userId) => {
    await users.unblock(userId, id);
    sendJson(res, 200, { ok: true });
  });

  route("GET", "/api/users/me/blocked", async (_req, res, _params, userId) => {
    sendJson(res, 200, await users.listBlocked(userId));
  });

  route("POST", "/api/users/:id/mute", async (_req, res, { id }, userId) => {
    await users.mute(userId, id);
    sendJson(res, 200, { ok: true });
  });

  route("DELETE", "/api/users/:id/mute", async (_req, res, { id }, userId) => {
    await users.unmute(userId, id);
    sendJson(res, 200, { ok: true });
  });

  route("GET", "/api/users/me/muted", async (_req, res, _params, userId) => {
    sendJson(res, 200, await users.listMuted(userId));
  });

  route("GET", "/api/users/:id/pins", async (_req, res, { id }) => {
    sendJson(res, 200, await users.listPinned(id));
  });

  route("POST", "/api/pins/:postId", async (_req, res, { postId }, userId) => {
    sendJson(res, 200, await users.pinPost(userId, postId));
  });

  route("DELETE", "/api/pins/:postId", async (_req, res, { postId }, userId) => {
    sendJson(res, 200, await users.unpinPost(userId, postId));
  });

  route("GET", "/api/bookmarks", async (_req, res, _params, userId) => {
    sendJson(res, 200, await bookmarks.list(userId));
  });

  route("POST", "/api/bookmarks/:postId", async (_req, res, { postId }, userId) => {
    sendJson(res, 200, await bookmarks.save(userId, postId));
  });

  route("DELETE", "/api/bookmarks/:postId", async (_req, res, { postId }, userId) => {
    sendJson(res, 200, await bookmarks.remove(userId, postId));
  });

  route("GET", "/api/search/posts", async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    sendJson(res, 200, await search.posts(url.searchParams.get("q") ?? ""));
  });

  route("GET", "/api/search/users", async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    sendJson(res, 200, await search.users(url.searchParams.get("q") ?? ""));
  });

  route("GET", "/api/notifications", async (_req, res, _params, userId) => {
    sendJson(res, 200, await notifications.list(userId));
  });

  route("GET", "/api/notifications/unread-count", async (_req, res, _params, userId) => {
    sendJson(res, 200, { count: await notifications.unreadCount(userId) });
  });

  route("POST", "/api/notifications/:id/read", async (_req, res, { id }, userId) => {
    sendJson(res, 200, await notifications.markRead(userId, id));
  });

  route("POST", "/api/reports", async (req, res, _params, userId) => {
    const body = await readJsonBody(req);
    if (typeof body.targetType !== "string" || typeof body.targetId !== "string" || typeof body.reason !== "string" || !body.reason.trim()) {
      return sendJson(res, 400, { error: "targetType, targetId, and reason are required" });
    }
    sendJson(res, 201, await reports.file({ reporterId: userId, targetType: body.targetType, targetId: body.targetId, reason: body.reason }));
  });

  route("GET", "/api/reports/mine", async (_req, res, _params, userId) => {
    sendJson(res, 200, await reports.listByReporter(userId));
  });

  route("GET", "/api/reports", async (req, res, _params, userId) => {
    await requireMod(userId, req);
    const url = new URL(req.url, "http://localhost");
    sendJson(res, 200, await reports.list({ status: url.searchParams.get("status") ?? undefined }));
  });

  route("POST", "/api/reports/:id/resolve", async (req, res, { id }, userId) => {
    await requireMod(userId, req);
    const body = await readJsonBody(req);
    sendJson(res, 200, await reports.resolve(id, { moderatorId: userId, action: body.action, note: body.note }));
  });

  route("POST", "/api/reports/:id/dismiss", async (req, res, { id }, userId) => {
    await requireMod(userId, req);
    const body = await readJsonBody(req);
    sendJson(res, 200, await reports.dismiss(id, { moderatorId: userId, note: body.note }));
  });

  route("POST", "/api/reports/:id/appeal", async (req, res, { id }, userId) => {
    const body = await readJsonBody(req);
    if (typeof body.message !== "string" || !body.message.trim()) return sendJson(res, 400, { error: "message is required" });
    sendJson(res, 200, await reports.fileAppeal(id, { userId, message: body.message }));
  });

  route("POST", "/api/reports/:id/appeal/decide", async (req, res, { id }, userId) => {
    await requireMod(userId, req);
    const body = await readJsonBody(req);
    if (typeof body.decision !== "string") return sendJson(res, 400, { error: "decision is required" });
    sendJson(res, 200, await reports.decideAppeal(id, { moderatorId: userId, decision: body.decision, note: body.note }));
  });

  /** Confirmed mods trade their session for a short-lived @ship/security bearer token, for scripted mod tooling that shouldn't have to carry a browser session around. */
  route("POST", "/api/security/mod-token", async (_req, res, _params, userId) => {
    if (!(await users.hasRole(userId, "mod"))) throw FORBIDDEN;
    if (!security) throw Object.assign(new Error("security module unavailable"), { status: 503 });
    sendJson(res, 200, { token: await security.issueModToken(userId) });
  });

  route("GET", "/api/dms/:otherUserId/messages", async (_req, res, { otherUserId }, userId) => {
    const threadId = dms.threadIdFor(userId, otherUserId);
    sendJson(res, 200, await dms.list(threadId));
  });

  route("POST", "/api/dms/:otherUserId/messages", async (req, res, { otherUserId }, userId) => {
    const body = await readJsonBody(req);
    if (typeof body.text !== "string" || !body.text.trim()) return sendJson(res, 400, { error: "text is required" });
    const threadId = await dms.ensureThread(userId, otherUserId);
    sendJson(res, 201, await dms.send(threadId, userId, body.text));
  });

  return async function handleApi(req, res, url) {
    if (!url.pathname.startsWith("/api/")) return false;

    const matched = routes.find((r) => r.method === req.method && r.pattern.test(url.pathname));
    if (!matched) {
      sendJson(res, 404, { error: "not found" });
      return true;
    }

    const sessionResult = await session.fromRequest(req);
    if (!sessionResult?.user?.id) {
      sendJson(res, 401, { error: "authentication required" });
      return true;
    }

    const match = url.pathname.match(matched.pattern);
    const params = {};
    matched.paramNames.forEach((name, i) => {
      params[name] = decodeURIComponent(match[i + 1]);
    });

    try {
      await matched.handler(req, res, params, sessionResult.user.id);
    } catch (err) {
      sendJson(res, err.status ?? 500, { error: err.message });
    }
    return true;
  };
}
