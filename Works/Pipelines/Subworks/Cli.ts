// Pipelines Cli
// designed and built by onyxlabs.

import { resolve } from "node:path";
import { createNodeFilesystem } from "@ship/agent";
import { registerBuiltinEngines } from "./Build/index.js";
import { build, buildApp, isMultiPartApp } from "./Build/Core/Registry.js";
import { guidelinesLines } from "./Guidelines.js";
import { THREE_VERSION } from "./Version.js";

let registered = false;
function ensureEngines(): void {
  if (registered) return;
  registerBuiltinEngines();
  registered = true;
}

export const THREE_COMMANDS = ["deploy"] as const;

export async function runThreeCli(args: string[]): Promise<void> {
  const [command, sub] = args;

  if (command === "--version" || command === "-v") {
    console.log(`three ${THREE_VERSION}`);
    return;
  }

  if (command === "guidelines") {
    for (const line of guidelinesLines) console.log(line);
    return;
  }

  if (command !== "deploy") {
    console.error(`Unknown command: ${command}`);
    process.exitCode = 1;
    return;
  }

  if (sub === "--help" || sub === "-h") {
    console.log("Usage: deploy [build] [path]\n\n  deploy         build, then push to the relay\n  deploy build   build only, no deploy");
    return;
  }

  ensureEngines();

  if (sub === "build") {
    const target = resolve(args[2] ?? ".");
    await runBuild(target);
    return;
  }

  const target = resolve(args[1] ?? ".");
  await runBuild(target);
  console.log("Build complete. Pushing to the relay isn't wired into this command yet — see Deploy/index.ts.");
}

async function runBuild(target: string): Promise<void> {
  console.log(`[ship/three] building ${target}`);

  if (isMultiPartApp(target)) {
    const result = await buildApp(target, (dir) => createNodeFilesystem(dir), {
      onEvent: (e) => console.log(`[ship/three] ${e.type} ${e.part}/${e.engine}`),
    });
    for (const part of result.parts) {
      console.log(`[ship/three] ${part.name}: ${part.result.engine} → ${part.result.outDir} (${part.result.files.length} files)`);
    }
    console.log(`[ship/three] done in ${result.duration}ms`);
    return;
  }

  const result = await build(target, createNodeFilesystem(target), {
    onEvent: (e) => console.log(`[ship/three] ${e.type} ${e.part}/${e.engine}`),
  });
  console.log(`[ship/three] ${result.engine} → ${result.outDir} (${result.files.length} files, ${result.duration}ms${result.cached ? ", cached" : ""})`);
}
