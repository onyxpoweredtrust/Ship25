// Connectors ShipUi
// designed and built by onyxlabs.

import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ConnectorV1, ConnectorFactory } from "../Connector.js";
import { ConnectorError } from "../Connector.js";

export function buildScaffoldArgs(appPath: string, subdir: string): string[] {
  return ["dlx", "shadcn@latest", "init", "--preset", "b27GcrRo", "--template", "vite", "--name", subdir, "--cwd", appPath, "--yes"];
}

export interface ShipUiConnector extends ConnectorV1 {
  scaffold(appPath: string, subdir?: string): Promise<{ path: string }>;
}

export interface ShipUiConnectorSettings {
  spawnImpl?: typeof spawn;
  mkdirImpl?: (path: string) => void;
}

export const createShipUiConnector: ConnectorFactory<ShipUiConnectorSettings, ShipUiConnector> = (settings) => {
  const spawnImpl = settings.spawnImpl ?? spawn;
  const mkdirImpl = settings.mkdirImpl ?? ((path: string) => mkdirSync(path, { recursive: true }));

  return {
    id: "ship-ui",

    capabilities() {
      return ["scaffold-ui"];
    },

    scaffold(appPath, subdir = "ui") {
      const target = join(appPath, subdir);
      const args = buildScaffoldArgs(appPath, subdir);

      return new Promise((resolvePromise, reject) => {
        // A cwd that doesn't exist yet makes Node report the error as "spawn pnpm
        // ENOENT" — indistinguishable from pnpm itself being missing. Create it
        // first so a genuinely-missing pnpm is the only thing left that can ENOENT.
        mkdirImpl(appPath);
        const child = spawnImpl("pnpm", args, { cwd: appPath, stdio: "inherit" });
        child.on("error", (err) => reject(new ConnectorError("ship-ui", err.message)));
        child.on("exit", (code) => {
          if (code === 0) resolvePromise({ path: target });
          else reject(new ConnectorError("ship-ui", `shadcn init exited with code ${code}`));
        });
      });
    },
  };
};
