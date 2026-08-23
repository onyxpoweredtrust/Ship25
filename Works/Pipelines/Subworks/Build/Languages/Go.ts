// Pipelines Go
// designed and built by onyxlabs.

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { run, runArgs } from "../Core/Run.js";
import type { BuildEngine, BuildResult, BuildOptions } from "../Core/Registry.js";
import { listFiles } from "./ListFiles.js";

function binaryName(root: string): string {
  try {
    const mod = fs.readFileSync(path.join(root, "go.mod"), "utf8");
    const line = mod.split("\n").find((l) => l.startsWith("module "));
    if (line) return path.basename(line.replace("module ", "").trim());
  } catch {
  }
  return path.basename(root);
}

export const goEngine: BuildEngine = {
  name: "go",

  detect(root) {
    return fs.existsSync(path.join(root, "go.mod"));
  },

  async build(root, _fs, opts?: BuildOptions): Promise<BuildResult> {
    const outDir = opts?.outDir ?? path.join(root, "dist");
    const binName = binaryName(root);
    const binPath = path.join(outDir, binName);
    const goarch = process.arch === "arm64" ? "arm64" : "amd64";
    const goos = process.platform === "darwin" ? "darwin" : "linux";
    const env = { ...process.env, GOOS: goos, GOARCH: goarch, ...(opts?.env ?? {}) };
    const steps = [];

    steps.push(await run("go", "download", "go mod download", { cwd: root, env }));

    fs.mkdirSync(outDir, { recursive: true });
    steps.push(await runArgs("go", "compile", ["go", "build", "-o", binPath, "."], { cwd: root, env }));

    return { engine: "go", outDir, duration: steps.reduce((s, r) => s + r.duration, 0), files: listFiles(outDir), steps };
  },

  dev(root): Promise<void> {
    const child = spawn("go", ["run", "."], { cwd: root, stdio: "inherit" });
    return new Promise((_, reject) => child.on("exit", (code) => reject(new Error(`dev exited: ${code}`))));
  },

  start(root, _fs, opts?: BuildOptions): Promise<void> {
    const outDir = opts?.outDir ?? path.join(root, "dist");
    const binPath = path.join(outDir, binaryName(root));
    const child = spawn(binPath, [], { cwd: root, stdio: "inherit" });
    return new Promise((_, reject) => child.on("exit", (code) => reject(new Error(`start exited: ${code}`))));
  },
};
