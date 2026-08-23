// CosmosAuth
//
// Temporary local stand-in for cosmos.so's real auth backend (which is a
// GraphQL API on api.cosmos.so that this mirror can't replicate). This app
// gives the mirrored cosmos.so frontend a working local session so
// platform-wide testing isn't blocked on login. It is NOT a byte-for-byte
// reimplementation of Cosmos's actual auth protocol.
import { createServer } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync } from "node:fs";
import { createStore, createKeyring } from "@ship/datasets";
import { createShipAuthConnector, toNodeHandler } from "@ship/connectors";

const PORT = Number(process.env.PORT ?? 4001);
const ROOT = fileURLToPath(new URL(".", import.meta.url));

const store = createStore(join(ROOT, ".data"));
const keyring = createKeyring(store);
const authSecret = Buffer.from(await keyring.loadOrGenerateKey("cosmos-auth-secret")).toString("hex");

const shipAuth = await createShipAuthConnector({
  store,
  appBlock: "CosmosAuth",
  role: "user",
  // Browsers always reach this shim by way of the mirror proxy on :8000
  // (mirror_server.py forwards /auth/* here path-for-path), so baseURL has
  // to be the origin the browser actually sees, not this process's own port.
  baseURL: process.env.BASE_URL ?? "http://localhost:8000/auth",
  secret: authSecret,
  // No real OAuth creds for a local shim — email+password/OTP only.
  mailTransport: {
    async send({ to, subject, html }) {
      const code = html.match(/<strong>(\d+)<\/strong>/)?.[1];
      console.log(`[mail] to=${to} subject="${subject}"${code ? ` code=${code}` : ""}`);
    },
  },
});

const authHandler = toNodeHandler(shipAuth.instance);

// Local-only email index for the `IsEmailTaken` GraphQL check (see
// handleGraphql below) — resets on restart, which is fine for a test shim.
// Ship Auth doesn't expose a public "does this email exist" lookup (by
// design, to avoid enumeration), so we track our own registrations instead.
const registeredEmails = new Set();

const MOCK_AUTH = process.env.MOCK_AUTH !== "0"; // on by default

// --- Mock-auth mode ---
// GetMe always reports logged-in (no login/register flow needed at all),
// and every other GraphQL operation is answered by replaying the real
// response captured from a live logged-in session (harvester.js), keyed by
// operation name. This is for exploring the authenticated client without
// touching login — it is NOT variable-aware (a query for a specific cluster
// ID gets back whatever was captured for that operation, not that ID's real
// data), so treat this as "does the UI render with real-shaped data", not
// as a faithful per-request backend.
const CAPTURED_GRAPHQL_DIR =
  process.env.CAPTURED_GRAPHQL_DIR ??
  "/Users/fischergrant/Website Projects/cosmos-harvester/cosmos_capture/graphql";

function loadCapturedGraphqlReplays() {
  const replays = new Map();
  let files;
  try {
    files = readdirSync(CAPTURED_GRAPHQL_DIR);
  } catch {
    console.warn(`[mock-auth] no captured GraphQL dir at ${CAPTURED_GRAPHQL_DIR} — replay disabled`);
    return replays;
  }
  for (const fname of files) {
    const op = fname.replace(/__\d+\.json$/, "");
    if (replays.has(op)) continue; // first capture per op wins — good enough for exploration
    try {
      const parsed = JSON.parse(readFileSync(join(CAPTURED_GRAPHQL_DIR, fname), "utf8"));
      if (parsed.response) replays.set(op, parsed.response);
    } catch {
      /* skip unparseable capture */
    }
  }
  console.log(`[mock-auth] loaded ${replays.size} captured GraphQL operations for replay`);
  return replays;
}

const graphqlReplays = loadCapturedGraphqlReplays();

