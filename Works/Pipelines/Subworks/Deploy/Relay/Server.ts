// Pipelines Server
// designed and built by onyxlabs.

import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import crypto from "node:crypto";
import { WebSocketServer, WebSocket } from "../../Vendor/Ws/wrapper.mjs";
import { createOwnershipStore } from "./Ownership.js";
import { verifyRelayAdminToken } from "./AdminAuth.js";
import type { ClientToRelayMessage, RelayToClientMessage, TunnelResponseMessage } from "../Types.js";
import type { Store } from "@ship/datasets";

export interface RelayMailTransport {
  send(message: { to: string; subject: string; html: string }): Promise<void>;
}

export interface RelayOptions {
  publicPort: number; // real internet-facing traffic, the admin API, and the tunnel (upgraded on /tunnel)
  adminKey: Uint8Array; // the relay's own signing key — see AdminAuth.ts
  store: Store; // One's real Store — ownership records live under `_Relay/Claims/*`
  mail?: RelayMailTransport;
  requestTimeoutMs?: number;
  tls?: { certPath: string; keyPath: string };
}

export interface RelayHandle {
  close: () => Promise<void>;
}

interface PendingRequest {
  resolve: (msg: TunnelResponseMessage) => void;
  timer: ReturnType<typeof setTimeout>;
}

const MAX_REQUEST_BODY_BYTES = 10 * 1024 * 1024; // 10MB — tunnel traffic isn't meant for large uploads

export async function createRelay(opts: RelayOptions): Promise<RelayHandle> {
  const ownership = createOwnershipStore(opts.store);
  const live = new Map<string, WebSocket>(); // name -> currently-connected tunnel socket
  const pending = new Map<string, PendingRequest>(); // request id -> awaiting response
  const timeoutMs = opts.requestTimeoutMs ?? 15_000;

  function send(ws: WebSocket, msg: RelayToClientMessage): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (ws) => {
    let claimedName: string | null = null;

    ws.on("message", (raw) => {
      let msg: ClientToRelayMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (msg.type === "claim") {
        const name = msg.name.toLowerCase();
        void ownership.claim(name, msg.identity, msg.email).then((result) => {
          if (!result.ok) {
            send(ws, { type: "claim.denied", name: msg.name, reason: result.reason ?? "claim denied" });
            return;
          }
          claimedName = name;
          live.set(name, ws);
          send(ws, { type: "claim.ok", name: msg.name });
        });
        return;
      }

      if (msg.type === "response") {
        const p = pending.get(msg.id);
        if (!p) return;
        clearTimeout(p.timer);
        pending.delete(msg.id);
        p.resolve(msg);
      }
    });

    ws.on("close", () => {
      if (claimedName && live.get(claimedName) === ws) live.delete(claimedName);
    });
  });

  const publicHandler = (req: http.IncomingMessage, res: http.ServerResponse): void => {
    if (req.url?.startsWith("/admin/")) {
      void handleAdmin(req, res);
      return;
    }

    const host = req.headers.host ?? "";
    const name = (host.split(".")[0] ?? "").toLowerCase();
    const ws = live.get(name);

    if (!ws) {
      res.writeHead(502, { "Content-Type": "text/plain" });
      res.end(`${name} is not currently reachable — the machine serving it may be offline`);
      return;
    }

    const chunks: Buffer[] = [];
    let size = 0;
    let aborted = false;
    req.on("data", (c: Buffer) => {
      if (aborted) return;
      size += c.length;
      if (size > MAX_REQUEST_BODY_BYTES) {
        aborted = true;
        res.writeHead(413, { "Content-Type": "text/plain" });
        res.end("request body too large");
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (aborted) return;
      const id = crypto.randomUUID();
      const body = Buffer.concat(chunks);

      const timer = setTimeout(() => {
        pending.delete(id);
        res.writeHead(504, { "Content-Type": "text/plain" });
        res.end("tunnel request timed out");
      }, timeoutMs);

      pending.set(id, {
        timer,
        resolve: (msg) => {
          res.writeHead(msg.status, msg.headers);
          res.end(msg.bodyBase64 ? Buffer.from(msg.bodyBase64, "base64") : undefined);
        },
      });

      send(ws, {
        type: "request",
        id,
        method: req.method ?? "GET",
        path: req.url ?? "/",
        headers: flattenHeaders(req.headers),
        bodyBase64: body.length ? body.toString("base64") : null,
      });
    });
  };

  if (!opts.tls) console.warn("[ship/three/relay] no TLS configured — serving public traffic over plain HTTP");

  const publicServer = opts.tls
    ? https.createServer({ cert: fs.readFileSync(opts.tls.certPath), key: fs.readFileSync(opts.tls.keyPath) }, publicHandler)
    : http.createServer(publicHandler);

  async function handleAdmin(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const auth = req.headers.authorization;
    const token = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : undefined;
    if (!token || !(await verifyRelayAdminToken(opts.adminKey, token))) {
      res.writeHead(401).end("unauthorized");
      return;
    }
    if (req.method === "POST" && req.url === "/admin/reclaim") {
      let body = "";
      let size = 0;
      req.on("data", (c: Buffer) => {
        size += c.length;
        if (size > MAX_REQUEST_BODY_BYTES) {
          res.writeHead(413).end("payload too large");
          return;
        }
        body += c;
      });
      req.on("end", () => {
        void (async () => {
          try {
            const { name: rawName, reason } = JSON.parse(body) as { name: string; reason: string };
            const name = rawName.toLowerCase();
            const cleared = await ownership.reclaim(name);
            const ws = live.get(name);
            if (ws) {
              send(ws, { type: "reclaimed", name, reason });
              live.delete(name);
            }
            if (cleared?.email && opts.mail) {
              await opts.mail.send({
                to: cleared.email,
                subject: `${name}.onyxpowered.com was reclaimed`,
                html: `<p>${name}.onyxpowered.com was reclaimed by onyxlabs.</p><p>Reason: ${reason}</p><p>If you believe this was in error, contact us.</p>`,
              });
            }
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true, wasOwnedBy: cleared?.identity ?? null, notified: !!(cleared?.email && opts.mail) }));
          } catch {
            res.writeHead(400).end("bad request");
          }
        })();
      });
      return;
    }
    res.writeHead(404).end();
  }

  publicServer.on("upgrade", (req, socket, head) => {
    if (req.url !== "/tunnel") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  await new Promise<void>((resolve, reject) => {
    publicServer.listen(opts.publicPort, () => resolve());
    publicServer.on("error", reject);
  });

  return {
    async close() {
      for (const p of pending.values()) clearTimeout(p.timer);
      pending.clear();
      await new Promise<void>((r) => publicServer.close(() => r()));
    },
  };
}

function flattenHeaders(h: http.IncomingHttpHeaders): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) {
    if (typeof v === "string") out[k] = v;
    else if (Array.isArray(v)) out[k] = v.join(", ");
  }
  return out;
}
