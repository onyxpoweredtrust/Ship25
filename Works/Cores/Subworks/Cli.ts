// Cores Cli
// designed and built by onyxlabs.

import { createInterface } from "node:readline/promises";
import { exec } from "node:child_process";
import { homedir } from "node:os";
import { join, resolve, basename } from "node:path";
import { readFile, writeFile, access } from "node:fs/promises";
import { ZERO_VERSION } from "./Version.js";
import { guidelinesLines } from "./Guidelines.js";
import { renderTree } from "./Bin/Tree.js";
import { intro, outro, log, withStep, select, confirmKeypress } from "./Bin/Render.js";
import { startKernel, PortInUseError } from "./Kernel.js";
import {
  runIgnition,
  createDefaultIgnitionSteps,
  findSessionByPort,
  listActiveSessions,
  exportApp,
  findTemplate,
  listRegisteredApps,
  mostRecentApp,
  recordLastCdTarget,
  findError,
} from "@ship/scaffold";
import {
  createNodeFilesystem,
  ProcessManager,
  AgentPipeline,
  createSystemInformationStatsSource,
  suggestModules,
  listModules,
  addModule,
  editModule,
  removeModule,
  ledgerPath,
  type ModuleSuggestion,
  moduleId,
  stampModuleName,
  runtimes as RUNTIME_DEFS,
  type RuntimeSlug,
  installDaemon,
  uninstallDaemon,
  isDaemonInstalled,
} from "@ship/agent";
import {
  findNextFreePort,
  suggestAvailableName,
  appNameTaken,
  listActiveSessionSummaries,
  hotswapNothingToSwapMessage,
  packageFixHints,
  invalidPortMessage,
} from "./Errors/Fixes.js";

const RUNTIME_SLUGS = RUNTIME_DEFS.map((r) => r.slug);

export const ZERO_COMMANDS = ["new", "latest", "build", "hotswap", "export", "agent", "daemon"] as const;

function daemonLabel(appPath: string): string {
  return `com.onyxlabs.ship.${basename(appPath)}`;
}

export async function runZeroCli(args: string[]): Promise<void> {
  function flag(name: string): string | undefined {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  }

  function positional(): string[] {
    const skip = new Set<number>();
    args.forEach((a, i) => {
      if (a.startsWith("--")) {
        skip.add(i);
        skip.add(i + 1);
      }
    });
    return args.filter((_, i) => !skip.has(i));
  }

  try {
    await runMain(args, flag, positional);
  } catch (err) {
    log.error((err as Error).message ?? "unexpected error");
    outro("failed");
    process.exitCode = 1;
  }
}

function shipAppsRoot(): string {
  const shipRoot = process.env.SHIP_ROOT ?? join(homedir(), "onyxpowered", "Ship25");
  return join(shipRoot, "Apps");
}

function renderErrorWithFix(code: number, extraLines: string[] = []): void {
  const entry = findError(code);
  log.error(entry ? `${entry.title} (error ${code})` : `error ${code}`);
  if (entry) log.message(entry.why);
  for (const line of extraLines) log.message(line);
}

function parsePort(raw: string | undefined, exampleCommand: string): number | null {
  const port = Number(raw);
  if (!raw || !Number.isInteger(port) || port < 1 || port > 65535) {
    renderErrorWithFix(19, [invalidPortMessage(raw, exampleCommand)]);
    return null;
  }
  return port;
}

