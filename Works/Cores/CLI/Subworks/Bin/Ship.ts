#!/usr/bin/env node
// CLI Ship
// designed and built by onyxlabs.

import { resolve } from "node:path";
import { SHIP_VERSION } from "../Version.js";
import { guidelinesLines } from "../Guidelines.js";
import { checkIgnition } from "../Ignition.js";
import { runDynamicBoot } from "../DynamicBoot.js";
import { runVarsCli } from "../VarsCli.js";
import { runZeroCli, ZERO_COMMANDS, shellInitScript, Render } from "@ship/cores";
import { runOneCli, ONE_COMMANDS } from "@ship/datasets";
import { runTwoCli, TWO_COMMANDS } from "@ship/connectors";
import { runThreeCli, THREE_COMMANDS } from "@ship/pipelines";

type ModuleRunner = (args: string[]) => Promise<void>;

const modules: { commands: readonly string[]; run: ModuleRunner }[] = [
  { commands: ZERO_COMMANDS, run: runZeroCli },
  { commands: ONE_COMMANDS, run: runOneCli },
  { commands: TWO_COMMANDS, run: runTwoCli },
  { commands: THREE_COMMANDS, run: runThreeCli },
];

const commandTable = new Map<string, ModuleRunner>();
for (const mod of modules) {
  for (const command of mod.commands) {
    if (commandTable.has(command)) {
      throw new Error(`CLI command collision: "${command}" is claimed by more than one module`);
    }
    commandTable.set(command, mod.run);
  }
}

const args = process.argv.slice(2);
const [command] = args;

const CORE_COMMANDS: [string, string][] = [
  ["new <name>", "scaffold a new app, auto-cds into it"],
  ["build [on <port>] [app]", "run the app"],
  ["latest", "cd back into the app you used most recently"],
  ["hotswap [app]", "watch + hot swap on change"],
  ["read <path>", "read a value from One"],
  ["write <path> <json>", "write a value to One"],
  ["connector <cmd>", "manage Two's connectors (GitHub, Ship Auth, Ship AI, ...)"],
  ["deploy [build]", "build and push to the relay"],
  ["export from <app-or-port>", "package an app for deploy"],
];

const SETUP_COMMANDS: [string, string][] = [
  ["boot [path]", "Dynamic Boot — first-time machine setup (install + build + link globally)"],
  ["ignition [path]", "check that Core modules are set up correctly"],
  ["vars <list|get|set|paste>", "add/edit config values — pastes multiple KEY=VALUE lines at once"],
  ["daemon <install|status> [app]", "run an app as a background service — survives terminal close"],
  ["guidelines", "get started"],
  ["shell-init", "print the shell function that makes `new`/`latest` auto-cd"],
  ["agent <list|add|edit>", "manage an app's registered modules"],
  ["list / remove / sudo / log", "One's remaining data-inspection verbs — see `ship read --help`"],
];

function printHelp(): void {
  console.log(`ship  ${SHIP_VERSION}\n`);
  console.log("Core:");
  for (const [name, desc] of CORE_COMMANDS) console.log(`  ${name.padEnd(26)} ${desc}`);
  console.log("\nSetup & diagnostics:");
  for (const [name, desc] of SETUP_COMMANDS) console.log(`  ${name.padEnd(26)} ${desc}`);
  console.log("\n  --version");
  console.log("\nRun any command with --help for its own usage.");
}

async function main(): Promise<void> {
  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "--version" || command === "-v") {
    console.log(`ship ${SHIP_VERSION}`);
    return;
  }

  if (command === "guidelines") {
    for (const line of guidelinesLines) console.log(line);
    return;
  }

  if (command === "shell-init") {
    process.stdout.write(shellInitScript());
    return;
  }

  if (command === "vars") {
    await runVarsCli(args);
    return;
  }

  if (command === "ignition") {
    const shipRoot = resolve(args[1] ?? ".");
    const result = await checkIgnition(shipRoot);
    for (const line of result.lines) console.log(line);
    return;
  }

  if (command === "boot") {
    Render.intro("Ship — Dynamic Boot");
    try {
      const result = await runDynamicBoot(args[1], {
        onStepStart: (label) => Render.log.step(label),
        onStepDone: (label, detail) => Render.log.success(detail ? `${label} — ${detail}` : label),
      });
      if (result.shellConfigAdditions.length > 0) {
        Render.log.warn(`Added to ${result.shellRcPath}:\n\n    ${result.shellConfigAdditions.join("\n    ")}`);
      }
      const needsNewTerminal = result.linkedGlobally && result.shellConfigAdditions.length > 0;
      Render.outro(
        !result.linkedGlobally
          ? `Ship is built at ${result.shipRoot}, but the global link needs a manual retry (see above).`
          : needsNewTerminal
            ? `Ship is built at ${result.shipRoot} — open a new terminal (or \`source ${result.shellRcPath}\`) and \`ship\` works everywhere.`
            : `Ship is ready. \`ship\` is on PATH — found at ${result.shipRoot}.`
      );
    } catch (err) {
      Render.log.error((err as Error).message);
      process.exitCode = 1;
    }
    return;
  }

  const runner = commandTable.get(command);
  if (runner) {
    await runner(args);
    return;
  }

  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exitCode = 1;
}

await main();
