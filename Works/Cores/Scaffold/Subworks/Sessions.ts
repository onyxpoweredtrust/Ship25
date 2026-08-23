// Scaffold Sessions
// designed and built by onyxlabs.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface Session {
  port: number;
  appPath: string;
  pid: number;
  startedAt: string;
}

export const SESSIONS_PATH = join(homedir(), ".zero", "sessions.json");

async function read(path: string): Promise<Session[]> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return [];
  }
}

async function write(path: string, sessions: Session[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(sessions, null, 2), "utf8");
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function recordSession(
  port: number,
  appPath: string,
  path: string = SESSIONS_PATH
): Promise<void> {
  const sessions = (await read(path)).filter((s) => s.port !== port && isAlive(s.pid));
  sessions.push({ port, appPath, pid: process.pid, startedAt: new Date().toISOString() });
  await write(path, sessions);
}

export async function endSession(port: number, path: string = SESSIONS_PATH): Promise<void> {
  const sessions = (await read(path)).filter((s) => s.port !== port);
  await write(path, sessions);
}

export async function findSessionByPort(
  port: number,
  path: string = SESSIONS_PATH
): Promise<Session | null> {
  const sessions = await listActiveSessions(path);
  return sessions.find((s) => s.port === port) ?? null;
}

export async function listActiveSessions(path: string = SESSIONS_PATH): Promise<Session[]> {
  return (await read(path)).filter((s) => isAlive(s.pid));
}
