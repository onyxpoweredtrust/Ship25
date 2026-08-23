// Datasets Access
// designed and built by onyxlabs.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseDataset } from "../Dataset/index.js";
import { SUDO_FILENAME, isShipRoot, type BlockPath } from "./Path.js";

export const SHIP_OWNER = Symbol("ship-owner");

export type Role = string | typeof SHIP_OWNER;

export interface SudoDeclaration {
  roles: string[];
}

export interface AccessResult {
  allowed: boolean;
  deniedAt?: BlockPath;
}

async function readSudoDeclaration(dirFsPath: string): Promise<SudoDeclaration | null> {
  try {
    const raw = await readFile(join(dirFsPath, SUDO_FILENAME), "utf8");
    const parsed = parseDataset(raw) as { roles?: unknown };
    if (!Array.isArray(parsed.roles)) return null;
    return { roles: parsed.roles.map(String) };
  } catch {
    return null;
  }
}

export async function checkAccess(
  dataRoot: string,
  path: BlockPath,
  role: Role | null
): Promise<AccessResult> {
  if (isShipRoot(path)) {
    return role === SHIP_OWNER ? { allowed: true } : { allowed: false, deniedAt: [path[0]] };
  }

  let fsPath = dataRoot;
  for (let i = 0; i < path.length; i++) {
    fsPath = join(fsPath, path[i]);
    const declaration = await readSudoDeclaration(fsPath);
    const permitted = typeof role === "string" && declaration?.roles.includes(role);
    if (declaration && !permitted) {
      return { allowed: false, deniedAt: path.slice(0, i + 1) };
    }
  }

  return { allowed: true };
}

export function serializeSudoDeclaration(roles: string[]): string {
  return `roles(${roles.join(", ")})`;
}
