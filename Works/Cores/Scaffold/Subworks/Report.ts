// Scaffold Report
// designed and built by onyxlabs.

import type { SystemInfo } from "./Probe.js";
import type { SourceCheckResult } from "./Verify.js";

export interface IgnitionReport {
  systemInfo: SystemInfo;
  sourceCheck: SourceCheckResult;
  ok: boolean;
  errorCode?: number;
  lines: string[];
}

export function renderReport(
  systemInfo: SystemInfo,
  sourceCheck: SourceCheckResult,
  ok: boolean,
  errorCode?: number
): IgnitionReport {
  const lines: string[] = [];

  lines.push("Zero Ignition");
  lines.push("");
  lines.push(`System: ${systemInfo.os.distro} ${systemInfo.os.release} (${systemInfo.os.arch})`);
  lines.push(`CPU: ${systemInfo.cpu.brand} — ${systemInfo.cpu.physicalCores} cores`);
  lines.push(`Storage: ${systemInfo.storage.freeGb}GB free of ${systemInfo.storage.totalGb}GB`);
  lines.push("");

  for (const pkg of sourceCheck.packages) {
    const mark = pkg.ok ? "✓" : "✗";
    lines.push(`${mark} ${pkg.runtime}: ${pkg.detail}`);
  }

  if (sourceCheck.location.drifted) {
    lines.push(
      `⚠ App location drifted — expected ${sourceCheck.location.expectedPath}, currently running from a different path.`
    );
  }

  lines.push("");
  lines.push(ok ? "Ignition complete." : `Ignition failed (error ${errorCode}).`);

  return { systemInfo, sourceCheck, ok, errorCode, lines };
}
