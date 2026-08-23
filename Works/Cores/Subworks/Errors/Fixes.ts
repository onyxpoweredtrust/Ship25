// Cores Fixes
// designed and built by onyxlabs.

import { createServer } from "node:net";
import { access, rename } from "node:fs/promises";
import { join } from "node:path";
import type { Store } from "@ship/datasets";
import { rotateSigningKey } from "@ship/security";
import type { RuntimeSlug } from "@ship/agent";
import type { PackageCheckResult } from "@ship/scaffold";
import { listActiveSessions } from "@ship/scaffold";

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function findNextFreePort(startPort: number, maxAttempts = 20): Promise<number | null> {
  for (let port = startPort + 1; port < startPort + 1 + maxAttempts; port++) {
    const free = await new Promise<boolean>((resolvePromise) => {
      const server = createServer();
      server.once("error", () => resolvePromise(false));
      server.once("listening", () => server.close(() => resolvePromise(true)));
      server.listen(port);
    });
    if (free) return port;
  }
  return null;
}

export async function suggestAvailableName(
  baseName: string,
  isTaken: (candidate: string) => Promise<boolean>,
  maxAttempts = 20
): Promise<string | null> {
  for (let n = 2; n <= maxAttempts + 1; n++) {
    const candidate = `${baseName}-${n}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  return null;
}

export async function appNameTaken(appsRoot: string, name: string): Promise<boolean> {
  return pathExists(join(appsRoot, name));
}

export async function listActiveSessionSummaries(): Promise<string[]> {
  const sessions = await listActiveSessions();
  return sessions.map((s) => `:${s.port} → ${s.appPath}`);
}

export function hotswapNothingToSwapMessage(appPath: string): string {
  return `No running process for ${appPath} yet. Run \`ship build on <port>\` first — it now also starts the App's own process.`;
}

export async function recoverSigningKey(store: Store): Promise<{ regenerated: boolean }> {
  await rotateSigningKey(store);
  return { regenerated: true };
}

export async function backupCorruptStateFile(path: string): Promise<string | null> {
  if (!(await pathExists(path))) return null;
  const backupPath = `${path}.bak`;
  await rename(path, backupPath);
  return backupPath;
}

export function runtimeManifestHints(): Record<RuntimeSlug, string> {
  return {
    node: "package.json",
    go: "go.mod",
    ruby: "Gemfile",
    python: "pyproject.toml, requirements.txt, or Pipfile",
    rust: "Cargo.toml",
  };
}

export function installCommandFor(runtime: RuntimeSlug): string {
  const commands: Record<RuntimeSlug, string> = {
    node: "npm install (or pnpm install / yarn)",
    go: "go mod tidy",
    ruby: "bundle install",
    python: "python3 -m venv .venv && .venv/bin/pip install -r requirements.txt",
    rust: "cargo fetch",
  };
  return commands[runtime];
}

export function packageFixHints(packages: PackageCheckResult[]): string[] {
  return packages.filter((p) => !p.ok).map((p) => `${p.runtime}: ${installCommandFor(p.runtime)}`);
}

export function invalidPortMessage(raw: string | undefined, exampleCommand: string): string {
  return `"${raw ?? ""}" isn't a valid port. Example: ${exampleCommand}`;
}
