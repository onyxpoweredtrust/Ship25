// Pipelines index
// designed and built by onyxlabs.

import { register } from "./Core/Registry.js";
import { nodeEngine } from "./Languages/Node.js";
import { goEngine } from "./Languages/Go.js";
import { pythonEngine } from "./Languages/Python.js";
import { rubyEngine } from "./Languages/Ruby.js";
import { rustEngine } from "./Languages/Rust.js";
import { staticEngine } from "./Languages/Static.js";

export function registerBuiltinEngines(): void {
  register(nodeEngine);
  register(goEngine);
  register(pythonEngine);
  register(rubyEngine);
  register(rustEngine);
  register(staticEngine);
}

export {
  build,
  dev,
  start,
  detect,
  register,
  registeredEngines,
  buildApp,
  isMultiPartApp,
  type BuildEngine,
  type BuildOptions,
  type BuildResult,
  type BuildEvent,
  type AppBuildResult,
  type AppPartResult,
} from "./Core/Registry.js";

export { computeCacheKey, getCached, restoreCache, saveCache, clearCache, getCacheStats, listCacheEntries, type CacheMeta, type StepSummary } from "./Core/Cache.js";
export { detectFramework, detectFrameworks } from "./Core/Detect.js";
export { frameworks } from "./Core/Frameworks.js";
export { BuildError, run, probe, type StepRecord } from "./Core/Run.js";
export type { Framework, FrameworkDetector, FrameworkDetectors, FrameworkSettings, EngineName } from "./Core/Types.js";
