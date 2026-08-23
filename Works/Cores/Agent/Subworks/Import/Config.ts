// Agent Config
// designed and built by onyxlabs.

import type { DetectorFilesystem } from "../Search/Filesystem.js";
import type { Entrypoint } from "./Resolve.js";

export interface AppConfig {
  entrypoint?: Entrypoint;
  port?: number;
}

export const CONFIG_FILENAME = "zero.config.json";

export async function loadAppConfig(fs: DetectorFilesystem): Promise<AppConfig | null> {
  if (!(await fs.hasPath(CONFIG_FILENAME))) return null;

  try {
    const raw = await fs.readFile(CONFIG_FILENAME);
    const parsed = JSON.parse(raw);
    const config: AppConfig = {};

    if (parsed.entrypoint?.command && Array.isArray(parsed.entrypoint?.args)) {
      config.entrypoint = { command: parsed.entrypoint.command, args: parsed.entrypoint.args };
    }
    if (typeof parsed.port === "number") config.port = parsed.port;

    return config;
  } catch {
    return null;
  }
}
