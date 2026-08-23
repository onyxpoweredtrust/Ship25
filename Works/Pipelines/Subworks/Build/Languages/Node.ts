// Pipelines Node
// designed and built by onyxlabs.

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { run } from "../Core/Run.js";
import { copyProject } from "../Core/Copy.js";
import type { BuildEngine, BuildResult, BuildOptions } from "../Core/Registry.js";
import { listFiles } from "./ListFiles.js";

function pkgManager(root: string): string {
  if (fs.existsSync(path.join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(root, "yarn.lock"))) return "yarn";
  return "npm";
}

function resolveEntry(outDir: string): string {
  for (const c of ["index.js", "src/index.js"]) {
    const full = path.join(outDir, c);
    if (fs.existsSync(full)) return full;
  }
  throw new Error(`[ship/three/build/node] no entrypoint found in ${outDir} (index.js, src/index.js)`);
}

export const nodeEngine: BuildEngine = {
  name: "node",

  detect(root) {
    return fs.existsSync(path.join(root, "package.json"));
  },

  async build(root, _fs, opts?: BuildOptions): Promise<BuildResult> {
    const outDir = opts?.outDir ?? path.join(root, "dist");
    const pm = pkgManager(root);
    const env = { ...process.env, ...(opts?.env ?? {}) };
    const steps = [];

    steps.push(await run("node", "install", `${pm} install`, { cwd: root, env }));

    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as { scripts?: Record<string, string> };
    if (pkg.scripts?.build) {
      steps.push(await run("node", "compile", `${pm} run build`, { cwd: root, env }));
    } else if (fs.existsSync(path.join(root, "tsconfig.json"))) {
      steps.push(await run("node", "compile", "npx tsc --incremental", { cwd: root, env }));
    } else {
      // Plain JS with no build script and no tsconfig — there's nothing to
      // compile, so the "build" is just the source itself. Without this, outDir
      // never gets created and the build silently reports 0 files.
      const copyStart = Date.now();
      copyProject(root, outDir);
      steps.push({ step: "copy", command: "copy project files", duration: Date.now() - copyStart, exitCode: 0, stdout: "", stderr: "" });
    }

    return { engine: "node", outDir, duration: steps.reduce((s, r) => s + r.duration, 0), files: listFiles(outDir), steps };
  },

  dev(root): Promise<void> {
    const entry = fs.existsSync(path.join(root, "src", "index.ts")) ? path.join(root, "src", "index.ts") : "src/index.js";
    const child = spawn("npx", ["tsx", "--watch", entry], { cwd: root, stdio: "inherit", shell: true });
    return new Promise((_, reject) => child.on("exit", (code) => reject(new Error(`dev exited: ${code}`))));
  },

  start(root, _fs, opts?: BuildOptions): Promise<void> {
    const outDir = opts?.outDir ?? path.join(root, "dist");
    const pm = pkgManager(root);
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as { scripts?: Record<string, string> };

    const child = pkg.scripts?.start
      ? spawn(pm, ["run", "start"], { cwd: root, stdio: "inherit", shell: true })
      : spawn("node", [resolveEntry(outDir)], { cwd: root, stdio: "inherit" });

    return new Promise((_, reject) => child.on("exit", (code) => reject(new Error(`start exited: ${code}`))));
  },
};
