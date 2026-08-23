// Agent Pipeline
// designed and built by onyxlabs.

import { watch, type FSWatcher } from "node:fs";
import type { DetectorFilesystem } from "./Search/Filesystem.js";
import { scan } from "./Search/Scanner.js";
import { runtimes } from "./Search/Signatures.js";
import { createRegistry, importScanResults, type Module, type ModuleRegistry } from "./Import/Registry.js";
import { createUsageTracker, type UsageTracker } from "./Manage/Usage.js";
import type { StatsSource, SystemStats } from "./Manage/Vitals.js";
import { scoreModule, decideThrottle, type ModuleCost, type VitalitySignal, type ThrottleDecision } from "./Manage/Score.js";
import type { ProcessManager } from "./Manage/Procs.js";

export interface AgentPipelineOptions {
  fs: DetectorFilesystem;
  basePath: string;
  statsSource: StatsSource;
  tickIntervalMs?: number;
  processManager?: ProcessManager;
  costOf?: (moduleId: string) => ModuleCost | Promise<ModuleCost>;
  vitalityOf?: (moduleId: string) => VitalitySignal | Promise<VitalitySignal>;
}

export interface AgentPipelineTick {
  stats: SystemStats;
  decisions: ThrottleDecision[];
}

const defaultCost: ModuleCost = { cpuPercent: 0, ramMb: 0 };
const defaultVitality: VitalitySignal = { isResponsive: true, restartsLastHour: 0, errorRate: 0 };

export class AgentPipeline {
  readonly registry: ModuleRegistry;
  readonly usage: UsageTracker;
  private readonly options: Required<Pick<AgentPipelineOptions, "tickIntervalMs">> & AgentPipelineOptions;
  private timer: ReturnType<typeof setInterval> | undefined;
  private onTickCallbacks: ((tick: AgentPipelineTick) => void)[] = [];
  private fsWatcher: FSWatcher | undefined;
  private hotSwapDebounce: ReturnType<typeof setTimeout> | undefined;

  constructor(options: AgentPipelineOptions) {
    this.options = { ...options, tickIntervalMs: options.tickIntervalMs ?? 5000 };
    this.registry = createRegistry();
    this.usage = createUsageTracker();
  }

  get basePath(): string {
    return this.options.basePath;
  }

  async importFromScan(): Promise<Module[]> {
    const results = await scan(this.options.fs, runtimes);
    await importScanResults(this.registry, this.options.basePath, results, this.options.fs);
    return this.registry.list();
  }

  recordCall(moduleId: string): void {
    this.usage.recordCall(moduleId);
  }

  onTick(callback: (tick: AgentPipelineTick) => void): void {
    this.onTickCallbacks.push(callback);
  }

  private async costOf(moduleId: string): Promise<ModuleCost> {
    if (this.options.costOf) return this.options.costOf(moduleId);
    if (this.options.processManager) return this.options.processManager.costOf(moduleId);
    return defaultCost;
  }

  private async vitalityOf(moduleId: string): Promise<VitalitySignal> {
    if (this.options.vitalityOf) return this.options.vitalityOf(moduleId);
    if (this.options.processManager) return this.options.processManager.vitalityOf(moduleId);
    return defaultVitality;
  }

  async tickOnce(): Promise<AgentPipelineTick> {
    const stats = await this.options.statsSource.read();
    const modules = this.registry.list();
    const peakCallsPerMinute = Math.max(
      1,
      ...modules.map((m) => this.usage.callsPerMinute(m.id))
    );

    const scores = await Promise.all(
      modules.map(async (mod) =>
        scoreModule(
          mod,
          this.usage,
          peakCallsPerMinute,
          await this.costOf(mod.id),
          await this.vitalityOf(mod.id)
        )
      )
    );

    const decisions = decideThrottle(scores, stats);

    if (this.options.processManager) {
      const pm = this.options.processManager;
      await Promise.all(decisions.map((d) => pm.applyThrottleDecision(d.moduleId, d.action)));
    }

    const tick = { stats, decisions };
    for (const cb of this.onTickCallbacks) cb(tick);
    return tick;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tickOnce();
    }, this.options.tickIntervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.stopWatch();
  }

  async hotSwap(moduleId: string): Promise<void> {
    if (!this.options.processManager) {
      throw new Error("hotSwap requires a processManager");
    }
    await this.options.processManager.hotSwap(moduleId);
  }

  watch(debounceMs = 300, onSwap?: (moduleId: string) => void): void {
    if (this.fsWatcher) return;

    const onChange = () => {
      if (this.hotSwapDebounce) clearTimeout(this.hotSwapDebounce);
      this.hotSwapDebounce = setTimeout(async () => {
        await this.importFromScan();
        if (!this.options.processManager) return;
        for (const mod of this.registry.list()) {
          if (this.options.processManager.state(mod.id)) {
            await this.options.processManager
              .hotSwap(mod.id)
              .then(() => onSwap?.(mod.id))
              .catch(() => {});
          }
        }
      }, debounceMs);
    };

    try {
      this.fsWatcher = watch(this.options.basePath, { recursive: true }, onChange);
    } catch {
      this.fsWatcher = watch(this.options.basePath, onChange);
    }
  }

  stopWatch(): void {
    this.fsWatcher?.close();
    this.fsWatcher = undefined;
    if (this.hotSwapDebounce) clearTimeout(this.hotSwapDebounce);
  }
}
