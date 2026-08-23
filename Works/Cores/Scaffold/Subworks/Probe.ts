// Scaffold Probe
// designed and built by onyxlabs.

import * as si from "./Vendor/Systeminformation/lib/index.js";

export interface SystemInfo {
  os: { platform: string; distro: string; release: string; arch: string };
  cpu: { manufacturer: string; brand: string; cores: number; physicalCores: number; speed: number };
  storage: { totalGb: number; freeGb: number };
}

export async function gatherSystemInfo(): Promise<SystemInfo> {
  const [os, cpu, fsSize] = await Promise.all([si.osInfo(), si.cpu(), si.fsSize()]);

  const totalBytes = fsSize.reduce((sum, d) => sum + d.size, 0);
  const usedBytes = fsSize.reduce((sum, d) => sum + d.used, 0);

  return {
    os: { platform: os.platform, distro: os.distro, release: os.release, arch: os.arch },
    cpu: {
      manufacturer: cpu.manufacturer,
      brand: cpu.brand,
      cores: cpu.cores,
      physicalCores: cpu.physicalCores,
      speed: cpu.speed,
    },
    storage: {
      totalGb: Number((totalBytes / 1e9).toFixed(1)),
      freeGb: Number(((totalBytes - usedBytes) / 1e9).toFixed(1)),
    },
  };
}
