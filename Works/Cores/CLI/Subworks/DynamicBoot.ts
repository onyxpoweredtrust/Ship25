// CLI DynamicBoot
// designed and built by onyxlabs.

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, appendFile, symlink, unlink, chmod } from "node:fs/promises";
import { homedir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);

const SHIP_ROOT_MARKER = join(homedir(), ".ship", "root");
// Path segments (relative to <shipRoot>/Works), in dependency order — every module
// must build after everything it depends on. Agent/Security/Scaffold/CLI are nested
// under Cores, so each entry is a path, not a bare name.
const CORE_MODULES = [
  ["Datasets"],
  ["Cores", "Agent"],
  ["Cores", "Security"],
  ["Cores", "Scaffold"],
  ["Connectors"],
  ["Cores"],
  ["Pipelines"],
  ["Cores", "CLI"],
] as const;

export interface DynamicBootHooks {
  onStepStart?(label: string): void;
  onStepDone?(label: string, detail?: string): void;
}

function looksLikeShipRoot(path: string): boolean {
  return existsSync(join(path, "pnpm-workspace.yaml")) && existsSync(join(path, "Works", "Cores", "CLI", "package.json"));
}

async function readMarker(): Promise<string | null> {
  try {
    return (await readFile(SHIP_ROOT_MARKER, "utf8")).trim() || null;
  } catch {
    return null;
  }
}

async function writeMarker(path: string): Promise<void> {
  await mkdir(dirname(SHIP_ROOT_MARKER), { recursive: true });
  await writeFile(SHIP_ROOT_MARKER, path, "utf8");
}

function walkUpForShipRoot(from: string): string | null {
  let dir = resolve(from);
  for (let i = 0; i < 8; i++) {
    if (looksLikeShipRoot(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

export async function locateShipRoot(hintPath?: string): Promise<string> {
  if (hintPath) {
    const found = looksLikeShipRoot(hintPath) ? hintPath : walkUpForShipRoot(hintPath);
    if (found) {
      await writeMarker(found);
      return found;
    }
  }

  const fromCwd = walkUpForShipRoot(process.cwd());
  if (fromCwd) {
    await writeMarker(fromCwd);
    return fromCwd;
  }

  const marked = await readMarker();
  if (marked && looksLikeShipRoot(marked)) return marked;

  throw new Error(
    "[ship/dynamic-boot] couldn't find Ship's own install location — run this from inside a Ship checkout, or pass the path explicitly."
  );
}

function defaultPnpmGlobalBinDir(): string {
  if (process.env.PNPM_HOME) return process.env.PNPM_HOME;
  return process.platform === "darwin" ? join(homedir(), "Library", "pnpm") : join(homedir(), ".local", "share", "pnpm");
}

async function resolvePnpmGlobalBinDir(): Promise<{ dir: string; onPath: boolean }> {
  try {
    const { stdout } = await execFileAsync("pnpm", ["bin", "--global"]);
    return { dir: stdout.trim(), onPath: true };
  } catch {
    // `pnpm bin --global` fails when the dir isn't on PATH yet — that's expected on
    // a fresh machine, not an error. Ask pnpm's own config for the path (a stable,
    // machine-readable subcommand) instead of scraping its human-readable error text,
    // which changes wording across pnpm versions and silently breaks this fallback.
    try {
      const { stdout } = await execFileAsync("pnpm", ["config", "get", "global-bin-dir"]);
      const dir = stdout.trim();
      if (dir && dir !== "undefined") return { dir, onPath: false };
    } catch {
    }
    return { dir: defaultPnpmGlobalBinDir(), onPath: false };
  }
}

async function linkShipGlobally(shipRoot: string): Promise<{ onPath: boolean; globalBinDir: string }> {
  const { dir: globalBinDir, onPath } = await resolvePnpmGlobalBinDir();
  await mkdir(globalBinDir, { recursive: true });

  const target = join(shipRoot, "Works", "Cores", "CLI", "Paths", "Bin", "Ship.js");
  const linkPath = join(globalBinDir, "ship");

  await chmod(target, 0o755);
  try {
    await unlink(linkPath);
  } catch {
  }
  await symlink(target, linkPath);

  return { onPath, globalBinDir };
}

export function shellRcPath(): string {
  const shell = process.env.SHELL ?? "";
  if (shell.includes("bash")) return join(homedir(), ".bashrc");
  return join(homedir(), ".zshrc");
}

const SHIP_SHELL_CONFIG_MARKER = "# Added by Ship's Dynamic Boot";

export async function ensureShellConfig(globalBinDir: string | undefined, needsPathUpdate: boolean): Promise<string[]> {
  const rcPath = shellRcPath();
  let existing = "";
  try {
    existing = await readFile(rcPath, "utf8");
  } catch {
  }

  const additions: string[] = [];
  if (needsPathUpdate && globalBinDir && !existing.includes(globalBinDir)) {
    additions.push(`export PATH="${globalBinDir}:$PATH"`);
  }
  if (!existing.includes("ship shell-init")) {
    additions.push(`eval "$(ship shell-init)"`);
  }

  if (additions.length > 0) {
    const block = `\n${SHIP_SHELL_CONFIG_MARKER}\n${additions.join("\n")}\n`;
    await appendFile(rcPath, block, "utf8");
  }

  return additions;
}

interface PowerDaemonModule {
  isMacPowerDaemonInstalled(): boolean;
  isLinuxPowerDaemonInstalled(): boolean;
  installMacPowerDaemon(): Promise<{ ok: boolean; error?: string }>;
  installLinuxPowerDaemon(): Promise<{ ok: boolean; error?: string }>;
}

async function offerPowerDaemonInstall(shipRoot: string, hooks: DynamicBootHooks): Promise<void> {
  if (process.platform !== "darwin" && process.platform !== "linux") return;
  if (!process.stdin.isTTY || !process.stdout.isTTY) return;

  const { onStepStart = () => {}, onStepDone = () => {} } = hooks;
  // Import the BUILT output, not the .ts source — this runs from Ship's own
  // compiled Paths/DynamicBoot.js under plain `node`, which has no TS loader.
  const powerModulePath = join(shipRoot, "Works", "Cores", "Agent", "Paths", "Manage", "Power", "index.js");
  let power: PowerDaemonModule;
  try {
    power = (await import(pathToFileURL(powerModulePath).href)) as PowerDaemonModule;
  } catch {
    return; // Agent isn't built yet, or this checkout predates the power daemon — not fatal to boot.
  }

  const isInstalled = process.platform === "darwin" ? power.isMacPowerDaemonInstalled() : power.isLinuxPowerDaemonInstalled();
  if (isInstalled) return;

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let answer: string;
  try {
    answer = await rl.question("Install the power monitoring daemon? Needs your password once. (y/N) ");
  } finally {
    rl.close();
  }
  if (answer.trim().toLowerCase() !== "y") return;

  onStepStart("installing power daemon");
  const result = process.platform === "darwin" ? await power.installMacPowerDaemon() : await power.installLinuxPowerDaemon();
  onStepDone("installing power daemon", result.ok ? undefined : `failed — ${result.error}`);
}

function run(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`[ship/dynamic-boot] "${command} ${args.join(" ")}" exited with code ${code}`));
    });
  });
}

