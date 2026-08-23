// Agent Usage
// designed and built by onyxlabs.

export interface UsageTracker {
  recordCall(moduleId: string): void;
  callsPerMinute(moduleId: string): number;
}

export function createUsageTracker(windowMs = 60_000): UsageTracker {
  const calls = new Map<string, number[]>();

  return {
    recordCall(moduleId) {
      const now = Date.now();
      const timestamps = calls.get(moduleId) ?? [];
      timestamps.push(now);
      calls.set(
        moduleId,
        timestamps.filter((t) => now - t <= windowMs)
      );
    },
    callsPerMinute(moduleId) {
      const now = Date.now();
      const timestamps = (calls.get(moduleId) ?? []).filter((t) => now - t <= windowMs);
      return timestamps.length;
    },
  };
}
