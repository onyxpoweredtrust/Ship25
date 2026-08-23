// Scaffold index
// designed and built by onyxlabs.

export { runIgnition, type IgnitionOptions, type IgnitionResult, type IgnitionSteps, type IgnitionHooks } from "./Sequence.js";
export { gatherSystemInfo, type SystemInfo } from "./Probe.js";
export { checkSource, type PackageCheckResult, type SourceCheckResult } from "./Verify.js";
export { registerAppLocation, locateApp, listRegisteredApps, mostRecentApp, type AppLocationEntry, type LocateResult } from "./Atlas.js";
export { renderReport, type IgnitionReport } from "./Report.js";
export { templates, findTemplate } from "./Templates/Catalog.js";
export { createDefaultIgnitionSteps } from "./Steps.js";
export { recordLastCdTarget, consumeLastCdTarget } from "./Shell.js";
export { recordSession, endSession, findSessionByPort, listActiveSessions } from "./Sessions.js";
export { exportApp } from "./Export.js";

export { errorRegistry, findError } from "./Errors/Codes.js";
