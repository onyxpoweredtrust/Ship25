// Pipelines Registry
// designed and built by onyxlabs.

import path from "node:path";
import { existsSync } from "node:fs";
import type { DetectorFilesystem } from "@ship/agent";
import { detectFramework } from "./Detect.js";
import { frameworks } from "./Frameworks.js";
import { computeCacheKey, getCached, restoreCache, saveCache } from "./Cache.js";
import type { StepRecord } from "./Run.js";
import type { EngineName } from "./Types.js";

export interface BuildOptions {
  outDir?: string;
  env?: Record<string, string>;
  noCache?: boolean;
  onEvent?: (event: BuildEvent) => void;
  cacheDir?: string;
}

export type BuildEvent =
  | { type: "build.start"; app: string; part: string; engine: string; cacheKey: string }
  | { type: "build.done"; app: string; part: string; engine: string; duration: number; cached: boolean; files: number; cacheKey: string }
  | { type: "build.error"; app: string; part: string; engine: string; step: string; exitCode: number; hints: string[] };

export interface BuildResult {
  engine: string;
  outDir: string;
  duration: number;
  files: string[];
  steps: StepRecord[];
  cached?: boolean;
  cacheKey?: string;
}

export interface BuildEngine {
  name: EngineName | string;
  detect: (root: string) => boolean | Promise<boolean>;
  build: (root: string, fs: DetectorFilesystem, opts?: BuildOptions) => Promise<BuildResult>;
  dev?: (root: string, fs: DetectorFilesystem) => Promise<void>;
  start?: (root: string, fs: DetectorFilesystem, opts?: BuildOptions) => Promise<void>;
}

const engineMap = new Map<string, BuildEngine>();

export function register(engine: BuildEngine): void {
  engineMap.set(engine.name, engine);
}

export function registeredEngines(): string[] {
  return [...engineMap.keys()];
}

export async function detect(
  root: string,
  fs: DetectorFilesystem
): Promise<{ engine: BuildEngine; framework: string | null } | null> {
  const slug = await detectFramework({ fs, frameworkList: frameworks });
  const declaredEngine = slug ? frameworks.find((f) => f.slug === slug)?.engine : undefined;

  if (declaredEngine) {
    const engine = engineMap.get(declaredEngine);
    if (engine) return { engine, framework: slug };
  }

  const builtinOrder: EngineName[] = ["rust", "go", "ruby", "python", "node", "static"];
  const customNames = [...engineMap.keys()].filter((name) => !builtinOrder.includes(name as EngineName));
  const fallbackOrder = [...builtinOrder, ...customNames];

  for (const name of fallbackOrder) {
    const engine = engineMap.get(name);
    if (engine && (await engine.detect(root))) return { engine, framework: slug ?? null };
  }

  return null;
}

export async function build(
  root: string,
  fs: DetectorFilesystem,
  opts?: BuildOptions
): Promise<BuildResult> {
  const found = await detect(root, fs);
  if (!found) throw new Error(`[ship/three/build] no engine detected for: ${root}`);

  const { engine } = found;
  const outDir = opts?.outDir ?? path.join(root, "dist");
  const appName = path.basename(path.dirname(root));
  const part = path.basename(root).toLowerCase();

  if (opts?.noCache) {
    opts.onEvent?.({ type: "build.start", app: appName, part, engine: engine.name, cacheKey: "" });
    const result = await engine.build(root, fs, { ...opts, outDir });
    opts.onEvent?.({ type: "build.done", app: appName, part, engine: engine.name, duration: result.duration, cached: false, files: result.files.length, cacheKey: "" });
    return result;
  }

  const key = computeCacheKey(root, engine.name);
  const cached = getCached(key, opts?.cacheDir);
  if (cached) {
    const files = restoreCache(key, outDir, opts?.cacheDir);
    opts?.onEvent?.({ type: "build.done", app: appName, part, engine: engine.name, duration: cached.duration, cached: true, files: files.length, cacheKey: key });
    return {
      engine: engine.name,
      outDir,
      duration: cached.duration,
      files,
      steps: cached.steps.map((s) => ({ ...s, exitCode: 0, stdout: "", stderr: "" })),
      cached: true,
      cacheKey: key,
    };
  }

  opts?.onEvent?.({ type: "build.start", app: appName, part, engine: engine.name, cacheKey: key });

  let result: BuildResult;
  try {
    result = await engine.build(root, fs, { ...opts, outDir });
  } catch (err) {
    const e = err as { step?: string; exitCode?: number; hints?: string[] };
    opts?.onEvent?.({ type: "build.error", app: appName, part, engine: engine.name, step: e.step ?? "unknown", exitCode: e.exitCode ?? -1, hints: e.hints ?? [] });
    throw err;
  }

  saveCache(
    key,
    {
      engine: engine.name,
      outDir: result.outDir,
      duration: result.duration,
      files: result.files,
      steps: result.steps.map(({ step, command, duration }) => ({ step, command, duration })),
      timestamp: Date.now(),
    },
    result.outDir,
    opts?.cacheDir
  );

  opts?.onEvent?.({ type: "build.done", app: appName, part, engine: engine.name, duration: result.duration, cached: false, files: result.files.length, cacheKey: key });
  return { ...result, cached: false, cacheKey: key };
}

export async function dev(root: string, fs: DetectorFilesystem): Promise<void> {
  const found = await detect(root, fs);
  if (!found) throw new Error(`[ship/three/build] no engine detected for: ${root}`);
  if (!found.engine.dev) throw new Error(`[ship/three/build] engine ${found.engine.name} does not support dev mode`);
  await found.engine.dev(root, fs);
}

export async function start(root: string, fs: DetectorFilesystem, opts?: BuildOptions): Promise<void> {
  const found = await detect(root, fs);
  if (!found) throw new Error(`[ship/three/build] no engine detected for: ${root}`);
  if (!found.engine.start) throw new Error(`[ship/three/build] engine ${found.engine.name} does not support start mode`);

  await build(root, fs, opts);
  await found.engine.start(root, fs, opts);
}

export interface AppPartResult {
  name: string;
  result: BuildResult;
}

export interface AppBuildResult {
  app: string;
  parts: AppPartResult[];
  duration: number;
}

export function isMultiPartApp(dir: string): boolean {
  return existsSync(path.join(dir, "Frontend")) || existsSync(path.join(dir, "Backend"));
}

export async function buildApp(
  appDir: string,
  fsFor: (partDir: string) => DetectorFilesystem,
  opts?: BuildOptions
): Promise<AppBuildResult> {
  const start = Date.now();
  const parts: AppPartResult[] = [];

  for (const name of ["Backend", "Frontend"] as const) {
    const dir = path.join(appDir, name);
    if (!existsSync(dir)) continue;
    const result = await build(dir, fsFor(dir), opts);
    parts.push({ name, result });
  }

  return { app: path.basename(appDir), parts, duration: Date.now() - start };
}
