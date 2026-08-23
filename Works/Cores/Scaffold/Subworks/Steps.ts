// Scaffold Steps
// designed and built by onyxlabs.

import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { AgentPipeline } from "@ship/agent";
import { createNodeFilesystem } from "@ship/agent";
import { createSystemInformationStatsSource } from "@ship/agent";
import { ProcessManager } from "@ship/agent";
import { moduleId } from "@ship/agent";
import { findTemplate } from "./Templates/Catalog.js";
import type { IgnitionSteps } from "./Sequence.js";

export function createDefaultIgnitionSteps(processManager: ProcessManager): IgnitionSteps {
  return {
    async isTargetEmpty(path) {
      try {
        return (await readdir(path)).length === 0;
      } catch {
        return true; // doesn't exist yet — fine, will be created on copyTemplate
      }
    },

    async copyTemplate(templateSlug, path) {
      const template = findTemplate(templateSlug);
      if (!template) throw new Error(`unknown template: ${templateSlug}`);

      await mkdir(path, { recursive: true });
      for (const file of template.files) {
        const fullPath = join(path, file.path);
        await mkdir(dirname(fullPath), { recursive: true });
        await writeFile(fullPath, file.contents, "utf8");
      }
    },

    async spawnAgentProcess(path) {
      const templateSlug = await inferTemplateSlug(path);
      const template = findTemplate(templateSlug);
      if (!template) return;

      processManager.spawnModule(moduleId(path, template.runtime), {
        command: template.entrypoint.command,
        args: template.entrypoint.args,
        cwd: path,
        restartOnCrash: true,
      });
    },

    async testDataPull(path) {
      const pipeline = new AgentPipeline({
        fs: createNodeFilesystem(path),
        basePath: path,
        statsSource: createSystemInformationStatsSource(),
        processManager,
      });

      try {
        await pipeline.importFromScan();
        const tick = await pipeline.tickOnce();
        return typeof tick.stats.cpuPercent === "number";
      } catch {
        return false;
      }
    },
  };
}

async function inferTemplateSlug(path: string): Promise<string> {
  const fs = createNodeFilesystem(path);
  if (await fs.hasPath("package.json")) return "node-basic";
  if (await fs.hasPath("go.mod")) return "go-basic";
  if (await fs.hasPath("Gemfile")) return "ruby-basic";
  if (await fs.hasPath("pyproject.toml")) return "python-basic";
  if (await fs.hasPath("Cargo.toml")) return "rust-basic";
  return "";
}
