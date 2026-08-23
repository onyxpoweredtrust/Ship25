// Agent Score
// designed and built by onyxlabs.

import type { Module } from "../Import/Registry.js";
import type { SystemStats } from "./Vitals.js";
import type { UsageTracker } from "./Usage.js";

export interface ModuleCost {
  cpuPercent: number;
  ramMb: number;
}

export interface ModuleScore {
  moduleId: string;
  usage: number;
  efficiency: number;
  vitality: number;
  priority: number;
}

function scoreUsage(moduleId: string, tracker: UsageTracker, peakCallsPerMinute: number): number {
  if (peakCallsPerMinute <= 0) return 0;
  return tracker.callsPerMinute(moduleId) / peakCallsPerMinute;
}

function scoreEfficiency(moduleId: string, tracker: UsageTracker, cost: ModuleCost): number {
  const calls = tracker.callsPerMinute(moduleId);
  const spend = cost.cpuPercent + cost.ramMb / 1000;
  if (spend <= 0) return calls > 0 ? 1 : 0;
  return calls / spend;
}

export interface VitalitySignal {
  isResponsive: boolean;
  restartsLastHour: number;
  errorRate: number;
}

function scoreVitality(signal: VitalitySignal): number {
  if (!signal.isResponsive) return 0;
  const restartPenalty = Math.min(signal.restartsLastHour * 0.2, 1);
  const errorPenalty = Math.min(signal.errorRate, 1);
  return Math.max(0, 1 - restartPenalty - errorPenalty);
}

export function scoreModule(
  mod: Module,
  tracker: UsageTracker,
  peakCallsPerMinute: number,
  cost: ModuleCost,
  vitality: VitalitySignal,
  weights = { usage: 0.4, efficiency: 0.3, vitality: 0.3 }
): ModuleScore {
  const usage = scoreUsage(mod.id, tracker, peakCallsPerMinute);
  const efficiency = scoreEfficiency(mod.id, tracker, cost);
  const vitalityScore = scoreVitality(vitality);
  const priority =
    usage * weights.usage + efficiency * weights.efficiency + vitalityScore * weights.vitality;

  return { moduleId: mod.id, usage, efficiency, vitality: vitalityScore, priority };
}

export interface ThrottleDecision {
  moduleId: string;
  action: ThrottleAction;
}

export type ThrottleAction = "run" | "throttle" | "suspend";

export function decideThrottle(
  scores: ModuleScore[],
  systemStats: SystemStats,
  pressureThreshold = 0.85
): ThrottleDecision[] {
  const underPressure =
    systemStats.cpuPercent > pressureThreshold * 100 ||
    systemStats.ramPercent > pressureThreshold * 100 ||
    systemStats.tempCelsius > 85;

  if (!underPressure) {
    return scores.map((s) => ({ moduleId: s.moduleId, action: "run" as const }));
  }

  const ranked = [...scores].sort((a, b) => b.priority - a.priority);
  const cutoff = Math.ceil(ranked.length * 0.7);

  return ranked.map((s, i) => ({
    moduleId: s.moduleId,
    action: i < cutoff ? "run" : s.vitality > 0 ? "throttle" : "suspend",
  }));
}
