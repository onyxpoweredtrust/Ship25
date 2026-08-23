// Scaffold Atlas
// designed and built by onyxlabs.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface AppLocationEntry {
  appId: string;
  path: string;
  registeredAt: string;
  lastSeenAt: string;
}

export const REGISTRY_PATH = join(homedir(), ".zero", "apps.json");

async function readRegistry(path: string): Promise<AppLocationEntry[]> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return [];
  }
}

async function writeRegistry(path: string, entries: AppLocationEntry[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(entries, null, 2), "utf8");
}

export async function registerAppLocation(
  appId: string,
  path: string,
  registryPath: string = REGISTRY_PATH
): Promise<void> {
  const entries = await readRegistry(registryPath);
  const now = new Date().toISOString();
  const existing = entries.find((e) => e.appId === appId);

  if (existing) {
    existing.path = path;
    existing.lastSeenAt = now;
  } else {
    entries.push({ appId, path, registeredAt: now, lastSeenAt: now });
  }

  await writeRegistry(registryPath, entries);
}

export async function listRegisteredApps(registryPath: string = REGISTRY_PATH): Promise<AppLocationEntry[]> {
  return readRegistry(registryPath);
}

export function mostRecentApp(entries: AppLocationEntry[]): AppLocationEntry | null {
  if (entries.length === 0) return null;
  return entries.reduce((a, b) => (b.lastSeenAt > a.lastSeenAt ? b : a));
}

export interface LocateResult {
  appId: string;
  expectedPath: string | null;
  drifted: boolean;
}

export async function locateApp(
  appId: string,
  currentPath: string,
  registryPath: string = REGISTRY_PATH
): Promise<LocateResult> {
  const entries = await readRegistry(registryPath);
  const entry = entries.find((e) => e.appId === appId);

  if (!entry) return { appId, expectedPath: null, drifted: false };

  const drifted = entry.path !== currentPath;
  entry.lastSeenAt = new Date().toISOString();
  await writeRegistry(registryPath, entries);

  return { appId, expectedPath: entry.path, drifted };
}
