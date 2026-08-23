// Agent Spec
// designed and built by onyxlabs.

export interface DaemonSpec {
  /** Reverse-DNS style identifier, e.g. "com.onyxlabs.ship.myapp" — must be unique per running process. */
  label: string;
  /** The interpreter/binary to run — usually `process.execPath` (the current node binary). */
  command: string;
  args: string[];
  cwd: string;
  /** Where stdout/stderr get redirected. Defaults to a per-label file under the daemon home dir. */
  logPath?: string;
}

export interface DaemonResult {
  ok: boolean;
  error?: string;
}

export interface DaemonBackend {
  install(spec: DaemonSpec): Promise<DaemonResult>;
  uninstall(label: string): Promise<DaemonResult>;
  isInstalled(label: string): boolean;
}
