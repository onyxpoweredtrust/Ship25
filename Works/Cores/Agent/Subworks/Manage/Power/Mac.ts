// Agent Mac
// designed and built by onyxlabs.

import { spawnSync } from "node:child_process";
import { open, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PowerReading, PowerSource } from "./Source.js";
import { UNSUPPORTED } from "./Source.js";

export const POWERMETRICS_OUTPUT_PATH = "/var/run/zero-power.txt";

const SAMPLE_HEADER = /^\*\*\* Sampled system activity/m;

const WATT_LINE_PATTERNS: { pattern: RegExp; unit: "mW" | "W" }[] = [
  { pattern: /Combined Power \(CPU ?\+ ?GPU ?\+ ?ANE\):\s*([\d.]+)\s*mW/i, unit: "mW" },
  { pattern: /Package Power:\s*([\d.]+)\s*mW/i, unit: "mW" },
  { pattern: /CPU Power:\s*([\d.]+)\s*mW/i, unit: "mW" },
  { pattern: /Intel energy model derived package power[^:]*:\s*([\d.]+)\s*W/i, unit: "W" },
];

function lastSample(raw: string): string {
  const parts = raw.split(SAMPLE_HEADER);
  return parts.at(-1) ?? raw;
}

function extractMilliwatts(text: string): number | null {
  for (const { pattern, unit } of WATT_LINE_PATTERNS) {
    const match = text.match(pattern);
    if (match) return unit === "W" ? Number(match[1]) * 1000 : Number(match[1]);
  }
  return null;
}

const TAIL_BYTES = 16 * 1024;

async function readTail(path: string, maxBytes = TAIL_BYTES): Promise<string> {
  const handle = await open(path, "r");
  try {
    const { size } = await handle.stat();
    const start = Math.max(0, size - maxBytes);
    const buffer = Buffer.alloc(size - start);
    await handle.read(buffer, 0, buffer.length, start);
    return buffer.toString("utf8");
  } finally {
    await handle.close();
  }
}

export function createMacPowerSource(path: string = POWERMETRICS_OUTPUT_PATH): PowerSource {
  return {
    async read(): Promise<PowerReading> {
      let raw: string;
      try {
        raw = await readTail(path);
      } catch {
        return { ...UNSUPPORTED, source: "powermetrics-daemon-not-running" };
      }

      const sample = lastSample(raw);
      const milliwatts = extractMilliwatts(sample);
      if (milliwatts === null) {
        return { ...UNSUPPORTED, source: "powermetrics-no-power-line" };
      }

      return { watts: milliwatts / 1000, supported: true, source: "powermetrics" };
    },
  };
}

export const DAEMON_LABEL = "com.onyxlabs.zero.powermetrics";
export const DAEMON_PLIST_PATH = `/Library/LaunchDaemons/${DAEMON_LABEL}.plist`;
export const SAMPLER_SCRIPT_PATH = "/usr/local/lib/zero/powermetrics-sampler.sh";

function samplerScript(outputPath: string): string {
  return `#!/bin/sh
set -eu
OUT="${outputPath}"
TMP="${outputPath}.tmp"

while true; do
  /usr/bin/powermetrics -n 1 -i 1000 --samplers cpu_power -o "$TMP"
  mv -f "$TMP" "$OUT"
done
`;
}

function daemonPlistXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${DAEMON_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>${SAMPLER_SCRIPT_PATH}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardErrorPath</key>
  <string>/var/log/zero-powermetrics.err.log</string>
</dict>
</plist>
`;
}

export interface InstallResult {
  ok: boolean;
  error?: string;
}

export async function installMacPowerDaemon(): Promise<InstallResult> {
  const scriptTemp = join(tmpdir(), "powermetrics-sampler.sh");
  const plistTemp = join(tmpdir(), `${DAEMON_LABEL}.plist`);
  await writeFile(scriptTemp, samplerScript(POWERMETRICS_OUTPUT_PATH), "utf8");
  await writeFile(plistTemp, daemonPlistXml(), "utf8");

  const steps: string[][] = [
    ["mkdir", "-p", "/usr/local/lib/zero"],
    ["cp", scriptTemp, SAMPLER_SCRIPT_PATH],
    ["chmod", "755", SAMPLER_SCRIPT_PATH],
    ["cp", plistTemp, DAEMON_PLIST_PATH],
    ["chown", "root:wheel", DAEMON_PLIST_PATH],
    ["chmod", "644", DAEMON_PLIST_PATH],
    ["launchctl", "bootstrap", "system", DAEMON_PLIST_PATH],
  ];

  for (const [cmd, ...args] of steps) {
    const result = spawnSync("sudo", [cmd, ...args], { stdio: "inherit" });
    if (result.status !== 0) {
      return { ok: false, error: `sudo ${cmd} ${args.join(" ")} exited ${result.status}` };
    }
  }

  return { ok: true };
}

export function isMacPowerDaemonInstalled(): boolean {
  const result = spawnSync("launchctl", ["print", `system/${DAEMON_LABEL}`], {
    stdio: "ignore",
  });
  return result.status === 0;
}

export async function uninstallMacPowerDaemon(): Promise<InstallResult> {
  const steps: string[][] = [
    ["launchctl", "bootout", `system/${DAEMON_LABEL}`],
    ["rm", "-f", DAEMON_PLIST_PATH, SAMPLER_SCRIPT_PATH],
  ];

  for (const [cmd, ...args] of steps) {
    const result = spawnSync("sudo", [cmd, ...args], { stdio: "inherit" });
    if (result.status !== 0) {
      return { ok: false, error: `sudo ${cmd} ${args.join(" ")} exited ${result.status}` };
    }
  }

  return { ok: true };
}
