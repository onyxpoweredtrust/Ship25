// Agent Registry
// designed and built by onyxlabs.

import type { DetectorFilesystem } from "../Search/Filesystem.js";
import type { ScanResult } from "../Search/Scanner.js";
import type { RuntimeSlug } from "../Search/Signatures.js";
import { resolveEntrypoint, type Entrypoint } from "./Resolve.js";
import { loadAppConfig } from "./Config.js";

export interface Module {
  id: string;
  path: string;
  runtime: ScanResult["slug"];
  entrypoint: Entrypoint | null;
}

export function moduleId(basePath: string, runtime: RuntimeSlug): string {
  return `${basePath}:${runtime}`;
}

export interface ModuleRegistry {
  register(mod: Module): void;
  unregister(id: string): void;
  list(): Module[];
}

export function createRegistry(): ModuleRegistry {
  const modules = new Map<string, Module>();
  return {
    register(mod) {
      modules.set(mod.id, mod);
    },
    unregister(id) {
      modules.delete(id);
    },
    list() {
      return [...modules.values()];
    },
  };
}

export async function importScanResults(
  registry: ModuleRegistry,
  basePath: string,
  results: ScanResult[],
  fs: DetectorFilesystem
): Promise<void> {
  const config = await loadAppConfig(fs);

  for (const result of results) {
    const entrypoint = config?.entrypoint ?? (await resolveEntrypoint(fs, result.slug));
    registry.register({ id: moduleId(basePath, result.slug), path: basePath, runtime: result.slug, entrypoint });
  }
}