export interface DynamicBootResult {
  shipRoot: string;
  linkedGlobally: boolean;
  globalBinDir?: string;
  needsPathUpdate?: boolean;
  shellConfigAdditions: string[];
  shellRcPath: string;
}

export async function runDynamicBoot(hintPath: string | undefined, hooks: DynamicBootHooks = {}): Promise<DynamicBootResult> {
  const { onStepStart = () => {}, onStepDone = () => {} } = hooks;

  onStepStart("locating Ship");
  const shipRoot = await locateShipRoot(hintPath);
  onStepDone("locating Ship", shipRoot);

  onStepStart("installing workspace dependencies");
  await run("pnpm", ["install"], shipRoot);
  onStepDone("installing workspace dependencies");

  for (const mod of CORE_MODULES) {
    const label = mod.join("/");
    onStepStart(`building ${label}`);
    await run("npm", ["run", "build"], join(shipRoot, "Works", ...mod));
    onStepDone(`building ${label}`);
  }

  onStepStart("linking ship globally");
  let linkedGlobally = true;
  let globalBinDir: string | undefined;
  let needsPathUpdate = false;
  try {
    const result = await linkShipGlobally(shipRoot);
    globalBinDir = result.globalBinDir;
    needsPathUpdate = !result.onPath;
    onStepDone("linking ship globally");
  } catch (err) {
    linkedGlobally = false;
    onStepDone("linking ship globally", `failed — see below (${(err as Error).message})`);
  }

  onStepStart("updating shell config");
  const rcPath = shellRcPath();
  const shellConfigAdditions = linkedGlobally ? await ensureShellConfig(globalBinDir, needsPathUpdate) : [];
  onStepDone("updating shell config", shellConfigAdditions.length > 0 ? `added ${shellConfigAdditions.length} line(s) to ${rcPath}` : "already up to date");

  if (linkedGlobally) {
    await offerPowerDaemonInstall(shipRoot, hooks);
  }

  return { shipRoot, linkedGlobally, globalBinDir, needsPathUpdate, shellConfigAdditions, shellRcPath: rcPath };
}