// The real captured GetMe account never finished onboarding (username/
// fullName null) — the feed component correctly shows its sparse
// "nothing curated yet" state for that, which isn't useful for exploring
// the populated feed. Override just enough fields to look like a complete
// account; everything else stays the real captured shape.
const MOCK_USER = {
  ...(graphqlReplays.get("GetMe")?.data?.me ?? {
    __typename: "User",
    id: 999999999,
    avatarUrl: null,
    isPremium: false,
    hasAcceptedExportTerms: true,
    contentFilteringSettings: { explicit: "BLUR", suggestive: "BLUR", aiGenerated: "SHOW" },
    experiments: [],
    forYouConfiguration: { userId: 999999999, selectedTopicCount: 0 },
  }),
  username: "localtester",
  fullName: "Local Tester",
  email: "localtester@example.com",
  hasCompletedOnboarding: true,
  forYouConfiguration: { userId: 999999999, selectedTopicCount: 5 },
};

const loginPage = `<!doctype html>
<html><body style="font-family:system-ui;max-width:420px;margin:40px auto">
<h2>Cosmos local auth shim</h2>
<p>Test-only stand-in — not real Cosmos auth.</p>
<form id="f">
  <input name="email" type="email" placeholder="email" required style="display:block;width:100%;margin:8px 0;padding:8px"/>
  <input name="password" type="password" placeholder="password" required style="display:block;width:100%;margin:8px 0;padding:8px"/>
  <button type="submit" formaction="signup">Sign up</button>
  <button type="submit" formaction="signin">Sign in</button>
</form>
<pre id="out"></pre>
<script>
document.getElementById('f').addEventListener('submit', async (e) => {
  e.preventDefault();
  const action = e.submitter.getAttribute('formaction');
  const body = Object.fromEntries(new FormData(e.target));
  const path = action === 'signup' ? '/auth/sign-up/email' : '/auth/sign-in/email';
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  document.getElementById('out').textContent = JSON.stringify(await res.json(), null, 2);
});
</script>
</body></html>`;

// --- Reverse-engineered from a real logged-in cosmos.so capture (harvester.js
// in ../cosmos-harvester — actual request/response bodies + headers, not just
// endpoint names from static JS reading) ---
// POST /api/login                        {identifier, password} -> {success, error?} | {success:true, data:{accessToken}}
// POST /api/register                     {email, password}      -> {success:true, data:{accessToken}} | {success:false, error}
// POST /api/login/check-verified-profile {identifier, password} -> {success, error?}
// GET  /api/refresh-token                (cookie-based)          -> {message:"Token refreshed", accessToken}
// GET  /api/logout
// POST /graphql  Authorization: Bearer <accessToken>  (NOT cookie — confirmed
//      from the real Apollo Link config: `authorization: Bearer ${token}`)
//      query GetMe { me { ...User } }  (User fragment fields below)
// accessToken is a real Cosmos-issued JWT in production; our shim mints its
// own opaque token (the underlying Ship Auth session token) instead — the
// frontend never inspects the token's contents, only sends it back verbatim.
// Not a byte-for-byte reimplementation of the real backend, but now matches
// the actual wire contract closely enough for the mirrored frontend to work.

function nodeHeaders(req) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  return headers;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

const SESSION_COOKIE = "better-auth.session_token";

function relaySetCookie(fetchRes, nodeRes) {
  const cookies = typeof fetchRes.headers.getSetCookie === "function" ? fetchRes.headers.getSetCookie() : [];
  if (cookies.length) nodeRes.setHeader("Set-Cookie", cookies);
}

/** Pulls the raw session token value out of a signIn/signUp response's
 * Set-Cookie so it can be handed to the client as `accessToken` (real Cosmos
 * hands back a JWT the same way — inline in the login/register body). */
function extractSessionToken(fetchRes) {
  const cookies = typeof fetchRes.headers.getSetCookie === "function" ? fetchRes.headers.getSetCookie() : [];
  for (const cookie of cookies) {
    const [pair] = cookie.split(";");
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const name = pair.slice(0, eq).trim();
    if (name === SESSION_COOKIE) return decodeURIComponent(pair.slice(eq + 1));
  }
  return null;
}

/** Pulls the caller's session token out of either an `Authorization: Bearer`
 * header or the session cookie, whichever is present — this is the actual
 * signed value Ship Auth needs, unlike `session.session.token` (its internal
 * unsigned ID, not valid to hand back to a client). */
