// Cores Gateway
// designed and built by onyxlabs.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { WebSocketServer } from "../Vendor/Ws/wrapper.mjs";
import { createStore, watchStore, SHIP_ROOT_BLOCK, BlockNotFoundError, AccessDeniedError, DEFAULT_DATA_ROOT } from "@ship/datasets";
import type { AgentPipeline, ProcessManager } from "@ship/agent";
import { createNodeFilesystem } from "@ship/agent";
import { gatherSystemInfo, runIgnition, type IgnitionOptions, createDefaultIgnitionSteps, findError } from "@ship/scaffold";
import type { TokenIssuer, TokenScope } from "@ship/security";
import { authorize, ForbiddenError, UnauthorizedError } from "@ship/security";
import { renderDashboard } from "./Dashboard.js";
import { basename } from "node:path";
import {
  applyBaselineSecurityHeaders,
  applyJsonContentSecurityPolicy,
  applyDashboardContentSecurityPolicy,
  generateCspNonce,
} from "./SecurityHeaders.js";
import {
  readJsonBody as readJsonBodyLimited,
  assertJsonContentType,
  UnsupportedMediaTypeError,
  PayloadTooLargeError,
} from "./BodyLimits.js";

export interface ConnectorMount {
  pathPrefix: string;
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
}

export interface ZeroServerOptions {
  issuer: TokenIssuer;
  pipeline: AgentPipeline;
  processManager: ProcessManager;
  dataRoot?: string;
  mounts?: ConnectorMount[];
}

export { DEFAULT_DATA_ROOT };

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  applyBaselineSecurityHeaders(res);
  applyJsonContentSecurityPolicy(res);
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(payload) });
  res.end(payload);
}

function sendError(res: ServerResponse, status: number, code: number): void {
  sendJson(res, status, findError(code));
}

function sendJsonAndCloseConnection(res: ServerResponse, status: number, body: unknown): void {
  res.setHeader("Connection", "close");
  sendJson(res, status, body);
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  assertJsonContentType(req);
  return readJsonBodyLimited(req);
}

type Handler = (req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => Promise<void>;

interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  allowedScopes: TokenScope[] | null; // null = no auth required
  handler: Handler;
}

function compilePath(path: string): { pattern: RegExp; paramNames: string[] } {
  const paramNames: string[] = [];
  const pattern = path.replace(/:([a-zA-Z]+)/g, (_, name) => {
    paramNames.push(name);
    return "([^/]+)";
  });
  return { pattern: new RegExp(`^${pattern}$`), paramNames };
}

