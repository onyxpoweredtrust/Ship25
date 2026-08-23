// Agent Native
// designed and built by onyxlabs.

import { access, readdir, readFile as fsReadFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { DetectorFilesystem } from "./Filesystem.js";

export function createNodeFilesystem(rootPath: string): DetectorFilesystem {
  const resolve = (path: string) => join(rootPath, path);

  return {
    async hasPath(path: string) {
      try {
        await access(resolve(path));
        return true;
      } catch {
        return false;
      }
    },
    async isFile(path: string) {
      try {
        return (await stat(resolve(path))).isFile();
      } catch {
        return false;
      }
    },
    async readFile(path: string) {
      return fsReadFile(resolve(path), "utf8");
    },
    async listFiles(dir: string) {
      try {
        const entries = await readdir(resolve(dir), { withFileTypes: true });
        return entries.filter((e) => e.isFile()).map((e) => e.name);
      } catch {
        return [];
      }
    },
  };
}
