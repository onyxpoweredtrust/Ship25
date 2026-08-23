// Scaffold Shell
// designed and built by onyxlabs.

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const LAST_CD_PATH = join(homedir(), ".zero", "last-cd");

export async function recordLastCdTarget(path: string, marker: string = LAST_CD_PATH): Promise<void> {
  await mkdir(dirname(marker), { recursive: true });
  await writeFile(marker, path, "utf8");
}

export async function consumeLastCdTarget(marker: string = LAST_CD_PATH): Promise<string | null> {
  try {
    const path = await readFile(marker, "utf8");
    await rm(marker, { force: true });
    return path;
  } catch {
    return null;
  }
}
