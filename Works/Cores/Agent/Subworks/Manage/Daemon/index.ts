// Agent index
// designed and built by onyxlabs.

import type { DaemonBackend, DaemonResult, DaemonSpec } from "./Spec.js";

export type { DaemonSpec, DaemonResult, DaemonBackend } from "./Spec.js";

async function loadBackend(): Promise<DaemonBackend | null> {
  if (process.platform === "darwin") {
    const { macDaemonBackend } = await import("./Mac.js");
    return macDaemonBackend;
  }
  if (process.platform === "linux") {
    const { linuxDaemonBackend } = await import("./Linux.js");
    return linuxDaemonBackend;
  }
  if (process.platform === "win32") {
    const { windowsDaemonBackend } = await import("./Windows.js");
    return windowsDaemonBackend;
  }
  return null;
}

export async function installDaemon(spec: DaemonSpec): Promise<DaemonResult> {
  const b = await loadBackend();
  if (!b) return { ok: false, error: `daemons aren't supported on platform "${process.platform}" yet` };
  return b.install(spec);
}

export async function uninstallDaemon(label: string): Promise<DaemonResult> {
  const b = await loadBackend();
  if (!b) return { ok: false, error: `daemons aren't supported on platform "${process.platform}" yet` };
  return b.uninstall(label);
}

export async function isDaemonInstalled(label: string): Promise<boolean> {
  const b = await loadBackend();
  return b ? b.isInstalled(label) : false;
}
