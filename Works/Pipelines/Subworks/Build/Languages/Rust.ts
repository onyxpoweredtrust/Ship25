// Pipelines Rust
// designed and built by onyxlabs.

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { run } from "../Core/Run.js";
import type { BuildEngine, BuildResult, BuildOptions } from "../Core/Registry.js";
import { listFiles } from "./ListFiles.js";

function binaryName(root: string): string {
  try {
    const toml = fs.readFileSync(path.join(root, "Cargo.toml"), "utf8");
    const m = toml.match(/^\s*name\s*=\s*"([^"]+)"/m);
    if (m?.[1]) return path.basename(m[1]);
  } catch {
  }
  return path.basename(root);
}

export const rustEngine: BuildEngine = {
  name: "rust",

  detect(root) {
    return fs.existsSync(path.join(root, "Cargo.toml"));
  },

  async build(root, _fs, opts?: BuildOptions): Promise<BuildResult> {
    const outDir = opts?.outDir ?? path.join(root, "dist");
    const binName = binaryName(root);
    const env = { ...process.env, ...(opts?.env ?? {}) };
    const steps = [];

    steps.push(await run("rust", "compile", "cargo build --release", { cwd: root, env }));

    fs.mkdirSync(outDir, { recursive: true });
    const built = path.join(root, "target", "release", binName);
    if (fs.existsSync(built)) fs.copyFileSync(built, path.join(outDir, binName));

    return { engine: "rust", outDir, duration: steps.reduce((s, r) => s + r.duration, 0), files: listFiles(outDir), steps };
  },

  dev(root): Promise<void> {
    const child = spawn("cargo", ["run"], { cwd: root, stdio: "inherit" });
    return new Promise((_, reject) => child.on("exit", (code) => reject(new Error(`dev exited: ${code}`))));
  },

  start(root, _fs, opts?: BuildOptions): Promise<void> {
    const outDir = opts?.outDir ?? path.join(root, "dist");
    const binPath = path.join(outDir, binaryName(root));
    const child = spawn(binPath, [], { cwd: root, stdio: "inherit" });
    return new Promise((_, reject) => child.on("exit", (code) => reject(new Error(`start exited: ${code}`))));
  },
};
