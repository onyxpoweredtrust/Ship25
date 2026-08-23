// Pipelines Python
// designed and built by onyxlabs.

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { run, probe } from "../Core/Run.js";
import { copyProject } from "../Core/Copy.js";
import type { BuildEngine, BuildResult, BuildOptions } from "../Core/Registry.js";
import { listFiles } from "./ListFiles.js";

function pythonBin(root: string): string {
  const venvPy = path.join(root, ".venv", "bin", "python");
  if (fs.existsSync(venvPy)) return venvPy;
  for (const bin of ["python3", "python"]) {
    if (probe(`${bin} --version`, root)) return bin;
  }
  throw new Error("[ship/three/build/python] python not found — install Python 3 or create a .venv");
}

function entrypoint(root: string): string {
  for (const c of ["main.py", "app.py", "server.py", "src/main.py", "src/app.py"]) {
    if (fs.existsSync(path.join(root, c))) return c;
  }
  throw new Error("[ship/three/build/python] no entrypoint found (main.py, app.py, server.py)");
}

export const pythonEngine: BuildEngine = {
  name: "python",

  detect(root) {
    return (
      fs.existsSync(path.join(root, "requirements.txt")) ||
      fs.existsSync(path.join(root, "pyproject.toml")) ||
      fs.existsSync(path.join(root, "setup.py"))
    );
  },

  async build(root, _fs, opts?: BuildOptions): Promise<BuildResult> {
    const outDir = opts?.outDir ?? path.join(root, "dist");
    const py = pythonBin(root);
    const env = { ...process.env, ...(opts?.env ?? {}) };
    const steps = [];

    if (fs.existsSync(path.join(root, "requirements.txt"))) {
      steps.push(await run("python", "install", `${py} -m pip install -r requirements.txt --quiet`, { cwd: root, env }));
    } else if (fs.existsSync(path.join(root, "pyproject.toml"))) {
      steps.push(await run("python", "install", `${py} -m pip install -e . --quiet`, { cwd: root, env }));
    }

    const copyStart = Date.now();
    copyProject(root, outDir);
    steps.push({ step: "copy", command: "copy project files", duration: Date.now() - copyStart, exitCode: 0, stdout: "", stderr: "" });

    return { engine: "python", outDir, duration: steps.reduce((s, r) => s + r.duration, 0), files: listFiles(outDir), steps };
  },

  dev(root): Promise<void> {
    const py = pythonBin(root);
    const entry = entrypoint(root);
    const child = spawn(py, [entry], { cwd: root, stdio: "inherit" });
    return new Promise((_, reject) => child.on("exit", (code) => reject(new Error(`dev exited: ${code}`))));
  },

  start(_root, _fs, opts?: BuildOptions): Promise<void> {
    const outDir = opts?.outDir ?? path.join(_root, "dist");
    const py = pythonBin(outDir);
    const entry = entrypoint(outDir);
    const child = spawn(py, [entry], { cwd: outDir, stdio: "inherit" });
    return new Promise((_, reject) => child.on("exit", (code) => reject(new Error(`start exited: ${code}`))));
  },
};
