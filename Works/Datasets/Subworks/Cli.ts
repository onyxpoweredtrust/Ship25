// Datasets Cli
// designed and built by onyxlabs.

import { homedir } from "node:os";
import { join } from "node:path";
import { ONE_VERSION } from "./Version.js";
import { guidelinesLines } from "./Guidelines.js";
import { renderTree } from "./Bin/Tree.js";
import { intro, outro, log, withStep } from "./Bin/Render.js";
import { createStore } from "./Blocks/Store.js";
import { SHIP_OWNER } from "./Blocks/Access.js";
import { watchStore } from "./Agent/Watcher.js";
import type { Role } from "./Blocks/Access.js";

export const ONE_COMMANDS = ["read", "write", "list", "remove", "sudo", "log"] as const;

function dataRoot(flag: (name: string) => string | undefined): string {
  return flag("root") ?? process.env.ONE_DATA_ROOT ?? join(homedir(), ".ship", "data");
}

function parsePath(raw: string | undefined): string[] | null {
  if (!raw) return null;
  return raw.split("/").filter(Boolean);
}

function parseRole(flag: (name: string) => string | undefined): Role | null {
  const raw = flag("as");
  if (!raw) return null;
  return raw === "ship-owner" ? SHIP_OWNER : raw;
}

function roleLabel(role: Role | null): string {
  if (role === null) return "(no role)";
  return typeof role === "string" ? role : "ship-owner";
}

function printHelp(): void {
  const tree = renderTree(`one  v${ONE_VERSION}`, [
    { label: "read <path>", description: "read a block" },
    { label: "write <path> <json>", description: "write a block" },
    { label: "list <path>", description: "list subblocks/leaf blocks" },
    { label: "remove <path>", description: "delete a block" },
    { label: "sudo <path> <roles>", description: "declare a Sudoblock" },
    { label: "log", description: "show One Agent's recent access log" },
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
    console.log(`one ${ONE_VERSION}`);
    return;
  }

  if (command === "guidelines") {
    for (const line of guidelinesLines) console.log(line);
    return;
  }

  const { store } = watchStore(createStore(dataRoot(flag)));
  const role = parseRole(flag);

  if (command === "read") {
    const path = parsePath(positional()[1]);
    if (!path) {
      console.error("Usage: one read <path> [--as <role>]");
      process.exitCode = 1;
      return;
    }
    intro(`one read ${path.join("/")}`);
    const value = await withStep(`reading as ${roleLabel(role)}`, () => store.readAs(role, path));
    log.message(JSON.stringify(value, null, 2));
    outro("done");
    return;
  }

  if (command === "write") {
    const [, rawPath, rawJson] = positional();
    if (!rawPath || rawJson === undefined) {
      console.error("Usage: one write <path> <json> [--as <role>]");
      process.exitCode = 1;
      return;
    }
    const path = parsePath(rawPath)!;
    let value: unknown;
    try {
      value = JSON.parse(rawJson);
    } catch {
      console.error(`"${rawJson}" isn't valid JSON.`);
      process.exitCode = 1;
      return;
    }
    intro(`one write ${path.join("/")}`);
    await withStep(`writing as ${roleLabel(role)}`, () => store.writeAs(role, path, value));
    outro("done");
    return;
  }

  if (command === "list") {
    const path = parsePath(positional()[1]) ?? [];
    intro(`one list ${path.join("/") || "/"}`);
    const children = await withStep("listing", () => store.list(path));
    log.message(children.length ? children.join("\n") : "(empty)");
    outro(`${children.length} item(s)`);
    return;
  }

  if (command === "remove") {
    const path = parsePath(positional()[1]);
    if (!path) {
      console.error("Usage: one remove <path> [--as <role>]");
      process.exitCode = 1;
      return;
    }
    intro(`one remove ${path.join("/")}`);
    await withStep(`removing as ${roleLabel(role)}`, () => store.removeAs(role, path));
    outro("done");
    return;
  }

  if (command === "sudo") {
    const [, rawPath, rawRoles] = positional();
    if (!rawPath || !rawRoles) {
      console.error("Usage: one sudo <path> <role1,role2,...>");
      process.exitCode = 1;
      return;
    }
    const path = parsePath(rawPath)!;
    const roles = rawRoles.split(",").map((r) => r.trim()).filter(Boolean);
    intro(`one sudo ${path.join("/")}`);
    await withStep("declaring", () => store.declareSudoblock(path, roles));
    outro(`gated to: ${roles.join(", ")}`);
    return;
  }

  if (command === "log") {
    const { watcher } = watchStore(createStore(dataRoot(flag)));
    const limit = Number(flag("limit") ?? "20");
    intro("one log");
    const entries = await watcher.readLog(limit);
    if (!entries.length) {
      log.message("(no access logged yet)");
    } else {
      for (const e of entries) {
        const marker = e.allowed ? "✓" : "✗ DENIED";
        log.message(`${e.timestamp}  ${marker}  ${e.action}  ${e.path}  (role: ${e.role ?? "none"})`);
      }
    }
    outro(`${entries.length} entries`);
    return;
  }

  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exitCode = 1;
}

export async function runOneCli(args: string[]): Promise<void> {
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
