// Agent Vitals
// designed and built by onyxlabs.

export interface SystemStats {
  cpuPercent: number;
  ramPercent: number;
  ssdPercent: number;
  hddPercent: number;
  tempCelsius: number;
  powerWatts: number;
  powerSupported: boolean;
}

export interface StatsSource {
  read(): Promise<SystemStats>;
}
