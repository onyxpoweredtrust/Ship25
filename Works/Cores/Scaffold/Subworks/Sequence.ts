// Scaffold Sequence
// designed and built by onyxlabs.

import type { DetectorFilesystem } from "@ship/agent";
import { findError } from "./Errors/Codes.js";
import { gatherSystemInfo } from "./Probe.js";
import { checkSource } from "./Verify.js";
import { registerAppLocation } from "./Atlas.js";
import { renderReport, type IgnitionReport } from "./Report.js";

export interface IgnitionOptions {
  appId: string;
  targetPath: string;
  templateSlug: string;
  fs: DetectorFilesystem;
  registryPath?: string;
}

export interface IgnitionResult {
  ok: boolean;
  errorCode?: number;
  report: IgnitionReport;
}

export interface IgnitionSteps {
  isTargetEmpty(path: string): Promise<boolean>;
  copyTemplate(templateSlug: string, path: string): Promise<void>;
  spawnAgentProcess(path: string): Promise<void>;
  testDataPull(path: string): Promise<boolean>;
}

export interface IgnitionHooks {
  onStepStart?(label: string): void;
  onStepDone?(label: string, detail?: string): void;
}

export async function runIgnition(
  options: IgnitionOptions,
  steps: IgnitionSteps,
  hooks: IgnitionHooks = {}
): Promise<IgnitionResult> {
  const { onStepStart = () => {}, onStepDone = () => {} } = hooks;

  onStepStart("reading machine");
  const systemInfo = await gatherSystemInfo();
  onStepDone("reading machine", `${systemInfo.os.distro} ${systemInfo.os.arch}`);

  onStepStart("checking target directory");
  const isEmpty = await steps.isTargetEmpty(options.targetPath);
  if (!isEmpty) {
    onStepDone("checking target directory", "not empty");
    const errorCode = findError(1)!.code;
    const sourceCheck = await checkSource(options.appId, options.targetPath, options.fs, options.registryPath);
    return { ok: false, errorCode, report: renderReport(systemInfo, sourceCheck, false, errorCode) };
  }
  onStepDone("checking target directory", "empty");

  onStepStart("scaffolding files");
  await steps.copyTemplate(options.templateSlug, options.targetPath);
  await registerAppLocation(options.appId, options.targetPath, options.registryPath);
  onStepDone("scaffolding files", "written");

  onStepStart("spawning agent process");
  await steps.spawnAgentProcess(options.targetPath);
  onStepDone("spawning agent process", "started");

  onStepStart("verifying source");
  const sourceCheck = await checkSource(options.appId, options.targetPath, options.fs, options.registryPath);
  onStepDone("verifying source", sourceCheck.ok ? "ok" : "issues found");

  onStepStart("running data pull");
  const dataPullOk = await steps.testDataPull(options.targetPath);
  onStepDone("running data pull", dataPullOk ? "ok" : "failed");

  if (!dataPullOk || !sourceCheck.ok) {
    const errorCode = findError(4)!.code;
    return { ok: false, errorCode, report: renderReport(systemInfo, sourceCheck, false, errorCode) };
  }

  return { ok: true, report: renderReport(systemInfo, sourceCheck, true) };
}
