// CLI Ignition
// designed and built by onyxlabs.

import { readdir } from "node:fs/promises";
import { join } from "node:path";

const CORE_MODULES = [
  ["Datasets"],
  ["Cores", "Agent"],
  ["Cores", "Security"],
  ["Cores", "Scaffold"],
  ["Connectors"],
  ["Cores"],
  ["Pipelines"],
  ["Cores", "CLI"],
] as const;

export interface ModuleStatus {
  name: string;
  scaffolded: boolean;
}

export interface IgnitionCheckResult {
  shipRoot: string;
  modules: ModuleStatus[];
  lines: string[];
}

async function isScaffolded(path: string): Promise<boolean> {
  try {
    return (await readdir(path)).length > 0;
  } catch {
    return false;
  }
}

export async function checkIgnition(shipRoot: string): Promise<IgnitionCheckResult> {
  const modules: ModuleStatus[] = [];
  for (const mod of CORE_MODULES) {
    const name = mod.join("/");
    modules.push({ name, scaffolded: await isScaffolded(join(shipRoot, "Works", ...mod)) });
  }

  const lines = ["Ship Ignition", "", `Core modules @ ${join(shipRoot, "Works")}`];
  for (const mod of modules) {
    lines.push(`${mod.scaffolded ? "✓" : "○"} ${mod.name}${mod.scaffolded ? "" : "  (not yet scaffolded)"}`);
  }
  lines.push("");
  lines.push(modules.every((m) => m.scaffolded) ? "All Core modules scaffolded." : "Some Core modules are still empty — that's expected this early.");

  return { shipRoot, modules, lines };
}
