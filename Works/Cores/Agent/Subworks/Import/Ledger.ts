// Agent Ledger
// designed and built by onyxlabs.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { RuntimeSlug } from "../Search/Signatures.js";

export interface LedgerEntry {
  name: string;
  runtime: RuntimeSlug | null;
  entrypoint: string | null;
  addedAt: string;
}

export function ledgerPath(appPath: string): string {
  return join(appPath, ".zero", "modules.json");
}

async function readLedger(path: string): Promise<LedgerEntry[]> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return [];
  }
}

async function writeLedger(path: string, entries: LedgerEntry[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(entries, null, 2), "utf8");
}

export async function listModules(appPath: string): Promise<LedgerEntry[]> {
  return readLedger(ledgerPath(appPath));
}

export async function addModule(
  appPath: string,
  entry: Omit<LedgerEntry, "addedAt">
): Promise<LedgerEntry> {
  const path = ledgerPath(appPath);
  const entries = await readLedger(path);

  if (entries.some((e) => e.name === entry.name)) {
    throw new Error(`a module named "${entry.name}" is already registered`);
  }

  const full: LedgerEntry = { ...entry, addedAt: new Date().toISOString() };
  entries.push(full);
  await writeLedger(path, entries);
  return full;
}

export async function removeModule(appPath: string, name: string): Promise<boolean> {
  const path = ledgerPath(appPath);
  const entries = await readLedger(path);
  const next = entries.filter((e) => e.name !== name);
  if (next.length === entries.length) return false;

  await writeLedger(path, next);
  return true;
}

export async function editModule(
  appPath: string,
  name: string,
  changes: Partial<Pick<LedgerEntry, "name" | "entrypoint" | "runtime">>
): Promise<LedgerEntry | null> {
  const path = ledgerPath(appPath);
  const entries = await readLedger(path);
  const entry = entries.find((e) => e.name === name);
  if (!entry) return null;

  Object.assign(entry, changes);
  await writeLedger(path, entries);
  return entry;
}
