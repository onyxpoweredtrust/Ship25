// Three @ Onyx Ship
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { EventEmitter } from "node:events";

export declare class WebSocket extends EventEmitter {
  static readonly CONNECTING: 0;
  static readonly OPEN: 1;
  static readonly CLOSING: 2;
  static readonly CLOSED: 3;
  readonly OPEN: 1;
  readyState: 0 | 1 | 2 | 3;
  constructor(address: string);
  on(event: "open" | "close" | "error", listener: () => void): this;
  on(event: "message", listener: (data: Buffer) => void): this;
  send(data: string): void;
  close(): void;
  /** Forcibly ends the underlying connection — no close handshake, used for a real hard shutdown. */
  terminate(): void;
}

export declare class WebSocketServer extends EventEmitter {
  clients: Set<WebSocket>;
  constructor(options: { noServer: true });
  on(event: "connection", listener: (ws: WebSocket, request: IncomingMessage) => void): this;
  handleUpgrade(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    callback: (ws: WebSocket) => void
  ): void;
}
