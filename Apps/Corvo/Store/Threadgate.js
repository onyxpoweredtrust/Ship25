// Corvo
export const REPLY_GATES = ["everyone", "friends", "mentioned", "nobody"];

/**
 * Pure decision, no I/O — the caller (Api.js) gathers `isFriend`/
 * `isMentioned` from wherever that actually lives (Users.js's friend
 * graph, Mentions.js + the username index) and hands them in, same
 * separation Feed.js's ranking keeps from its own I/O.
 */
export function canReply({ replyGate, requesterId, authorId, isFriend = false, isMentioned = false }) {
  if (requesterId === authorId) return true; // an author can always reply to their own post, regardless of gate
  switch (replyGate) {
    case "nobody":
      return false;
    case "friends":
      return isFriend;
    case "mentioned":
      return isMentioned;
    case "everyone":
    default:
      return true;
  }
}
