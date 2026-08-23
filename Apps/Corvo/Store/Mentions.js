// Corvo
/**
 * Extracts @tokens from post/comment text — e.g. "@eggman95" (a username)
 * or "@pixelartists" (a role, if that role happens to exist). This module
 * only parses; resolving a token to a real user vs. a real role vs.
 * neither, and fanning out notifications, is future work once there's a
 * notification system to fan out to.
 */
const MENTION_RE = /(?:^|\s)@([A-Za-z0-9._-]{1,20})/g;

export function parseMentions(text) {
  if (!text) return [];
  const tokens = new Set();
  for (const match of text.matchAll(MENTION_RE)) tokens.add(match[1]);
  return [...tokens];
}
