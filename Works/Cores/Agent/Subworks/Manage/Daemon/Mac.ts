// Agent Mac
// designed and built by onyxlabs.

import { spawnSync } from "node:child_process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import type { DaemonBackend, DaemonResult, DaemonSpec } from "./Spec.js";

// A per-user LaunchAgent, not a system LaunchDaemon — no root/sudo needed, and it
// only runs while the user is logged in, which is exactly the lifetime a dev's
// locally-running app should have (unlike Power's LaunchDaemon, which genuinely
// needs to sample hardware as root regardless of who's logged in).
const AGENTS_DIR = join(homedir(), "Library", "LaunchAgents");
const LOG_DIR = join(homedir(), ".ship", "daemons", "logs");

function plistPath(label: string): string {
  return join(AGENTS_DIR, `${label}.plist`);
}

function guiTarget(label: string): string {
  return `gui/${process.getuid?.() ?? 0}/${label}`;
}

// launchd agents start with a minimal PATH (just /usr/bin:/bin:/usr/sbin:/sbin) —
// none of which is where a Homebrew/nvm-installed node actually lives. Without this,
// the daemon's own process starts fine (it's launched by absolute path), but every
// child process IT spawns (the app's own registered modules, via ProcessManager's
// bare `spawn("node", ...)`) fails with ENOENT. Put the running node's own directory
// first, then the common install locations, then the stock minimal PATH.
function daemonPath(): string {
  const nodeDir = dirname(process.execPath);
  return [nodeDir, "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"].join(":");
}

function plistXml(spec: DaemonSpec, logPath: string): string {
  const args = [spec.command, ...spec.args].map((a) => `    <string>${a}</string>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${spec.label}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
  <key>WorkingDirectory</key>
  <string>${spec.cwd}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${daemonPath()}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${logPath}</string>
  <key>StandardErrorPath</key>
  <string>${logPath}</string>
</dict>
</plist>
`;
}

export const macDaemonBackend: DaemonBackend = {
  async install(spec: DaemonSpec): Promise<DaemonResult> {
    const logPath = spec.logPath ?? join(LOG_DIR, `${spec.label}.log`);
    try {
      await mkdir(AGENTS_DIR, { recursive: true });
      await mkdir(LOG_DIR, { recursive: true });
      await writeFile(plistPath(spec.label), plistXml(spec, logPath), "utf8");

      // Unload first in case a stale copy is already loaded under an old plist.
      spawnSync("launchctl", ["bootout", guiTarget(spec.label)], { stdio: "ignore" });
      const result = spawnSync("launchctl", ["bootstrap", `gui/${process.getuid?.() ?? 0}`, plistPath(spec.label)], {
        stdio: "pipe",
        encoding: "utf8",
      });
      if (result.status !== 0) {
        return { ok: false, error: result.stderr?.trim() || `launchctl exited ${result.status}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  },

  async uninstall(label: string): Promise<DaemonResult> {
    spawnSync("launchctl", ["bootout", guiTarget(label)], { stdio: "ignore" });
    try {
      await rm(plistPath(label), { force: true });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  },

  isInstalled(label: string): boolean {
    const result = spawnSync("launchctl", ["print", guiTarget(label)], { stdio: "ignore" });
    return result.status === 0;
  },
};