function extractIncomingToken(headers) {
  const auth = headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice("Bearer ".length);
  const cookie = headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/** Resolves a Ship Auth session from either the session cookie (browser,
 * same-origin) or an `Authorization: Bearer <token>` header (the real
 * Cosmos frontend's actual mechanism for GraphQL calls) by bridging the
 * bearer token back into the cookie Ship Auth expects. */
async function resolveSession(req) {
  const headers = nodeHeaders(req);
  const auth = headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice("Bearer ".length);
    const existing = headers.get("cookie");
    const bridged = `${SESSION_COOKIE}=${encodeURIComponent(token)}`;
    headers.set("cookie", existing ? `${existing}; ${bridged}` : bridged);
  }
  const session = await shipAuth.instance.api.getSession({ headers });
  return { session, token: extractIncomingToken(headers) };
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(data);
}

/** Maps a Ship Auth session's user onto the `User` GraphQL fragment shape
 * the mirrored frontend expects from `query GetMe`. */
function toGraphqlUser(user) {
  return {
    __typename: "User",
    id: user.id,
    username: user.username ?? user.email?.split("@")[0] ?? "user",
    fullName: user.name ?? user.fullName ?? "",
    age: null,
    birthday: null,
    countryCode: null,
    createdAt: user.createdAt ?? new Date().toISOString(),
    avatarUrl: user.pfp ?? user.image ?? null,
    isPremium: false,
    email: user.email,
    adminRole: "UNSPECIFIED",
    clustersProfileTabFilter: "UNSPECIFIED",
    elementsProfileTabFilter: "UNSPECIFIED",
    defaultProfileTab: "UNSPECIFIED",
    defaultHomeTab: "UNSPECIFIED",
    contentFilteringSettings: { explicit: "BLUR", suggestive: "BLUR", aiGenerated: "SHOW" },
    experiments: [],
    hasCompletedOnboarding: true,
    hasAcceptedExportTerms: true,
    forYouConfiguration: { userId: user.id, selectedTopicCount: 0 },
    verifiedProfile: null,
  };
}

async function handleLogin(req, res) {
  const { identifier, password } = await readJsonBody(req);
  try {
    const fetchRes = await shipAuth.instance.api.signInEmail({
      body: { email: identifier, password },
      asResponse: true,
    });
    if (!fetchRes.ok) {
      const err = await fetchRes.json().catch(() => null);
      return sendJson(res, 200, { success: false, error: err?.message ?? "Invalid credentials" });
    }
    relaySetCookie(fetchRes, res);
    const accessToken = extractSessionToken(fetchRes);
    sendJson(res, 200, { success: true, data: { accessToken } });
  } catch (err) {
    sendJson(res, 200, { success: false, error: err instanceof Error ? err.message : "Unknown error" });
  }
}

async function handleCheckVerifiedProfile(req, res) {
  const { identifier, password } = await readJsonBody(req);
  try {
    const fetchRes = await shipAuth.instance.api.signInEmail({
      body: { email: identifier, password },
      asResponse: true,
    });
    if (!fetchRes.ok) {
      const err = await fetchRes.json().catch(() => null);
      return sendJson(res, 200, { success: false, error: err?.message ?? "Invalid credentials" });
    }
    // Local shim has no separate "verified profile" concept — any valid
    // credential pair passes this pre-check.
    sendJson(res, 200, { success: true });
  } catch (err) {
    sendJson(res, 200, { success: false, error: err instanceof Error ? err.message : "Unknown error" });
  }
}

async function handleRegister(req, res) {
  const { email, password } = await readJsonBody(req);
  try {
    const fetchRes = await shipAuth.instance.api.signUpEmail({
      body: { email, password, name: email.split("@")[0] },
      asResponse: true,
    });
    if (!fetchRes.ok) {
      const err = await fetchRes.json().catch(() => null);
      return sendJson(res, 200, { success: false, error: err?.message ?? "Registration failed" });
    }
    relaySetCookie(fetchRes, res);
    const accessToken = extractSessionToken(fetchRes);
    registeredEmails.add(email.toLowerCase());
    sendJson(res, 200, { success: true, data: { accessToken } });
  } catch (err) {
    sendJson(res, 200, { success: false, error: err instanceof Error ? err.message : "Unknown error" });
  }
}

