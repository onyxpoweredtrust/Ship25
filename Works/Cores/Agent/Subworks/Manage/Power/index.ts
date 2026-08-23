// Agent index
// designed and built by onyxlabs.

import type { PowerSource } from "./Source.js";
import { UNSUPPORTED } from "./Source.js";

export type { PowerReading, PowerSource } from "./Source.js";

export {
  createMacPowerSource,
  installMacPowerDaemon,
  isMacPowerDaemonInstalled,
  uninstallMacPowerDaemon,
  DAEMON_LABEL,
  DAEMON_PLIST_PATH,
  POWERMETRICS_OUTPUT_PATH,
} from "./Mac.js";

export {
  createLinuxPowerSource,
  installLinuxPowerDaemon,
  isLinuxPowerDaemonInstalled,
  uninstallLinuxPowerDaemon,
  SERVICE_NAME,
  SERVICE_UNIT_PATH,
  RAPL_OUTPUT_PATH,
} from "./Linux.js";

export { createWinPowerSource, isLibreHardwareMonitorRunning } from "./Windows.js";

const unsupportedSource: PowerSource = {
  async read() {
    return UNSUPPORTED;
  },
};

export async function createPowerSource(): Promise<PowerSource> {
  if (process.platform === "darwin") {
    const { createMacPowerSource } = await import("./Mac.js");
    return createMacPowerSource();
  }
  if (process.platform === "linux") {
    const { createLinuxPowerSource } = await import("./Linux.js");
    return createLinuxPowerSource();
  }
  if (process.platform === "win32") {
    const { createWinPowerSource } = await import("./Windows.js");
    return createWinPowerSource();
  }
  return unsupportedSource;
}
