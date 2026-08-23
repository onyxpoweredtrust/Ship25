// Agent Linux
// designed and built by onyxlabs.

import { spawnSync } from "node:child_process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import type { DaemonBackend, DaemonResult, DaemonSpec } from "./Spec.js";

// A user systemd unit (`systemctl --user`), not a system service — same reasoning
// as the Mac LaunchAgent: no root needed, tied to the logged-in session.
const UNITS_DIR = join(homedir(), ".config", "systemd", "user");
const LOG_DIR = join(homedir(), ".ship", "daemons", "logs");

function unitPath(label: string): string {
  return join(UNITS_DIR, `${label}.service`);
}

function unitName(label: string): string {
  return `${label}.service`;
}

// Same reasoning as the Mac backend's daemonPath(): a systemd --user unit's
// default PATH may not include wherever this node was actually installed
// (nvm, Homebrew-on-Linux, a local install), which breaks any child process
// the daemon spawns even though the daemon's own start command uses an
// absolute path.
function daemonPath(): string {
  const nodeDir = dirname(process.execPath);
  return [nodeDir, "/usr/local/bin", "/usr/bin", "/bin"].join(":");
}

function unitFile(spec: DaemonSpec, logPath: string): string {
  const exec = [spec.command, ...spec.args].map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ");
  return `[Unit]
Description=Ship daemon — ${spec.label}
After=network.target

[Service]
Type=simple
Environment=PATH=${daemonPath()}
ExecStart=${exec}
WorkingDirectory=${spec.cwd}
Restart=always
RestartSec=2
StandardOutput=append:${logPath}
StandardError=append:${logPath}

[Install]
WantedBy=default.target
`;
}

function systemctl(args: string[]): { status: number | null; stderr: string } {
  const result = spawnSync("systemctl", ["--user", ...args], { stdio: "pipe", encoding: "utf8" });
  return { status: result.status, stderr: result.stderr?.trim() ?? "" };
}

export const linuxDaemonBackend: DaemonBackend = {
  async install(spec: DaemonSpec): Promise<DaemonResult> {
    const logPath = spec.logPath ?? join(LOG_DIR, `${spec.label}.log`);
    try {
      await mkdir(UNITS_DIR, { recursive: true });
      await mkdir(LOG_DIR, { recursive: true });
      await writeFile(unitPath(spec.label), unitFile(spec, logPath), "utf8");

      const reload = systemctl(["daemon-reload"]);
      if (reload.status !== 0) return { ok: false, error: reload.stderr || "systemctl daemon-reload failed" };

      const enable = systemctl(["enable", "--now", unitName(spec.label)]);
      if (enable.status !== 0) return { ok: false, error: enable.stderr || "systemctl enable --now failed" };

      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  },

  async uninstall(label: string): Promise<DaemonResult> {
    systemctl(["disable", "--now", unitName(label)]);
    try {
      await rm(unitPath(label), { force: true });
      systemctl(["daemon-reload"]);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  },

  isInstalled(label: string): boolean {
    const result = spawnSync("systemctl", ["--user", "is-active", unitName(label)], { stdio: "pipe", encoding: "utf8" });
    return result.stdout?.trim() === "active";
  },
};