const MOCK_ACCESS_TOKEN = "mock-access-token";

async function handleRefreshToken(req, res) {
  // The real client doesn't just trust GetMe's SSR-embedded data — it
  // separately validates via this cookie-based endpoint, and self-corrects
  // back to logged-out (splash sequence, full reload) if it 401s. So mock
  // auth has to cover this too, not just GetMe, or a fresh browser with no
  // real session cookie reverts to logged-out despite GetMe being mocked.
  if (MOCK_AUTH) {
    return sendJson(res, 200, { message: "Token refreshed", accessToken: MOCK_ACCESS_TOKEN });
  }
  const { session, token } = await resolveSession(req);
  if (!session?.session || !token) {
    res.writeHead(401);
    res.end();
    return;
  }
  // Not a real rotation (Ship Auth doesn't reissue on getSession) — just
  // re-attests the same token is still valid, which is enough for local
  // testing since the frontend only cares that it gets a usable accessToken back.
  sendJson(res, 200, { message: "Token refreshed", accessToken: token });
}

async function handleLogout(req, res) {
  const fetchRes = await shipAuth.instance.api.signOut({ headers: nodeHeaders(req), asResponse: true });
  relaySetCookie(fetchRes, res);
  res.writeHead(302, { Location: "/" });
  res.end();
}

async function handleGraphql(req, res) {
  const body = await readJsonBody(req).catch(() => ({}));
  const operationName = body.operationName ?? (body.query ?? "").match(/(?:query|mutation)\s+(\w+)/)?.[1];

  if (operationName === "GetMe") {
    if (MOCK_AUTH) return sendJson(res, 200, { data: { me: MOCK_USER } });
    const { session } = await resolveSession(req);
    const me = session?.user ? toGraphqlUser(session.user) : null;
    return sendJson(res, 200, { data: { me } });
  }

  // Gates the "Next" button on /start's email step — real Cosmos response
  // shape confirmed via harvester capture: {data:{isEmailTaken: boolean}}.
  if (operationName === "IsEmailTaken") {
    const email = (body.variables?.email ?? "").toLowerCase();
    return sendJson(res, 200, { data: { isEmailTaken: registeredEmails.has(email) } });
  }

  // Replay the real response captured from a live logged-in session, if we
  // have one for this operation (see graphqlReplays above — NOT
  // variable-aware, just "does the UI render with real-shaped data").
  const replay = graphqlReplays.get(operationName);
  if (replay) return sendJson(res, 200, replay);

  sendJson(res, 200, {
    data: null,
    errors: [{ message: `"${operationName ?? "unknown operation"}" is not implemented in the local Cosmos shim` }],
  });
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === "/" || url.pathname === "/login") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(loginPage);
      return;
    }
    if (url.pathname.startsWith("/auth")) return void (await authHandler(req, res));
    if (req.method === "POST" && url.pathname === "/api/login") return void (await handleLogin(req, res));
    if (req.method === "POST" && url.pathname === "/api/login/check-verified-profile")
      return void (await handleCheckVerifiedProfile(req, res));
    if (req.method === "POST" && url.pathname === "/api/register") return void (await handleRegister(req, res));
    if (req.method === "GET" && url.pathname === "/api/refresh-token") return void (await handleRefreshToken(req, res));
    if (url.pathname === "/api/logout") return void (await handleLogout(req, res));
    if (req.method === "POST" && url.pathname === "/graphql") return void (await handleGraphql(req, res));

    res.writeHead(404);
    res.end("not found");
  } catch (err) {
    console.error(err);
    res.writeHead(500);
    res.end("shim error");
  }
}).listen(PORT, () => {
  console.log(`CosmosAuth shim listening on http://localhost:${PORT}`);
  console.log(`Try it: http://localhost:${PORT}/login`);
});
