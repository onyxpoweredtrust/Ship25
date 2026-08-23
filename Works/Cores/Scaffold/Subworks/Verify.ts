// Scaffold Verify
// designed and built by onyxlabs.

import type { DetectorFilesystem } from "@ship/agent";
import { scan } from "@ship/agent";
import { runtimes, type RuntimeSlug } from "@ship/agent";
import { locateApp, type LocateResult } from "./Atlas.js";

export interface PackageCheckResult {
  runtime: RuntimeSlug;
  ok: boolean;
  detail: string;
}

async function checkNode(fs: DetectorFilesystem): Promise<PackageCheckResult> {
  if (!(await fs.hasPath("package.json"))) {
    return { runtime: "node", ok: false, detail: "no package.json found" };
  }
  const manifest = JSON.parse(await fs.readFile("package.json"));
  const deps = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
  if (deps.length === 0) return { runtime: "node", ok: true, detail: "no dependencies declared" };

  const missing: string[] = [];
  for (const dep of deps) {
    if (!(await fs.hasPath(`node_modules/${dep}`))) missing.push(dep);
  }
  return missing.length === 0
    ? { runtime: "node", ok: true, detail: `${deps.length} dependencies present` }
    : { runtime: "node", ok: false, detail: `missing from node_modules: ${missing.join(", ")}` };
}

async function checkGo(fs: DetectorFilesystem): Promise<PackageCheckResult> {
  const hasSum = await fs.hasPath("go.sum");
  return hasSum
    ? { runtime: "go", ok: true, detail: "go.sum present, dependencies resolved" }
    : { runtime: "go", ok: false, detail: "no go.sum — run `go mod tidy`" };
}

async function checkRuby(fs: DetectorFilesystem): Promise<PackageCheckResult> {
  const hasLock = await fs.hasPath("Gemfile.lock");
  return hasLock
    ? { runtime: "ruby", ok: true, detail: "Gemfile.lock present" }
    : { runtime: "ruby", ok: false, detail: "no Gemfile.lock — run `bundle install`" };
}

async function checkPython(fs: DetectorFilesystem): Promise<PackageCheckResult> {
  const hasVenv = (await fs.hasPath(".venv")) || (await fs.hasPath("venv"));
  return hasVenv
    ? { runtime: "python", ok: true, detail: "virtual environment detected" }
    : {
        runtime: "python",
        ok: false,
        detail: "no .venv/venv found — cannot confirm packages are installed",
      };
}

async function checkRust(fs: DetectorFilesystem): Promise<PackageCheckResult> {
  const hasLock = await fs.hasPath("Cargo.lock");
  return hasLock
    ? { runtime: "rust", ok: true, detail: "Cargo.lock present" }
    : { runtime: "rust", ok: false, detail: "no Cargo.lock — run `cargo fetch`" };
}

const CHECKERS: Record<RuntimeSlug, (fs: DetectorFilesystem) => Promise<PackageCheckResult>> = {
  node: checkNode,
  go: checkGo,
  ruby: checkRuby,
  python: checkPython,
  rust: checkRust,
};

export interface SourceCheckResult {
  appId: string;
  timestamp: string;
  packages: PackageCheckResult[];
  location: LocateResult;
  ok: boolean;
}

export async function checkSource(
  appId: string,
  path: string,
  fs: DetectorFilesystem,
  registryPath?: string
): Promise<SourceCheckResult> {
  const detected = await scan(fs, runtimes);
  const packages = await Promise.all(detected.map((d) => CHECKERS[d.slug](fs)));
  const location = await locateApp(appId, path, registryPath);

  return {
    appId,
    timestamp: new Date().toISOString(),
    packages,
    location,
    ok: packages.every((p) => p.ok) && !location.drifted,
  };
}
