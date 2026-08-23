// Corvo
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createStore, createKeyring } from "@ship/datasets";
import { createShipAuthConnector, createShipShieldConnector, toNodeHandler } from "@ship/connectors";
import { createPostsStore } from "./Store/Posts.js";
import { createCommentsStore } from "./Store/Comments.js";
import { createUsersStore } from "./Store/Users.js";
import { createDirectMessagesStore } from "./Store/DirectMessages.js";
import { createPreferencesStore } from "./Store/Preferences.js";
import { createReportsStore } from "./Store/Reports.js";
import { createNotificationsStore } from "./Store/Notifications.js";
import { createBookmarksStore } from "./Store/Bookmarks.js";
import { createSearchStore } from "./Store/Search.js";
import { createUsernameIndex } from "./Store/Usernames.js";
import { createSessionReader } from "./Auth/Session.js";
import { createSecurityGate } from "./Auth/Security.js";
import { createApiRouter } from "./Api.js";
import { createBlobStore } from "./Mesh/BlobStore.js";
import { createMediaRegistry } from "./Mesh/MediaRegistry.js";
import { createMediaIngest } from "./Mesh/Ingest.js";
import { createNodeRegistry } from "./Mesh/NodeRegistry.js";
import { loadOrGeneratePrimaryIdentity } from "./Mesh/PrimaryIdentity.js";
import { createMeshServer } from "./Mesh/Server.js";
import { buildLiveManifest } from "./Mesh/Manifest.js";
import { runPrimaryGc } from "./Mesh/PrimaryGc.js";
import { createGcState } from "./Mesh/SyncClient.js";
import { createScheduler } from "./Mesh/Scheduler.js";

// Design-machine prototype only — real deploy target is thebuildmachine.
// PORT/baseURL stay env-driven so nothing here is pinned to this laptop.
const PORT = Number(process.env.PORT ?? 3000);
const ROOT = fileURLToPath(new URL(".", import.meta.url));

/** Only real OAuth credentials turn a provider on — unset env vars just leave it off, no placeholder secrets. */
function socialProviderFromEnv(prefix) {
  const clientId = process.env[`${prefix}_CLIENT_ID`];
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`];
  return clientId && clientSecret ? { clientId, clientSecret } : undefined;
}

const store = createStore(join(ROOT, ".data"));
const keyring = createKeyring(store);
const authSecret = Buffer.from(await keyring.loadOrGenerateKey("corvo-auth-secret")).toString("hex");
const shieldSecret = Buffer.from(await keyring.loadOrGenerateKey("corvo-shield-secret")).toString("hex");

// Ahead of everything, including /auth/* — signup/login endpoints are exactly
// what a credential-stuffing or mass-account-creation scraper goes after, so
// they don't get a pass just because they're already access-controlled.
const shield = createShipShieldConnector({
  store,
  appBlock: "Corvo",
  role: "user",
  secret: shieldSecret,
});

const shipAuth = await createShipAuthConnector({
  store,
  appBlock: "Corvo",
  role: "user",
  baseURL: process.env.BASE_URL ?? `http://localhost:${PORT}/auth`,
  secret: authSecret,
  // Google + GitHub per the agreed signup/login flow; Onyx Pass is already
  // unconditionally on inside Ship Auth's own connector (see ShipAuth/index.ts).
  providers: {
    google: socialProviderFromEnv("GOOGLE"),
    github: socialProviderFromEnv("GITHUB"),
  },
  // Stand-in until real SMTP creds exist — logs OTP codes instead of emailing them.
  mailTransport: {
    async send({ to, subject, html }) {
      const code = html.match(/<strong>(\d+)<\/strong>/)?.[1];
      console.log(`[mail] to=${to} subject="${subject}"${code ? ` code=${code}` : ""}`);
    },
  },
});

const authHandler = toNodeHandler(shipAuth.instance);

// Read once at boot, served from memory — every unauthenticated visitor
// hits this, so it shouldn't cost a disk read per request on the iMac's
// HDD. Real deploy target only reads this off disk once, not per request.
const splashHtml = await readFile(join(ROOT, "Web", "index.html"), "utf8");

const postsStore = createPostsStore(store);

