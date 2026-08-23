// Scaffold Export
// designed and built by onyxlabs.

import { cp, mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { gatherSystemInfo } from "./Probe.js";
import { listModules } from "@ship/agent";

const EXCLUDED = new Set(["node_modules", ".git", ".zero", "dist", "build"]);

export interface ExportResult {
  outputPath: string;
  manifestPath: string;
}

export async function exportApp(appPath: string, outputRoot?: string): Promise<ExportResult> {
  const appName = basename(appPath);
  const outputPath = outputRoot ?? join(appPath, "..", `${appName}-export`);

  await mkdir(outputPath, { recursive: true });
  await cp(appPath, outputPath, {
    recursive: true,
    filter: (src) => !EXCLUDED.has(basename(src)),
  });

  const systemInfo = await gatherSystemInfo();
  const modules = await listModules(appPath);
  const manifest = {
    appName,
    sourcePath: appPath,
    exportedAt: new Date().toISOString(),
    systemInfo,
    modules,
  };

  const manifestPath = join(outputPath, "export-manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  return { outputPath, manifestPath };
}
