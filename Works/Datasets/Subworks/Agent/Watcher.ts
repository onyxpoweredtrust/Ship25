// Datasets Watcher
// designed and built by onyxlabs.

import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { AccessDeniedError, type Store } from "../Blocks/Store.js";
import type { Role, BlockPath } from "../Blocks/index.js";

export const DEFAULT_LOG_PATH = join(homedir(), ".ship", "one-agent.log");

export type AuditAction = "read" | "write" | "remove";

export interface AuditEntry {
  timestamp: string;
  action: AuditAction;
  path: string;
  role: string | null;
  allowed: boolean;
  deniedAt?: string;
}

function roleLabel(role: Role | null | undefined): string | null {
  if (role === null || role === undefined) return null;
  return typeof role === "string" ? role : "<ship-owner>";
}

export interface Watcher {
  onEntry(callback: (entry: AuditEntry) => void): void;
  readLog(limit?: number): Promise<AuditEntry[]>;
}

export function watchStore(store: Store, logPath: string = DEFAULT_LOG_PATH): { store: Store; watcher: Watcher } {
  const listeners: ((entry: AuditEntry) => void)[] = [];

  async function log(entry: AuditEntry): Promise<void> {
    for (const cb of listeners) cb(entry);
    await mkdir(dirname(logPath), { recursive: true });
    await appendFile(logPath, JSON.stringify(entry) + "\n", "utf8");
  }

  async function guarded<T>(action: AuditAction, role: Role | null, path: BlockPath, fn: () => Promise<T>): Promise<T> {
    try {
      const result = await fn();
      await log({ timestamp: new Date().toISOString(), action, path: path.join("/"), role: roleLabel(role), allowed: true });
      return result;
    } catch (err) {
      if (err instanceof AccessDeniedError) {
        await log({
          timestamp: new Date().toISOString(),
          action,
          path: path.join("/"),
          role: roleLabel(role),
          allowed: false,
          deniedAt: err.deniedAt.join("/"),
        });
      }
      throw err;
    }
  }

  async function readLog(limit = 100): Promise<AuditEntry[]> {
    try {
      const raw = await readFile(logPath, "utf8");
      const lines = raw.trim().split("\n").filter(Boolean);
      return lines.slice(-limit).map((line) => JSON.parse(line));
    } catch {
      return [];
    }
  }

  const watchedStore: Store = {
    ...store,
    readAs: (role, path) => guarded("read", role, path, () => store.readAs(role, path)),
    writeAs: (role, path, value) => guarded("write", role, path, () => store.writeAs(role, path, value)),
    removeAs: (role, path) => guarded("remove", role, path, () => store.removeAs(role, path)),
  };

  const watcher: Watcher = {
    onEntry(callback) {
      listeners.push(callback);
    },
    readLog,
  };

  return { store: watchedStore, watcher };
}
