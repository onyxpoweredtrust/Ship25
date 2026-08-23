// Agent Windows
// designed and built by onyxlabs.

import { spawnSync } from "node:child_process";
import type { DaemonBackend, DaemonResult } from "./Spec.js";

// Windows has no unprivileged equivalent of a LaunchAgent/systemd user unit without
// either a native Windows Service (needs a compiled service host, out of scope for
// a "no dependencies" vendor-only codebase) or third-party tooling. A Scheduled
// Task set to run at logon is the closest honest approximation: it survives
// terminal close and restarts at every login, but — unlike Mac/Linux here — it
// won't restart itself if the process crashes mid-session. Documented, not hidden.
function taskName(label: string): string {
  return label.replace(/[^a-zA-Z0-9_.-]/g, "-");
}

export const windowsDaemonBackend: DaemonBackend = {
  async install(spec): Promise<DaemonResult> {
    const tr = [spec.command, ...spec.args].map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ");
    const result = spawnSync(
      "schtasks",
      ["/create", "/tn", taskName(spec.label), "/tr", tr, "/sc", "onlogon", "/rl", "limited", "/f"],
      { stdio: "pipe", encoding: "utf8" }
    );
    if (result.status !== 0) {
      return { ok: false, error: result.stderr?.trim() || result.stdout?.trim() || `schtasks exited ${result.status}` };
    }
    return { ok: true };
  },

  async uninstall(label): Promise<DaemonResult> {
    const result = spawnSync("schtasks", ["/delete", "/tn", taskName(label), "/f"], { stdio: "pipe", encoding: "utf8" });
    if (result.status !== 0) {
      return { ok: false, error: result.stderr?.trim() || `schtasks exited ${result.status}` };
    }
    return { ok: true };
  },

  isInstalled(label): boolean {
    const result = spawnSync("schtasks", ["/query", "/tn", taskName(label)], { stdio: "ignore" });
    return result.status === 0;
  },
};
