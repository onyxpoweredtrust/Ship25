// Security Revocations
// designed and built by onyxlabs.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const REVOCATIONS_PATH = join(homedir(), ".zero", "revoked.json");

export const MAX_REVOCATIONS = 1000;

export interface RevocationStore {
  has(token: string): Promise<boolean>;
  add(token: string, exp: number): Promise<void>;
}

interface RevokedEntry {
  token: string;
  exp: number;
}

export function createPersistedRevocationStore(
  path: string = REVOCATIONS_PATH,
  maxEntries: number = MAX_REVOCATIONS
): RevocationStore {
  async function read(): Promise<RevokedEntry[]> {
    try {
      const entries: RevokedEntry[] = JSON.parse(await readFile(path, "utf8"));
      const now = Date.now();
      return entries.filter((e) => e.exp > now);
    } catch {
      return [];
    }
  }

  async function write(entries: RevokedEntry[]): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(entries, null, 2), "utf8");
  }

  return {
    async has(token) {
      const entries = await read();
      return entries.some((e) => e.token === token);
    },
    async add(token, exp) {
      let entries = await read();
      if (!entries.some((e) => e.token === token)) entries.push({ token, exp });

      if (entries.length > maxEntries) {
        entries = entries.sort((a, b) => b.exp - a.exp).slice(0, maxEntries);
      }

      await write(entries);
    },
  };
}

export function createInMemoryRevocationStore(): RevocationStore {
  const revoked = new Map<string, number>();
  return {
    async has(token) {
      return revoked.has(token);
    },
    async add(token, exp) {
      revoked.set(token, exp);
    },
  };
}
