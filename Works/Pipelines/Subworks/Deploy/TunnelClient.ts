// Pipelines TunnelClient
// designed and built by onyxlabs.

import http from "node:http";
import { WebSocket } from "../Vendor/Ws/wrapper.mjs";
import type { RelayToClientMessage, ClientToRelayMessage, TunnelRequestMessage } from "./Types.js";

export interface TunnelOptions {
  relayUrl: string; // e.g. ws://localhost:7781 (tests) or wss://relay.onyxpowered.com
  name: string;
  identity: string;
  localPort: number;
  email?: string;
  onStatus?: (status: "connecting" | "claimed" | "denied" | "reclaimed" | "disconnected", detail?: string) => void;
}

export interface TunnelHandle {
  close: () => void;
}

export function connectTunnel(opts: TunnelOptions): TunnelHandle {
  let ws: WebSocket | null = null;
  let closed = false;
  let backoffMs = 1000;

  function connect(): void {
    if (closed) return;
    opts.onStatus?.("connecting");
    ws = new WebSocket(`${opts.relayUrl}/tunnel`);

    ws.on("open", () => {
      backoffMs = 1000;
      send({ type: "claim", name: opts.name, identity: opts.identity, email: opts.email });
    });

    ws.on("message", (raw) => {
      let msg: RelayToClientMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      handleMessage(msg);
    });

    ws.on("close", () => {
      if (closed) return;
      opts.onStatus?.("disconnected");
      setTimeout(connect, backoffMs);
      backoffMs = Math.min(backoffMs * 2, 30_000);
    });

    ws.on("error", () => {
    });
  }

  function send(msg: ClientToRelayMessage): void {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  function handleMessage(msg: RelayToClientMessage): void {
    if (msg.type === "claim.ok") {
      opts.onStatus?.("claimed");
      return;
    }

    if (msg.type === "claim.denied") {
      opts.onStatus?.("denied", msg.reason);
      closed = true;
      ws?.close();
      return;
    }

    if (msg.type === "reclaimed") {
      opts.onStatus?.("reclaimed", msg.reason);
      closed = true;
      ws?.close();
      return;
    }

    if (msg.type === "request") {
      void proxyRequest(msg);
      return;
    }
  }

  async function proxyRequest(msg: TunnelRequestMessage): Promise<void> {
    const body = msg.bodyBase64 ? Buffer.from(msg.bodyBase64, "base64") : undefined;

    const req = http.request(
      { host: "localhost", port: opts.localPort, method: msg.method, path: msg.path, headers: msg.headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const responseBody = Buffer.concat(chunks);
          send({
            type: "response",
            id: msg.id,
            status: res.statusCode ?? 502,
            headers: flattenHeaders(res.headers),
            bodyBase64: responseBody.length ? responseBody.toString("base64") : null,
          });
        });
      }
    );

    req.on("error", () => {
      send({ type: "response", id: msg.id, status: 502, headers: {}, bodyBase64: null });
    });

    req.end(body);
  }

  connect();

  return {
    close() {
      closed = true;
      ws?.close();
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
