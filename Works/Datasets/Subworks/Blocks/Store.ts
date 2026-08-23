// Datasets Store
// designed and built by onyxlabs.

import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { parseDataset, serializeDataset } from "../Dataset/index.js";
import { toFsPath, toLeafFsPath, LEAF_EXTENSION, SUDO_FILENAME, type BlockPath } from "./Path.js";
import { checkAccess, serializeSudoDeclaration, type Role } from "./Access.js";

/** Where every Store lives unless a caller passes an explicit path — the single
 * source of truth other packages (Cores' Gateway, Connectors' Cli) reuse rather
 * than hardcoding "~/.ship/data" themselves. */
export const DEFAULT_DATA_ROOT = join(homedir(), ".ship", "data");

export class AccessDeniedError extends Error {
  constructor(readonly path: BlockPath, readonly deniedAt: BlockPath) {
    super(`access denied at "${deniedAt.join("/")}" for path "${path.join("/")}"`);
    this.name = "AccessDeniedError";
  }
}

export class BlockNotFoundError extends Error {
  constructor(readonly path: BlockPath) {
    super(`no data at "${path.join("/")}"`);
    this.name = "BlockNotFoundError";
  }
}

export interface Store {
  read(path: BlockPath): Promise<unknown>;
  write(path: BlockPath, value: unknown): Promise<void>;
  remove(path: BlockPath): Promise<void>;
  list(path: BlockPath): Promise<string[]>;
  exists(path: BlockPath): Promise<boolean>;

  readAs(role: Role | null, path: BlockPath): Promise<unknown>;
  writeAs(role: Role | null, path: BlockPath, value: unknown): Promise<void>;
  removeAs(role: Role | null, path: BlockPath): Promise<void>;

  declareSudoblock(path: BlockPath, roles: string[]): Promise<void>;
}

export function createStore(dataRoot: string): Store {
  async function read(path: BlockPath): Promise<unknown> {
    const fsPath = toLeafFsPath(dataRoot, path);
    let raw: string;
    try {
      raw = await readFile(fsPath, "utf8");
    } catch {
      throw new BlockNotFoundError(path);
    }
    return parseDataset(raw);
  }

  async function write(path: BlockPath, value: unknown): Promise<void> {
    const fsPath = toLeafFsPath(dataRoot, path);
    await mkdir(dirname(fsPath), { recursive: true });
    await writeFile(fsPath, serializeDataset(value), "utf8");
  }

  async function remove(path: BlockPath): Promise<void> {
    const leafPath = toLeafFsPath(dataRoot, path);
    const dirPath = toFsPath(dataRoot, path);
    await rm(leafPath, { force: true });
    await rm(dirPath, { recursive: true, force: true });
  }

  async function list(path: BlockPath): Promise<string[]> {
    const fsPath = toFsPath(dataRoot, path);
    let entries: string[];
    try {
      entries = await readdir(fsPath);
    } catch {
      return [];
    }
    return entries
      .filter((e) => e !== SUDO_FILENAME)
      .map((e) => (e.endsWith(LEAF_EXTENSION) ? e.slice(0, -LEAF_EXTENSION.length) : e));
  }

  async function exists(path: BlockPath): Promise<boolean> {
    const leafPath = toLeafFsPath(dataRoot, path);
    const dirPath = toFsPath(dataRoot, path);
    for (const p of [leafPath, dirPath]) {
      try {
        await stat(p);
        return true;
      } catch {
      }
    }
    return false;
  }

  async function readAs(role: Role | null, path: BlockPath): Promise<unknown> {
    const access = await checkAccess(dataRoot, path, role);
    if (!access.allowed) throw new AccessDeniedError(path, access.deniedAt!);
    return read(path);
  }

  async function writeAs(role: Role | null, path: BlockPath, value: unknown): Promise<void> {
    const access = await checkAccess(dataRoot, path, role);
    if (!access.allowed) throw new AccessDeniedError(path, access.deniedAt!);
    return write(path, value);
  }

  async function removeAs(role: Role | null, path: BlockPath): Promise<void> {
    const access = await checkAccess(dataRoot, path, role);
    if (!access.allowed) throw new AccessDeniedError(path, access.deniedAt!);
    return remove(path);
  }

  async function declareSudoblock(path: BlockPath, roles: string[]): Promise<void> {
    const fsPath = toFsPath(dataRoot, path);
    await mkdir(fsPath, { recursive: true });
    await writeFile(join(fsPath, SUDO_FILENAME), serializeSudoDeclaration(roles), "utf8");
  }

  return { read, write, remove, list, exists, readAs, writeAs, removeAs, declareSudoblock };
}