// This iMac IS the primary/manifest-authority Mesh node — a persistent
// identity (not a fresh keypair every boot) so other nodes don't treat a
// restart as a brand-new, unregistered node.
const meshBlobs = createBlobStore(join(ROOT, ".mesh-blobs"));
const mediaRegistry = createMediaRegistry(store);
const mediaIngest = createMediaIngest({ blobs: meshBlobs, media: mediaRegistry, keyring });
const nodeRegistry = createNodeRegistry(store);
const primaryIdentity = await loadOrGeneratePrimaryIdentity(store);
if (!(await nodeRegistry.get(primaryIdentity.nodeId))) {
  await nodeRegistry.register(primaryIdentity.nodeId, primaryIdentity.publicKey, { label: "primary (this iMac)" });
}

const bookmarksStore = createBookmarksStore(store, mediaIngest);

const meshHandler = createMeshServer({
  blobs: meshBlobs,
  registry: nodeRegistry,
  isManifestAuthority: true,
  getManifest: () => buildLiveManifest(postsStore, { store, bookmarks: bookmarksStore }),
});

// Reclaims media whose referencing post was deleted — MediaRegistry (the
// wrapped key) and this node's own blob copy both get cleaned up, on a
// grace period so an in-flight edit/undo can't race a real delete.
const primaryGcScheduler = createScheduler({
  intervalMs: Number(process.env.MESH_GC_INTERVAL_MS ?? 60 * 60_000),
  task: async () => {
    const result = await runPrimaryGc({
      posts: postsStore,
      media: mediaRegistry,
      blobs: meshBlobs,
      store,
      bookmarks: bookmarksStore,
      // A sibling of, not inside, .mesh-blobs — BlobStore's root is exclusively shard directories; a stray file there is harmless (list() just skips anything that isn't a directory) but not worth the mess.
      gcState: createGcState(join(ROOT, ".mesh-gc-state.json")),
      graceMs: Number(process.env.MESH_GC_GRACE_MS ?? 7 * 24 * 60 * 60 * 1000),
    });
    if (result.deleted.length > 0) console.log(`[mesh gc] reclaimed ${result.deleted.length} orphaned media hash(es)`);
  },
  onError: (err) => console.error("[mesh gc] failed:", err.message),
});
primaryGcScheduler.start();

const usernameIndex = createUsernameIndex(store);

// @ship/security's scoped-token issuer, layered in alongside Ship Auth's
// session cookies — the second bearer-token path mod-only routes accept
// (see Auth/Security.js, and requireMod in Api.js).
const security = await createSecurityGate(store);

const apiHandler = createApiRouter({
  posts: postsStore,
  comments: createCommentsStore(store),
  users: createUsersStore(store),
  dms: createDirectMessagesStore(store, keyring),
  media: mediaIngest,
  preferences: createPreferencesStore(store),
  reports: createReportsStore(store),
  notifications: createNotificationsStore(store),
  bookmarks: bookmarksStore,
  search: createSearchStore({ posts: postsStore, store }),
  usernames: usernameIndex,
  session: createSessionReader(shipAuth, usernameIndex),
  security,
});

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // /mesh/* is deliberately routed around Shield — it's node-to-node traffic
  // authenticated by Ed25519 signature against the node registry, a
  // different (and stronger, for this channel) gate than Shield's bot
  // heuristics, which are calibrated for anonymous human/scraper traffic
  // and would misfire on a legitimate machine client. See Mesh/Server.js.
  if (await meshHandler(req, res, url)) return;

  const guarded = await shield.guard(req, res);
  if (guarded.decision !== "allow") return; // guard() already wrote the response (challenge/block/trap/handled)

  // The whole surface a logged-out visitor gets — see SECURITY.md's
  // access-control-as-foundation principle: nothing real is reachable
  // without a session, so this is genuinely the entire unauthenticated app.
  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(splashHtml);
    return;
  }

  if (url.pathname === "/auth" || url.pathname.startsWith("/auth/")) {
    await authHandler(req, res);
    return;
  }

  if (await apiHandler(req, res, url)) return;

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`Corvo listening on http://localhost:${PORT}`);
});
