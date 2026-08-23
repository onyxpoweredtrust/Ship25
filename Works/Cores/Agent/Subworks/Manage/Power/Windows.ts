// Agent Windows
// designed and built by onyxlabs.

import { spawnSync } from "node:child_process";
import type { PowerReading, PowerSource } from "./Source.js";
import { UNSUPPORTED } from "./Source.js";

function runPowerShellJson(command: string): unknown {
  const result = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", command], {
    encoding: "utf8",
  });
  if (result.status !== 0 || !result.stdout?.trim()) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

interface BatteryStatusRow {
  ChargeRate?: number;
  DischargeRate?: number;
}

function readLaptopDischargeWatts(): number | null {
  const data = runPowerShellJson(
    "Get-CimInstance -Namespace root\\wmi -ClassName BatteryStatus | Select-Object -First 1 ChargeRate,DischargeRate | ConvertTo-Json -Compress"
  ) as BatteryStatusRow | null;

  if (!data || typeof data.DischargeRate !== "number") return null;
  if (data.DischargeRate <= 0) return null;
  return data.DischargeRate / 1000;
}

interface LibreSensorRow {
  Name?: string;
  Value?: number;
}

function readLibreHardwareMonitorWatts(): number | null {
  const data = runPowerShellJson(
    "Get-CimInstance -Namespace root\\LibreHardwareMonitor -ClassName Sensor -ErrorAction SilentlyContinue | Where-Object { $_.SensorType -eq 'Power' } | Select-Object Name,Value | ConvertTo-Json -Compress"
  );

  const rows: LibreSensorRow[] = Array.isArray(data) ? data : data ? [data as LibreSensorRow] : [];
  const packageSensor = rows.find((r) => /package|cpu power/i.test(r.Name ?? ""));
  const value = packageSensor?.Value ?? rows[0]?.Value;
  return typeof value === "number" ? value : null;
}

export function createWinPowerSource(): PowerSource {
  return {
    async read(): Promise<PowerReading> {
      const libreWatts = readLibreHardwareMonitorWatts();
      if (libreWatts !== null) {
        return { watts: libreWatts, supported: true, source: "librehardwaremonitor" };
      }

      const batteryWatts = readLaptopDischargeWatts();
      if (batteryWatts !== null) {
        return { watts: batteryWatts, supported: true, source: "wmi-battery-discharge-rate" };
      }

      return {
        ...UNSUPPORTED,
        source: "no-battery-discharge-and-no-librehardwaremonitor",
      };
    },
  };
}

export function isLibreHardwareMonitorRunning(): boolean {
  return readLibreHardwareMonitorWatts() !== null;
}
