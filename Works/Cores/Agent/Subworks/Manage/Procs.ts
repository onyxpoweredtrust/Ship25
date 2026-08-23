// Agent Procs
// designed and built by onyxlabs.

import { type ChildProcess, spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir, setPriority, constants as osConstants } from "node:os";
import { dirname, join } from "node:path";
import * as si from "../Vendor/Systeminformation/lib/index.js";
import type { ModuleCost, VitalitySignal } from "./Score.js";
import type { ThrottleAction } from "./Score.js";

export interface ManagedProcessState {
  moduleId: string;
  pid: number | undefined;
  restarts: number;
  lastExitCode: number | null;
  errorCount: number;
  isResponsive: boolean;
  reattached?: boolean;
  throttled?: boolean;
}

export interface SpawnOptions {
  command: string;
  args?: string[];
  cwd?: string;
  restartOnCrash?: boolean;
}

const RESTART_WINDOW_MS = 60 * 60_000;
export const STATE_PATH = join(homedir(), ".zero", "state.json");

interface PersistedEntry {
  moduleId: string;
  pid: number;
  command: string;
  args: string[];
  cwd?: string;
  restartOnCrash?: boolean;
  restarts: number;
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export class ProcessManager {
  private readonly processes = new Map<string, ChildProcess>();
  private readonly states = new Map<string, ManagedProcessState>();
  private readonly restartTimestamps = new Map<string, number[]>();
  private readonly lastSpawnOptions = new Map<string, SpawnOptions>();
  private readonly statePath: string;

  constructor(statePath: string = STATE_PATH) {
    this.statePath = statePath;
  }

  async restore(): Promise<void> {
    let entries: PersistedEntry[];
    try {
      entries = JSON.parse(await readFile(this.statePath, "utf8"));
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!isAlive(entry.pid)) continue;

      this.states.set(entry.moduleId, {
        moduleId: entry.moduleId,
        pid: entry.pid,
        restarts: entry.restarts,
        lastExitCode: null,
        errorCount: 0,
        isResponsive: true,
        reattached: true,
      });
      this.lastSpawnOptions.set(entry.moduleId, {
        command: entry.command,
        args: entry.args,
        cwd: entry.cwd,
        restartOnCrash: entry.restartOnCrash,
      });
    }

    await this.persist();
  }

  private async persist(): Promise<void> {
    const entries: PersistedEntry[] = [];
    for (const [moduleId, state] of this.states) {
      if (!state.pid || !isAlive(state.pid)) continue;
      const options = this.lastSpawnOptions.get(moduleId);
      if (!options) continue;
      entries.push({
        moduleId,
        pid: state.pid,
        command: options.command,
        args: options.args ?? [],
        cwd: options.cwd,
        restartOnCrash: options.restartOnCrash,
        restarts: state.restarts,
      });
    }

    await mkdir(dirname(this.statePath), { recursive: true });
    await writeFile(this.statePath, JSON.stringify(entries, null, 2), "utf8");
  }

  spawnModule(moduleId: string, options: SpawnOptions): ManagedProcessState {
    const child = spawn(options.command, options.args ?? [], {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const state: ManagedProcessState = {
      moduleId,
      pid: child.pid,
      restarts: this.states.get(moduleId)?.restarts ?? 0,
      lastExitCode: null,
      errorCount: 0,
      isResponsive: true,
    };
    this.states.set(moduleId, state);
    this.processes.set(moduleId, child);
    this.lastSpawnOptions.set(moduleId, options);
    void this.persist();

    child.stderr?.on("data", () => {
      state.errorCount += 1;
    });

    child.on("exit", (code, signal) => {
      state.isResponsive = false;
      state.lastExitCode = code;
      this.processes.delete(moduleId);
      void this.persist();

      const unexpected = signal === null && code !== 0;
      if (unexpected && options.restartOnCrash) {
        this.recordRestart(moduleId);
        this.spawnModule(moduleId, options);
      }
    });

    return state;
  }

  private recordRestart(moduleId: string): void {
    const now = Date.now();
    const timestamps = (this.restartTimestamps.get(moduleId) ?? []).filter(
      (t) => now - t <= RESTART_WINDOW_MS
    );
    timestamps.push(now);
    this.restartTimestamps.set(moduleId, timestamps);

    const state = this.states.get(moduleId);
    if (state) state.restarts = timestamps.length;
  }

  private killPid(moduleId: string): void {
    const child = this.processes.get(moduleId);
    if (child) {
      child.kill();
      return;
    }
    const state = this.states.get(moduleId);
    if (state?.pid) {
      try {
        process.kill(state.pid, "SIGTERM");
      } catch {
      }
    }
  }

  async stop(moduleId: string): Promise<void> {
    this.killPid(moduleId);
    this.processes.delete(moduleId);
    this.states.delete(moduleId);
    await this.persist();
  }

  async hotSwap(moduleId: string, graceMs = 3000): Promise<ManagedProcessState> {
    const options = this.lastSpawnOptions.get(moduleId);
    if (!options) throw new Error(`no known spawn options for module "${moduleId}" to hot swap`);

    const state = this.states.get(moduleId);
    if (state?.pid && isAlive(state.pid)) {
      this.killPid(moduleId);
      const deadline = Date.now() + graceMs;
      while (isAlive(state.pid) && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 50));
      }
      if (isAlive(state.pid)) {
        try {
          process.kill(state.pid, "SIGKILL");
        } catch {
        }
      }
    }

    this.processes.delete(moduleId);
    return this.spawnModule(moduleId, options);
  }

  state(moduleId: string): ManagedProcessState | undefined {
    return this.states.get(moduleId);
  }

  moduleIds(): string[] {
    return [...this.states.keys()];
  }

  async stopAll(): Promise<void> {
    await Promise.all(this.moduleIds().map((id) => this.stop(id)));
  }

  private lowerPriority(moduleId: string): void {
    const state = this.states.get(moduleId);
    if (!state?.pid || !isAlive(state.pid) || state.throttled) return;
    try {
      setPriority(state.pid, osConstants.priority.PRIORITY_LOW);
      state.throttled = true;
    } catch {
    }
  }

  async applyThrottleDecision(moduleId: string, action: ThrottleAction): Promise<void> {
    if (action === "throttle") {
      this.lowerPriority(moduleId);
    } else if (action === "suspend") {
      await this.stop(moduleId);
    }
  }

  async costOf(moduleId: string): Promise<ModuleCost> {
    const state = this.states.get(moduleId);
    if (!state?.pid) return { cpuPercent: 0, ramMb: 0 };

    const { list } = await si.processes();
    const proc = list.find((p) => p.pid === state.pid);
    if (!proc) return { cpuPercent: 0, ramMb: 0 };

    return { cpuPercent: proc.cpu, ramMb: proc.memRss / 1024 };
  }

  vitalityOf(moduleId: string): VitalitySignal {
    const state = this.states.get(moduleId);
    if (!state) return { isResponsive: false, restartsLastHour: 0, errorRate: 0 };

    const restartsLastHour = (this.restartTimestamps.get(moduleId) ?? []).length;
    return {
      isResponsive: state.isResponsive,
      restartsLastHour,
      errorRate: state.errorCount > 0 ? Math.min(state.errorCount / 100, 1) : 0,
    };
  }
}