export function createZeroServer(options: ZeroServerOptions): Server {
  const { issuer, pipeline, processManager } = options;
  const { store: dataStore } = watchStore(createStore(options.dataRoot ?? DEFAULT_DATA_ROOT));

  const routes: Route[] = [];
  function route(method: string, path: string, allowedScopes: TokenScope[] | null, handler: Handler): void {
    const { pattern, paramNames } = compilePath(path);
    routes.push({ method, pattern, paramNames, allowedScopes, handler });
  }

  route("GET", "/health", null, async (_req, res) => {
    sendJson(res, 200, { ok: true });
  });

  route("GET", "/", null, async (req, res) => {
    const token = await issuer.issue("zero", "dashboard", 10 * 60_000);
    const nonce = generateCspNonce();
    const html = renderDashboard({
      appName: basename(pipeline.basePath),
      port: req.socket.localPort ?? 0,
      token,
      nonce,
    });
    applyBaselineSecurityHeaders(res);
    applyDashboardContentSecurityPolicy(res, nonce);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  });

  route("GET", "/system-info", ["one", "two", "three", "sdk"], async (_req, res) => {
    sendJson(res, 200, await gatherSystemInfo());
  });

  route("GET", "/modules", ["one", "two", "three", "sdk"], async (_req, res) => {
    sendJson(res, 200, pipeline.registry.list());
  });

  route("GET", "/errors/:code", null, async (_req, res, params) => {
    const entry = findError(Number(params.code));
    if (!entry) return sendJson(res, 404, { error: "unknown error code" });
    sendJson(res, 200, entry);
  });

  route("GET", "/pipeline/tick", ["one", "two", "three", "sdk"], async (_req, res) => {
    sendJson(res, 200, await pipeline.tickOnce());
  });

  route("POST", "/ignition", ["zero", "three"], async (req, res) => {
    const body = (await readJsonBody(req)) as Partial<IgnitionOptions>;
    if (!body.appId || !body.targetPath || !body.templateSlug) {
      return sendJson(res, 400, { error: "appId, targetPath, and templateSlug are required" });
    }

    const result = await runIgnition(
      {
        appId: body.appId,
        targetPath: body.targetPath,
        templateSlug: body.templateSlug,
        fs: createNodeFilesystem(body.targetPath),
      },
      createDefaultIgnitionSteps(processManager)
    );

    sendJson(res, result.ok ? 200 : 422, result);
  });

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    const mount = options.mounts?.find((m) => url.pathname === m.pathPrefix || url.pathname.startsWith(`${m.pathPrefix}/`));
    if (mount) {
      try {
        return await mount.handler(req, res);
      } catch (err) {
        return sendJson(res, 500, { error: (err as Error).message });
      }
    }

    if (url.pathname === "/data" || url.pathname.startsWith("/data/")) {
      return handleData(req, res, url);
    }

    const matched = routes.find((r) => r.method === req.method && r.pattern.test(url.pathname));
    if (!matched) return sendJson(res, 404, { error: "not found" });

    const match = url.pathname.match(matched.pattern);
    const params: Record<string, string> = {};
    matched.paramNames.forEach((name, i) => {
      params[name] = match?.[i + 1] ?? "";
    });

    try {
      if (matched.allowedScopes) await authorize(issuer, req, matched.allowedScopes);
      await matched.handler(req, res, params);
    } catch (err) {
      if (err instanceof UnauthorizedError) return sendError(res, 401, 5);
      if (err instanceof ForbiddenError) return sendError(res, 403, 6);
      if (err instanceof UnsupportedMediaTypeError) return sendJson(res, 415, { error: err.message });
      if (err instanceof PayloadTooLargeError) return sendJsonAndCloseConnection(res, 413, { error: err.message });
      if (err instanceof SyntaxError) return sendJson(res, 400, { error: err.message });
      sendJson(res, 500, { error: (err as Error).message });
    }
  });

  async function handleData(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    try {
      const payload = await authorize(issuer, req, ["one", "two", "three", "sdk", "zero"]);
      const requestedPath = decodeURIComponent(url.pathname.slice("/data/".length))
        .split("/")
        .filter(Boolean);

      const appBlock = basename(pipeline.basePath);
      const path = [appBlock, ...requestedPath];

      if (appBlock === SHIP_ROOT_BLOCK) return sendError(res, 403, 6);

      const role = payload.dataRole ?? null;

      if (req.method === "GET" && url.searchParams.get("list") === "true") {
        return sendJson(res, 200, await dataStore.list(path));
      }
      if (req.method === "GET") {
        return sendJson(res, 200, await dataStore.readAs(role, path));
      }
      if (req.method === "PUT") {
        const value = await readJsonBody(req);
        await dataStore.writeAs(role, path, value);
        return sendJson(res, 200, { ok: true });
      }
      if (req.method === "DELETE") {
        await dataStore.removeAs(role, path);
        return sendJson(res, 200, { ok: true });
      }
      return sendJson(res, 405, { error: "method not allowed" });
    } catch (err) {
      if (err instanceof UnauthorizedError) return sendError(res, 401, 5);
      if (err instanceof ForbiddenError) return sendError(res, 403, 6);
      if (err instanceof AccessDeniedError) return sendError(res, 403, 6);
      if (err instanceof BlockNotFoundError) return sendJson(res, 404, { error: "not found" });
      if (err instanceof UnsupportedMediaTypeError) return sendJson(res, 415, { error: err.message });
      if (err instanceof PayloadTooLargeError) return sendJsonAndCloseConnection(res, 413, { error: err.message });
      if (err instanceof SyntaxError) return sendJson(res, 400, { error: err.message });
      sendJson(res, 500, { error: (err as Error).message });
    }
  }

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== "/agent/stream") {
      socket.destroy();
      return;
    }

    const token = url.searchParams.get("token") ?? "";
    issuer
      .verify(token)
      .then(() => {
        wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws));
      })
      .catch(() => socket.destroy());
  });

  pipeline.onTick((tick) => {
    const payload = JSON.stringify({ type: "tick", ...tick });
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) client.send(payload);
    }
  });

  const sockets = new Set<Socket>();
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });

  const originalClose = server.close.bind(server);
  server.close = ((callback?: (err?: Error) => void) => {
    for (const client of wss.clients) client.terminate();
    for (const socket of sockets) socket.destroy();
    return originalClose(callback);
  }) as typeof server.close;

  return server;
}