async function promptApproval(question: string): Promise<string | null> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${question} (name it, or press Enter to skip): `);
    return answer.trim() || null;
  } finally {
    rl.close();
  }
}

async function suggestAndApprove(appPath: string): Promise<void> {
  const fs = createNodeFilesystem(appPath);
  const suggestions = await suggestModules(fs);

  for (const s of suggestions) {
    const name = await promptApproval(`Detected an unnamed ${s.runtime} module at ${s.entrypoint}`);
    if (!name) continue;

    const contents = await fs.readFile(s.entrypoint).catch(() => "");
    await writeFile(resolve(appPath, s.entrypoint), stampModuleName(contents, name, s.runtime), "utf8");
    await addModule(appPath, { name, runtime: s.runtime, entrypoint: s.entrypoint });
    log.success(`registered "${name}"`);
  }
}

async function isAppDir(path: string): Promise<boolean> {
  try {
    await access(ledgerPath(path));
    return true;
  } catch {
    return false;
  }
}

async function pickAppPath(message: string): Promise<string | null> {
  const apps = await listRegisteredApps();
  if (apps.length === 0) {
    log.warn("no apps registered yet — run `new <name>` first");
    return null;
  }
  return select(
    message,
    apps.map((a) => ({ label: a.appId, value: a.path, description: a.path }))
  );
}

async function resolveAppPath(explicit: string | undefined, promptMessage: string): Promise<string | null> {
  if (explicit) return resolve(explicit);
  if (await isAppDir(process.cwd())) return process.cwd();
  return pickAppPath(promptMessage);
}

function openInBrowser(url: string): void {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  exec(`${command} ${url}`);
}

function printHelp(): void {
  const tree = renderTree(`zero  v${ZERO_VERSION}`, [
    { label: "new <name>", description: "scaffold a new app, auto-cds into it" },
    { label: "build [on <port>] [app]", description: "run the app — picks interactively if not run from inside one" },
    { label: "hotswap [app]", description: "auto-detect changes + hot swap, no path needed" },
    { label: "export from <app-or-port>", description: "package the app for deploy" },
    {
      label: "agent",
      children: [
        { label: "list [path]" },
        { label: "add [path]", description: "search first, then interactive or manual add" },
        { label: "edit [path]", description: "interactive: pick a module, then rename/re-point/remove it" },
      ],
    },
    {
      label: "daemon",
      children: [
        { label: "install [app]", description: "run it as a background service — survives terminal close, starts at login" },
        { label: "uninstall [app]" },
        { label: "status [app]" },
      ],
    },
    { label: "guidelines", description: "get started" },
    { label: "--version" },
  ]);
  for (const line of tree) console.log(line);
}

async function runMain(
  args: string[],
  flag: (name: string) => string | undefined,
  positional: () => string[]
): Promise<void> {
  const [command] = args;

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "--version" || command === "-v") {
    console.log(`zero ${ZERO_VERSION}`);
    return;
  }

  if (command === "guidelines") {
    for (const line of guidelinesLines) console.log(line);
    return;
  }

  if (command === "new") {
    const [, name] = positional();
    if (!name) {
      console.error("Usage: new <name> [--template <slug>] [--path <dir>]");
      process.exitCode = 1;
      return;
    }

    const templateSlug = flag("template") ?? "node-basic";
    if (!findTemplate(templateSlug)) {
      intro(`new ${name}`);
      renderErrorWithFix(14);
      outro("failed");
      process.exitCode = 1;
      return;
    }

    const appsRoot = shipAppsRoot();
    const explicitPath = flag("path");
    const targetPath = resolve(explicitPath ?? join(appsRoot, name));
    const pm = new ProcessManager();

    intro(`new ${name}`);

    const result = await runIgnition(
      { appId: name, targetPath, templateSlug, fs: createNodeFilesystem(targetPath) },
      createDefaultIgnitionSteps(pm),
      {
        onStepDone: (label, detail) => log.step(detail ? `${label} — ${detail}` : label),
      }
    );

    if (!result.ok) {
      if (result.errorCode === 1 && !explicitPath) {
        const suggestion = await suggestAvailableName(name, (candidate) => appNameTaken(appsRoot, candidate));
        renderErrorWithFix(9, suggestion ? [`Try: new ${suggestion}`] : []);
      } else if (result.errorCode === 4 && !result.report.sourceCheck.ok) {
        renderErrorWithFix(7, packageFixHints(result.report.sourceCheck.packages));
      } else {
        renderErrorWithFix(result.errorCode ?? 4);
      }
      outro("ignition failed");
      process.exitCode = 1;
      return;
    }

    const fs = createNodeFilesystem(targetPath);
    const [primary] = await suggestModules(fs);
    if (primary) {
      const contents = await readFile(resolve(targetPath, primary.entrypoint), "utf8").catch(() => "");
      await writeFile(
        resolve(targetPath, primary.entrypoint),
        stampModuleName(contents, name, primary.runtime),
        "utf8"
      );
      await addModule(targetPath, { name, runtime: primary.runtime, entrypoint: primary.entrypoint });
      await pm.stop(moduleId(targetPath, primary.runtime));
    }

    await recordLastCdTarget(targetPath);

    outro(`${name} ready\n\n  build on <port>    run it\n  agent list          see its modules`);
    return;
  }

  if (command === "latest") {
    const mostRecent = mostRecentApp(await listRegisteredApps());
    if (!mostRecent) {
      log.warn("no apps registered yet — run `new <name>` first");
      process.exitCode = 1;
      return;
    }

    await recordLastCdTarget(mostRecent.path);
    log.message(mostRecent.appId);
    return;
  }

  if (command === "build") {
    const onIndex = args.indexOf("on");
    const explicitTarget = onIndex >= 0 ? args[onIndex + 2] : args[1];

    intro(`build`);
    let port: number | undefined;
    if (onIndex >= 0) {
      const parsed = parsePort(args[onIndex + 1], "build on 4000");
      if (parsed === null) {
        outro("failed");
        process.exitCode = 1;
        return;
      }
      port = parsed;
    }

    const appPath = await resolveAppPath(explicitTarget, "Which app do you want to build?");
    if (!appPath) {
      outro("no app selected");
      process.exitCode = 1;
      return;
    }

    let handle;
    try {
      handle = await withStep("starting kernel", () => startKernel({ appPath, port }));
    } catch (err) {
      if (err instanceof PortInUseError) {
        const suggestion = await findNextFreePort(err.port);
        renderErrorWithFix(10, suggestion ? [`Try: build on ${suggestion}`] : []);
        outro("failed");
        process.exitCode = 1;
        return;
      }
      throw err;
    }

    if (!handle.startupReport.ok) {
      for (const line of handle.startupReport.lines) log.warn(line);
    }
    const url = `http://localhost:${handle.port}`;
    log.success(`listening on ${url}`);

    const daemonMode = args.includes("--daemon");

    if (!daemonMode) {
      await suggestAndApprove(appPath);
      if (await confirmKeypress("press Enter to open it in your browser (any other key to skip)")) {
        openInBrowser(url);
      }
      log.info("Ctrl+C to stop");
    }

    const shutdown = async () => {
      await withStep("stopping", () => handle.stop());
      outro("build stopped");
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown); // daemon supervisors (launchd/systemd) stop with SIGTERM, not SIGINT
    return;
  }

  if (command === "hotswap") {
    intro(`hotswap`);
    const appPath = await resolveAppPath(positional()[1], "Which app do you want to watch?");
    if (!appPath) {
      outro("no app selected");
      process.exitCode = 1;
      return;
    }
    const pm = new ProcessManager();
    await pm.restore();

    const pipeline = new AgentPipeline({
      fs: createNodeFilesystem(appPath),
      basePath: appPath,
      statsSource: createSystemInformationStatsSource(),
      processManager: pm,
    });

    log.step(`watching ${appPath}`);
    const modules = await withStep("scanning modules", () => pipeline.importFromScan());

    const anyRunning = modules.some((m) => pm.state(m.id));
    if (modules.length > 0 && !anyRunning) {
      renderErrorWithFix(16, [hotswapNothingToSwapMessage(appPath)]);
    }

    pipeline.watch(300, (id) => log.success(`hot swapped ${id}`));
    log.info("watching for changes — Ctrl+C to stop");
    await suggestAndApprove(appPath);

    process.on("SIGINT", () => {
      pipeline.stop();
      outro("stopped watching");
      process.exit(0);
    });
    return;
  }

  if (command === "export") {
    const fromIndex = args.indexOf("from");
    const raw = args[fromIndex + 1];

    intro(`export`);
    if (!raw) {
      console.error("Usage: export from <app-name-or-port>");
      outro("failed");
      process.exitCode = 1;
      return;
    }

    const asPort = Number(raw);
    const isPort = Number.isInteger(asPort) && asPort >= 1 && asPort <= 65535;
    const session = isPort
      ? await findSessionByPort(asPort)
      : (await listActiveSessions()).find((s) => basename(s.appPath) === raw) ?? null;

    if (!session) {
      const active = await listActiveSessionSummaries();
      renderErrorWithFix(15, active.length ? ["Currently running:", ...active] : ["Nothing is currently running."]);
      outro("failed");
      process.exitCode = 1;
      return;
    }

    await suggestAndApprove(session.appPath);
    const result = await withStep("packaging", () => exportApp(session.appPath));

    outro(
      `exported to ${result.outputPath}\n\n  manifest: ${result.manifestPath}\n  (source only — Three owns the actual build/deploy pipeline)`
    );
    return;
  }

  if (command === "agent") {
    const [, sub] = args;

    if (sub === "list") {
      const path = resolve(flag("path") ?? positional()[2] ?? ".");
      const fs = createNodeFilesystem(path);

      intro(`agent list`);
      const registered = await withStep("reading ledger", () => listModules(path));
      const suggestions = await withStep("scanning for unnamed modules", () => suggestModules(fs));

      const tree = renderTree(`agent @ ${path}`, [
        {
          label: "registered",
          children: registered.map((m) => ({
            label: m.name,
            description: m.runtime ? `${m.runtime} — ${m.entrypoint}` : "runtime/entry not set yet",
          })),
        },
        {
          label: "suggested",
          children: suggestions.map((s) => ({ label: s.entrypoint, description: `${s.runtime}, unnamed` })),
        },
      ]);
      log.message(tree.join("\n"));
      outro(`${registered.length} registered, ${suggestions.length} suggested`);
      return;
    }

    if (sub === "add") {
      const path = resolve(flag("path") ?? positional()[2] ?? ".");
      const fs = createNodeFilesystem(path);

      intro(`agent add`);
      const suggestions = await withStep("searching for unregistered modules", () => suggestModules(fs));

      let picked: ModuleSuggestion | null = null;
      if (suggestions.length > 0) {
        picked = await select<ModuleSuggestion | null>("Found these — pick one, or add manually", [
          ...suggestions.map((s) => ({ label: `${s.entrypoint} (${s.runtime})`, value: s as ModuleSuggestion | null })),
          { label: "add manually instead", value: null },
        ]);
      }

      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        const name = (await rl.question("Name this module: ")).trim() || null;
        if (!name) {
          outro("cancelled — no name given");
          process.exitCode = 1;
          return;
        }

        const existing = await listModules(path);
        if (existing.some((m) => m.name === name)) {
          const suggestion = await suggestAvailableName(name, async (c) => existing.some((m) => m.name === c));
          renderErrorWithFix(12, suggestion ? [`Try again with: ${suggestion}`] : []);
          outro("failed");
          process.exitCode = 1;
          return;
        }

        let runtime: RuntimeSlug | null;
        let entrypoint: string | null;

        if (picked) {
          runtime = picked.runtime;
          entrypoint = picked.entrypoint;
        } else {
          rl.pause();
          runtime = await select<RuntimeSlug | null>("Runtime? (skip to decide later)", [
            ...RUNTIME_SLUGS.map((r) => ({ label: r, value: r as RuntimeSlug | null })),
            { label: "skip — decide later", value: null },
          ]);
          rl.resume();

          entrypoint = null;
          if (runtime) {
            const raw = (await rl.question("Entry file (skip to decide later): ")).trim();
            entrypoint = raw || null;
          }
        }

        const entry = await withStep("registering", async () => {
          if (entrypoint && runtime && (await fs.hasPath(entrypoint))) {
            const contents = await fs.readFile(entrypoint);
            await writeFile(resolve(path, entrypoint), stampModuleName(contents, name, runtime), "utf8");
          }
          return addModule(path, { name, runtime, entrypoint });
        });

        outro(
          entry.runtime
            ? `registered "${entry.name}" (${entry.runtime}) at ${entry.entrypoint}`
            : `registered "${entry.name}" — runtime/entry not set yet, finish it with \`agent edit\``
        );
      } finally {
        rl.close();
      }
      return;
    }

    if (sub === "edit") {
      const path = resolve(flag("path") ?? positional()[2] ?? ".");

      intro(`agent edit`);
      const registered = await withStep("reading ledger", () => listModules(path));
      if (registered.length === 0) {
        outro("nothing to edit — try `agent add` first");
        return;
      }

      const chosen = await select(
        "Pick a module to edit",
        registered.map((m) => ({
          label: m.name,
          value: m,
          description: m.runtime ? `${m.runtime} — ${m.entrypoint}` : "runtime/entry not set yet",
        }))
      );
      if (!chosen) {
        outro("cancelled");
        return;
      }

      const action = await select(`Editing "${chosen.name}" — what do you want to do?`, [
        { label: "rename", value: "rename" as const },
        { label: "change runtime", value: "runtime" as const },
        { label: "change entry file", value: "entry" as const },
        { label: "remove", value: "remove" as const },
        { label: "cancel", value: "cancel" as const },
      ]);

      if (!action || action === "cancel") {
        outro("cancelled");
        return;
      }

      if (action === "remove") {
        const removed = await withStep("removing", () => removeModule(path, chosen.name));
        if (!removed) {
          renderErrorWithFix(11);
          outro("failed");
          process.exitCode = 1;
          return;
        }
        outro(`removed "${chosen.name}"`);
        return;
      }

      let newName: string | undefined;
      let newEntry: string | undefined;
      if (action === "rename" || action === "entry") {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        try {
          if (action === "rename") {
            newName = (await rl.question(`New name (currently "${chosen.name}"): `)).trim() || undefined;
          } else {
            newEntry =
              (await rl.question(`New entry file (currently "${chosen.entrypoint ?? "none"}"): `)).trim() ||
              undefined;
          }
        } finally {
          rl.close();
        }
      }

      const newRuntime =
        action === "runtime"
          ? (await select("New runtime", RUNTIME_SLUGS.map((r) => ({ label: r, value: r as RuntimeSlug })))) ??
            undefined
          : undefined;

      if (!newName && !newRuntime && !newEntry) {
        outro("nothing changed");
        return;
      }

      const updated = await withStep("updating", () =>
        editModule(path, chosen.name, {
          ...(newName ? { name: newName } : {}),
          ...(newRuntime ? { runtime: newRuntime } : {}),
          ...(newEntry ? { entrypoint: newEntry } : {}),
        })
      );

      if (!updated) {
        renderErrorWithFix(11);
        outro("failed");
        process.exitCode = 1;
        return;
      }

      if (newName && updated.runtime && updated.entrypoint) {
        const fs2 = createNodeFilesystem(path);
        if (await fs2.hasPath(updated.entrypoint)) {
          const contents = await fs2.readFile(updated.entrypoint);
          await writeFile(
            resolve(path, updated.entrypoint),
            stampModuleName(contents, updated.name, updated.runtime),
            "utf8"
          );
        }
      }

      outro(`updated "${updated.name}"`);
      return;
    }

    console.error("Usage: agent <list|add|edit>");
    process.exitCode = 1;
    return;
  }

  if (command === "daemon") {
    const [, sub] = args;

    if (sub === "install") {
      intro(`daemon install`);
      const appPath = await resolveAppPath(positional()[2], "Which app should run as a background service?");
      if (!appPath) {
        outro("no app selected");
        process.exitCode = 1;
        return;
      }

      const label = daemonLabel(appPath);
      const result = await withStep("installing daemon", () =>
        installDaemon({
          label,
          command: process.execPath,
          args: [process.argv[1] ?? "", "build", appPath, "--daemon"],
          cwd: appPath,
        })
      );

      if (!result.ok) {
        log.error(`failed — ${result.error}`);
        outro("failed");
        process.exitCode = 1;
        return;
      }
      outro(`"${basename(appPath)}" now runs as a background service (${label})\n\n  daemon status ${basename(appPath)}     check it\n  daemon uninstall ${basename(appPath)}  stop and remove it`);
      return;
    }

    if (sub === "uninstall") {
      intro(`daemon uninstall`);
      const appPath = await resolveAppPath(positional()[2], "Which app's daemon should be removed?");
      if (!appPath) {
        outro("no app selected");
        process.exitCode = 1;
        return;
      }

      const result = await withStep("removing daemon", () => uninstallDaemon(daemonLabel(appPath)));
      if (!result.ok) {
        log.error(`failed — ${result.error}`);
        outro("failed");
        process.exitCode = 1;
        return;
      }
      outro(`"${basename(appPath)}" is no longer a background service`);
      return;
    }

    if (sub === "status") {
      intro(`daemon status`);
      const appPath = await resolveAppPath(positional()[2], "Which app do you want to check?");
      if (!appPath) {
        outro("no app selected");
        process.exitCode = 1;
        return;
      }

      const running = await isDaemonInstalled(daemonLabel(appPath));
      outro(`"${basename(appPath)}" — ${running ? "running as a background service" : "not installed as a daemon"}`);
      return;
    }

    console.error("Usage: daemon <install|uninstall|status> [app]");
    process.exitCode = 1;
    return;
  }

  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exitCode = 1;
}
