// Agent Sensors
// designed and built by onyxlabs.

import { freemem, totalmem } from "node:os";
import * as si from "../Vendor/Systeminformation/lib/index.js";
import { createPowerSource } from "./Power/index.js";
import type { StatsSource, SystemStats } from "./Vitals.js";

const REFRESH_MS = 5 * 60_000;

function createTtlCache<T>(fetch: () => Promise<T>, ttlMs: number): () => Promise<T> {
  let cached: T | null = null;
  let cachedAt = 0;

  return async () => {
    const now = Date.now();
    if (cached !== null && now - cachedAt < ttlMs) return cached;
    cached = await fetch();
    cachedAt = now;
    return cached;
  };
}

export function createSystemInformationStatsSource(): StatsSource {
  const powerSourcePromise = createPowerSource();
  const getFsSize = createTtlCache(() => si.fsSize(), REFRESH_MS);
  const getCpuTemperature = createTtlCache(() => si.cpuTemperature(), REFRESH_MS);

  return {
    async read(): Promise<SystemStats> {
      const [load, fsSize, temp, power] = await Promise.all([
        si.currentLoad(),
        getFsSize(),
        getCpuTemperature(),
        powerSourcePromise.then((source) => source.read()),
      ]);

      const ssd = fsSize.find((d) => d.type?.toLowerCase().includes("ssd")) ?? fsSize[0];
      const hdd = fsSize.find((d) => d.type?.toLowerCase().includes("hdd")) ?? fsSize[0];
      const ramPercent = ((totalmem() - freemem()) / totalmem()) * 100;

      return {
        cpuPercent: load.currentLoad,
        ramPercent,
        ssdPercent: ssd?.use ?? 0,
        hddPercent: hdd?.use ?? 0,
        tempCelsius: temp.main ?? 0,
        powerWatts: power.watts ?? 0,
        powerSupported: power.supported,
      };
    },
  };
}
