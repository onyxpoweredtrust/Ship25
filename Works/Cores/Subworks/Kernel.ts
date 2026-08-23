// Cores Kernel
// designed and built by onyxlabs.

import { basename, resolve } from "node:path";
import { AgentPipeline, createNodeFilesystem, createSystemInformationStatsSource, ProcessManager, loadAppConfig } from "@ship/agent";
import { createStore } from "@ship/datasets";
import { createDefaultTokenIssuer, type TokenIssuer } from "@ship/security";
import { createZeroServer, DEFAULT_DATA_ROOT, type ConnectorMount } from "./Endpoints/Gateway.js";
import { gatherSystemInfo, checkSource, registerAppLocation, listRegisteredApps, renderReport, type IgnitionReport, recordSession, endSession } from "@ship/scaffold";
import type { Server } from "node:http";

export interface KernelOptions {
  appPath: string;
  port?: number;
  tickIntervalMs?: number;
  mounts?: ConnectorMount[];
}

export interface KernelHandle {
  appPath: string;
  port: number;
  pipeline: AgentPipeline;
  processManager: ProcessManager;
  issuer: TokenIssuer;
  server: Server;
  startupReport: IgnitionReport;
  stop(): Promise<void>;
}

const DEFAULT_PORT = 4970;

export class PortInUseError extends Error {
  constructor(readonly port: number) {
    super(`port ${port} is already in use`);
    this.name = "PortInUseError";
  }
}

async function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      server.removeListener("listening", onListening);
      reject(err.code === "EADDRINUSE" ? new PortInUseError(port) : err);
    };
    const onListening = () => {
      server.removeListener("error", onError);
      resolvePromise();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port);
  });
}

async function spawnAppProcesses(pipeline: AgentPipeline, processManager: ProcessManager): Promise<void> {
  for (const mod of pipeline.registry.list()) {
    if (processManager.state(mod.id)) continue;
    if (!mod.entrypoint) continue;

    processManager.spawnModule(mod.id, {
      command: mod.entrypoint.command,
      args: mod.entrypoint.args,
      cwd: mod.path,
      restartOnCrash: true,
    });
  }
}

export async function startKernel(options: KernelOptions): Promise<KernelHandle> {
  const appPath = resolve(options.appPath);
  // Reuse the name `ship new` already registered for this path, if any — deriving
  // a fresh id from the directory basename every time silently forked the registry
  // into two entries for the same app whenever it was scaffolded with a custom
  // --path (directory name != app name), and `ship latest` would surface the wrong one.
  const registered = (await listRegisteredApps()).find((a) => a.path === appPath);
  const appId = registered?.appId ?? basename(appPath);
  const fs = createNodeFilesystem(appPath);

  const systemInfo = await gatherSystemInfo();
  await registerAppLocation(appId, appPath);
  const sourceCheck = await checkSource(appId, appPath, fs);
  const startupReport = renderReport(systemInfo, sourceCheck, sourceCheck.ok);

  const processManager = new ProcessManager();
  await processManager.restore();
  const pipeline = new AgentPipeline({
    fs,
    basePath: appPath,
    statsSource: createSystemInformationStatsSource(),
    processManager,
    tickIntervalMs: options.tickIntervalMs,
  });
  await pipeline.importFromScan();
  await spawnAppProcesses(pipeline, processManager);
  pipeline.start();

  const issuer = await createDefaultTokenIssuer(createStore(DEFAULT_DATA_ROOT));
  const server = createZeroServer({ issuer, pipeline, processManager, mounts: options.mounts });
  const config = await loadAppConfig(fs);
  const port = options.port ?? config?.port ?? DEFAULT_PORT;
  await listen(server, port);
  await recordSession(port, appPath);

  return {
    appPath,
    port,
    pipeline,
    processManager,
    issuer,
    server,
    startupReport,
    async stop() {
      pipeline.stop();
      await processManager.stopAll();
      await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
      await endSession(port);
    },
  };
}
