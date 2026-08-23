// Agent Linux
// designed and built by onyxlabs.

import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PowerReading, PowerSource } from "./Source.js";
import { UNSUPPORTED } from "./Source.js";

export const RAPL_OUTPUT_PATH = "/run/zero-power.txt";

export function createLinuxPowerSource(path: string = RAPL_OUTPUT_PATH): PowerSource {
  return {
    async read(): Promise<PowerReading> {
      let raw: string;
      try {
        raw = (await readFile(path, "utf8")).trim();
      } catch {
        return { ...UNSUPPORTED, source: "rapl-sampler-not-running" };
      }

      if (raw === "unsupported" || raw === "") {
        return { ...UNSUPPORTED, source: "rapl-and-hwmon-both-absent" };
      }

      const watts = Number(raw);
      if (Number.isNaN(watts)) {
        return { ...UNSUPPORTED, source: "rapl-sampler-bad-output" };
      }

      return { watts, supported: true, source: "rapl" };
    },
  };
}

export const SERVICE_NAME = "zero-power.service";
export const SERVICE_UNIT_PATH = `/etc/systemd/system/${SERVICE_NAME}`;
export const SAMPLER_SCRIPT_PATH = "/usr/local/lib/zero/rapl-sampler.sh";

function samplerScript(outputPath: string, intervalSeconds = 1): string {
  return `#!/bin/sh
set -eu
RAPL=/sys/class/powercap/intel-rapl:0/energy_uj
RANGE=/sys/class/powercap/intel-rapl:0/max_energy_range_uj
OUT="${outputPath}"
INTERVAL=${intervalSeconds}

if [ -r "$RAPL" ]; then
  range=0
  [ -r "$RANGE" ] && range=$(cat "$RANGE")
  prev=$(cat "$RAPL")
  while true; do
    sleep "$INTERVAL"
    curr=$(cat "$RAPL")
    if [ "$curr" -lt "$prev" ] && [ "$range" -gt 0 ]; then
      delta=$(( curr + range - prev ))
    else
      delta=$(( curr - prev ))
    fi
    awk -v d="$delta" -v i="$INTERVAL" 'BEGIN { printf "%.3f\\n", d / 1000000 / i }' > "$OUT"
    prev=$curr
  done
fi

HWMON_NAME_FILE=$(grep -l -E "k10temp|zenpower" /sys/class/hwmon/hwmon*/name 2>/dev/null | head -n1 || true)
if [ -n "$HWMON_NAME_FILE" ]; then
  HWMON_DIR=$(dirname "$HWMON_NAME_FILE")
  if [ -r "$HWMON_DIR/power1_input" ]; then
    while true; do
      microwatts=$(cat "$HWMON_DIR/power1_input")
      awk -v m="$microwatts" 'BEGIN { printf "%.3f\\n", m / 1000000 }' > "$OUT"
      sleep "$INTERVAL"
    done
  fi
fi

echo "unsupported" > "$OUT"
`;
}

function serviceUnit(): string {
  return `[Unit]
Description=Zero power sampler (RAPL/hwmon)

[Service]
Type=simple
ExecStart=/bin/sh ${SAMPLER_SCRIPT_PATH}
Restart=always
User=root

[Install]
WantedBy=multi-user.target
`;
}

export interface InstallResult {
  ok: boolean;
  error?: string;
}

export async function installLinuxPowerDaemon(): Promise<InstallResult> {
  const scriptTemp = join(tmpdir(), "rapl-sampler.sh");
  const unitTemp = join(tmpdir(), SERVICE_NAME);
  await writeFile(scriptTemp, samplerScript(RAPL_OUTPUT_PATH), "utf8");
  await writeFile(unitTemp, serviceUnit(), "utf8");

  const steps: string[][] = [
    ["mkdir", "-p", "/usr/local/lib/zero"],
    ["cp", scriptTemp, SAMPLER_SCRIPT_PATH],
    ["chmod", "755", SAMPLER_SCRIPT_PATH],
    ["cp", unitTemp, SERVICE_UNIT_PATH],
    ["chmod", "644", SERVICE_UNIT_PATH],
    ["systemctl", "daemon-reload"],
    ["systemctl", "enable", "--now", SERVICE_NAME],
  ];

  for (const [cmd, ...args] of steps) {
    const result = spawnSync("sudo", [cmd, ...args], { stdio: "inherit" });
    if (result.status !== 0) {
      return { ok: false, error: `sudo ${cmd} ${args.join(" ")} exited ${result.status}` };
    }
  }

  return { ok: true };
}

export function isLinuxPowerDaemonInstalled(): boolean {
  const result = spawnSync("systemctl", ["is-active", "--quiet", SERVICE_NAME], {
    stdio: "ignore",
  });
  return result.status === 0;
}

export async function uninstallLinuxPowerDaemon(): Promise<InstallResult> {
  const steps: string[][] = [
    ["systemctl", "disable", "--now", SERVICE_NAME],
    ["rm", "-f", SERVICE_UNIT_PATH, SAMPLER_SCRIPT_PATH],
    ["systemctl", "daemon-reload"],
  ];

  for (const [cmd, ...args] of steps) {
    const result = spawnSync("sudo", [cmd, ...args], { stdio: "inherit" });
    if (result.status !== 0) {
      return { ok: false, error: `sudo ${cmd} ${args.join(" ")} exited ${result.status}` };
    }
  }

  return { ok: true };
}
