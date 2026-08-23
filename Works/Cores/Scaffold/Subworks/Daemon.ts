#!/usr/bin/env node
// Scaffold Daemon
// designed and built by onyxlabs.

import {
  installLinuxPowerDaemon,
  installMacPowerDaemon,
  isLinuxPowerDaemonInstalled,
  isMacPowerDaemonInstalled,
} from "@ship/agent";

if (process.platform === "win32") {
  console.log(
    "Windows needs no install step: laptops read live via WMI, desktops need LibreHardwareMonitor running (detected automatically, not installed by Zero)."
  );
  process.exit(0);
}

if (process.platform === "darwin") {
  if (isMacPowerDaemonInstalled()) {
    console.log("Power daemon already installed.");
    process.exit(0);
  }
  const result = await installMacPowerDaemon();
  if (!result.ok) {
    console.error("Install failed:", result.error);
    process.exit(1);
  }
  console.log("Power daemon installed and running.");
  process.exit(0);
}

if (process.platform === "linux") {
  if (isLinuxPowerDaemonInstalled()) {
    console.log("Power daemon already installed.");
    process.exit(0);
  }
  const result = await installLinuxPowerDaemon();
  if (!result.ok) {
    console.error("Install failed:", result.error);
    process.exit(1);
  }
  console.log("Power daemon installed and running.");
  process.exit(0);
}

console.error(`Unsupported platform: ${process.platform}`);
process.exit(1);
