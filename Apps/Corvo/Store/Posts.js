// Corvo
import { randomUUID } from "node:crypto";
import { paths } from "./Paths.js";

/**
 * Posts, likes, dislikes, reposts — all through One via `store`. Likes and
 * dislikes are mutually exclusive (liking removes an existing dislike and
 * vice versa) and toggle off on a repeat call, matching how every real
 * feed's like button behaves.
 */
export function createPostsStore(store) {
  async function get(postId) {
    try {
      return await store.read(paths.post(postId));
    } catch {
      return null;
    }
  }

  async function counts(postId) {
    const [likes, dislikes, comments, reposts, quotes] = await Promise.all([
      store.list(paths.postLikesIndex(postId)),
      store.list(paths.postDislikesIndex(postId)),
      store.list(paths.postCommentsIndex(postId)),
      store.list(paths.postRepostsIndex(postId)),
      store.list(paths.postQuotesIndex(postId)),
    ]);
    return { likes: likes.length, dislikes: dislikes.length, comments: comments.length, reposts: reposts.length, quotes: quotes.length };
  }

  return {
    async create({ authorId, text, images = [], tags = [], nsfw = false, quotedPostId = null, replyGate = "everyone" }) {
      const id = randomUUID();
      // Normalized once at creation — not the caller's job to keep tags
      // lowercase/deduped/consistent every time they touch a post.
      const normalizedTags = [...new Set(tags.map((t) => t.toLowerCase().trim()).filter(Boolean))];
      const post = {
        id,
        authorId,
        text,
        images,
        tags: normalizedTags,
        nsfw: Boolean(nsfw),
        quotedPostId,
        replyGate,
        createdAt: new Date().toISOString(),
      };
      await store.write(paths.post(id), post);
      // Reverse index so the quoted post can list who quoted it — a repost
      // with commentary, not a comment, so it gets its own namespace rather
      // than being folded into Comments.
      if (quotedPostId) await store.write(paths.postQuote(quotedPostId, id), { at: post.createdAt });
      return post;
    },

    async listQuotes(postId) {
      return store.list(paths.postQuotesIndex(postId));
    },

    get,
    counts,

    async delete(postId) {
      // The whole per-post directory, not just the Post leaf — otherwise its
      // Likes/Comments/etc. subdirectories (and the now-orphaned directory
      // entry itself) would linger and keep showing up in listFeed().
      await store.remove(paths.postContainer(postId));
    },

    /** Reverse-chronological, unranked — a real feed algorithm is future work. */
    async listFeed({ limit = 50 } = {}) {
      const ids = await store.list(paths.postsIndex());
      const posts = (await Promise.all(ids.map(get))).filter(Boolean);
      posts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return posts.slice(0, limit);
    },

    async like(postId, userId) {
      if (await store.exists(paths.postDislike(postId, userId))) {
        await store.remove(paths.postDislike(postId, userId));
      }
      if (await store.exists(paths.postLike(postId, userId))) {
        await store.remove(paths.postLike(postId, userId));
        return { liked: false };
      }
      await store.write(paths.postLike(postId, userId), { at: new Date().toISOString() });
      return { liked: true };
    },

    async dislike(postId, userId) {
      if (await store.exists(paths.postLike(postId, userId))) {
        await store.remove(paths.postLike(postId, userId));
      }
      if (await store.exists(paths.postDislike(postId, userId))) {
        await store.remove(paths.postDislike(postId, userId));
        return { disliked: false };
      }
      await store.write(paths.postDislike(postId, userId), { at: new Date().toISOString() });
      return { disliked: true };
    },

    async repost(postId, userId) {
      await store.write(paths.postRepost(postId, userId), { at: new Date().toISOString() });
    },

    async unrepost(postId, userId) {
      await store.remove(paths.postRepost(postId, userId)).catch(() => {});
    },
  };
}
