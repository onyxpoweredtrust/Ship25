// Agent Resolve
// designed and built by onyxlabs.

import type { DetectorFilesystem } from "../Search/Filesystem.js";
import type { RuntimeSlug } from "../Search/Signatures.js";

export interface Entrypoint {
  command: string;
  args: string[];
}

async function resolveNode(fs: DetectorFilesystem): Promise<Entrypoint | null> {
  if (!(await fs.hasPath("package.json"))) return null;
  const manifest = JSON.parse(await fs.readFile("package.json"));

  if (manifest.scripts?.start) return { command: "npm", args: ["run", "start"] };
  if (typeof manifest.main === "string") return { command: "node", args: [manifest.main] };
  if (await fs.hasPath("index.js")) return { command: "node", args: ["index.js"] };
  return null;
}

async function resolveGo(fs: DetectorFilesystem): Promise<Entrypoint | null> {
  if (!(await fs.hasPath("go.mod"))) return null;
  return { command: "go", args: ["run", "."] };
}

async function resolveRuby(fs: DetectorFilesystem): Promise<Entrypoint | null> {
  if (await fs.hasPath("main.rb")) return { command: "ruby", args: ["main.rb"] };
  return null;
}

async function resolvePython(fs: DetectorFilesystem): Promise<Entrypoint | null> {
  if (await fs.hasPath("main.py")) return { command: "python3", args: ["main.py"] };
  return null;
}

async function resolveRust(fs: DetectorFilesystem): Promise<Entrypoint | null> {
  if (!(await fs.hasPath("Cargo.toml"))) return null;
  return { command: "cargo", args: ["run"] };
}

const RESOLVERS: Record<RuntimeSlug, (fs: DetectorFilesystem) => Promise<Entrypoint | null>> = {
  node: resolveNode,
  go: resolveGo,
  ruby: resolveRuby,
  python: resolvePython,
  rust: resolveRust,
};

export async function resolveEntrypoint(
  fs: DetectorFilesystem,
  runtime: RuntimeSlug
): Promise<Entrypoint | null> {
  return RESOLVERS[runtime](fs);
}

async function sourceNode(fs: DetectorFilesystem): Promise<string | null> {
  if (!(await fs.hasPath("package.json"))) return null;
  const manifest = JSON.parse(await fs.readFile("package.json"));
  if (typeof manifest.main === "string") return manifest.main;
  if (await fs.hasPath("index.js")) return "index.js";
  return null;
}

async function sourceNodeAll(fs: DetectorFilesystem): Promise<string[]> {
  if (!(await fs.hasPath("package.json"))) return [];
  const files = await fs.listFiles(".");
  return files.filter((name) => name.endsWith(".js")).sort();
}

async function sourceGo(fs: DetectorFilesystem): Promise<string | null> {
  return (await fs.hasPath("main.go")) ? "main.go" : null;
}

async function sourceRuby(fs: DetectorFilesystem): Promise<string | null> {
  return (await fs.hasPath("main.rb")) ? "main.rb" : null;
}

async function sourcePython(fs: DetectorFilesystem): Promise<string | null> {
  return (await fs.hasPath("main.py")) ? "main.py" : null;
}

async function sourceRust(fs: DetectorFilesystem): Promise<string | null> {
  return (await fs.hasPath("src/main.rs")) ? "src/main.rs" : null;
}

const SOURCE_RESOLVERS: Record<RuntimeSlug, (fs: DetectorFilesystem) => Promise<string | null>> = {
  node: sourceNode,
  go: sourceGo,
  ruby: sourceRuby,
  python: sourcePython,
  rust: sourceRust,
};

export async function resolveSourceFile(
  fs: DetectorFilesystem,
  runtime: RuntimeSlug
): Promise<string | null> {
  return SOURCE_RESOLVERS[runtime](fs);
}

export async function resolveAllSourceFiles(
  fs: DetectorFilesystem,
  runtime: RuntimeSlug
): Promise<string[]> {
  if (runtime === "node") return sourceNodeAll(fs);
  const single = await SOURCE_RESOLVERS[runtime](fs);
  return single ? [single] : [];
}
