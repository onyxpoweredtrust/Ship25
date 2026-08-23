// Agent index
// designed and built by onyxlabs.

export { AgentPipeline } from "./Pipeline.js";
export { scan } from "./Search/Scanner.js";
export { runtimes, type RuntimeSlug } from "./Search/Signatures.js";
export { createNodeFilesystem } from "./Search/Native.js";
export type { DetectorFilesystem } from "./Search/Filesystem.js";

export { createRegistry, importScanResults, moduleId, type Module, type ModuleRegistry } from "./Import/Registry.js";
export { resolveEntrypoint } from "./Import/Resolve.js";
export { loadAppConfig, CONFIG_FILENAME } from "./Import/Config.js";
export { readModuleName, stampModuleName } from "./Import/Identity.js";
export { listModules, addModule, removeModule, editModule, ledgerPath } from "./Import/Ledger.js";
export { suggestModules, type ModuleSuggestion } from "./Import/Suggest.js";

export { createUsageTracker } from "./Manage/Usage.js";
export { ProcessManager } from "./Manage/Procs.js";
export { createSystemInformationStatsSource } from "./Manage/Sensors.js";
export {
  createPowerSource,
  installMacPowerDaemon,
  isMacPowerDaemonInstalled,
  uninstallMacPowerDaemon,
  installLinuxPowerDaemon,
  isLinuxPowerDaemonInstalled,
  uninstallLinuxPowerDaemon,
  isLibreHardwareMonitorRunning,
} from "./Manage/Power/index.js";
export { scoreModule, decideThrottle } from "./Manage/Score.js";

export {
  installDaemon,
  uninstallDaemon,
  isDaemonInstalled,
  type DaemonSpec,
  type DaemonResult,
} from "./Manage/Daemon/index.js";
