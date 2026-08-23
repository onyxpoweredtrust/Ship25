// Pipelines Static
// designed and built by onyxlabs.

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { copyProject } from "../Core/Copy.js";
import type { BuildEngine, BuildResult, BuildOptions } from "../Core/Registry.js";
import { listFiles } from "./ListFiles.js";

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
};

function serve(dir: string): Promise<void> {
  const port = 3000;

  const server = http.createServer((req, res) => {
    let filePath = path.join(dir, req.url === "/" ? "index.html" : req.url ?? "/");
    if (!fs.existsSync(filePath)) filePath = path.join(dir, "index.html");
    if (!fs.existsSync(filePath)) {
      res.writeHead(404).end("not found");
      return;
    }
    const ext = path.extname(filePath);
    const mime = MIME[ext] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime });
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve, reject) => {
    server.listen(port, () => {
      console.log(`[ship/three/build/static] serving → http://localhost:${port}`);
    });
    server.on("error", reject);
    process.on("SIGINT", () => {
      server.close();
      resolve();
    });
    process.on("SIGTERM", () => {
      server.close();
      resolve();
    });
  });
}

export const staticEngine: BuildEngine = {
  name: "static",

  detect(root) {
    return (
      fs.existsSync(path.join(root, "index.html")) &&
      !fs.existsSync(path.join(root, "package.json")) &&
      !fs.existsSync(path.join(root, "go.mod")) &&
      !fs.existsSync(path.join(root, "Gemfile")) &&
      !fs.existsSync(path.join(root, "Cargo.toml"))
    );
  },

  async build(root, _fs, opts?: BuildOptions): Promise<BuildResult> {
    const outDir = opts?.outDir ?? path.join(root, "dist");
    const steps = [];

    const copyStart = Date.now();
    copyProject(root, outDir);
    steps.push({ step: "copy", command: "copy project files", duration: Date.now() - copyStart, exitCode: 0, stdout: "", stderr: "" });

    return { engine: "static", outDir, duration: steps.reduce((s, r) => s + r.duration, 0), files: listFiles(outDir), steps };
  },

  dev(root): Promise<void> {
    return serve(root);
  },

  start(_root, _fs, opts?: BuildOptions): Promise<void> {
    const outDir = opts?.outDir ?? path.join(_root, "dist");
    return serve(outDir);
  },
};
