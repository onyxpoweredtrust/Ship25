// Corvo
/**
 * Wraps better-auth's own session lookup so API routes have one place to
 * call, not a copy-pasted Headers-object conversion everywhere. Also
 * self-populates the username index (see Store/Usernames.js) on every
 * successful session resolution — there's no explicit signup hook into
 * Ship Auth, so this is what keeps the index eventually consistent
 * without coupling Corvo's Store layer to Two's connector internals.
 */
export function createSessionReader(shipAuth, usernames) {
  return {
    async fromRequest(req) {
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) {
        if (value === undefined) continue;
        headers.set(name, Array.isArray(value) ? value.join(", ") : value);
      }
      const session = await shipAuth.instance.api.getSession({ headers });
      if (session?.user?.username && session?.user?.id) {
        await usernames.register(session.user.username, session.user.id);
      }
      return session;
    },
  };
}
