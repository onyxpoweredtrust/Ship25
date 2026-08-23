// Corvo
import { randomUUID } from "node:crypto";
import { paths } from "./Paths.js";

export function createCommentsStore(store) {
  return {
    async add(postId, { authorId, text }) {
      const id = randomUUID();
      const comment = { id, postId, authorId, text, createdAt: new Date().toISOString() };
      await store.write(paths.postComment(postId, id), comment);
      return comment;
    },

    async list(postId) {
      const ids = await store.list(paths.postCommentsIndex(postId));
      const comments = await Promise.all(
        ids.map((id) => store.read(paths.postComment(postId, id)).catch(() => null))
      );
      return comments.filter(Boolean).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },

    async delete(postId, commentId) {
      await store.remove(paths.postComment(postId, commentId));
    },
  };
}
