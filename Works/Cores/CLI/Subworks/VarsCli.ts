// CLI VarsCli
// designed and built by onyxlabs.

import { createInterface } from "node:readline/promises";
import { createStore, createVars } from "@ship/datasets";
import { DEFAULT_DATA_ROOT } from "@ship/cores";

function store() {
  return createStore(DEFAULT_DATA_ROOT);
}

function parsePasted(text: string): { name: string; value: string }[] {
  const entries: { name: string; value: string }[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const withoutExport = line.startsWith("export ") ? line.slice("export ".length) : line;
    const eq = withoutExport.indexOf("=");
    if (eq === -1) continue;

    const name = withoutExport.slice(0, eq).trim();
    let value = withoutExport.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (name) entries.push({ name, value });
  }
  return entries;
}

function printHelp(): void {
  console.log(
    "Usage: vars <list|get|set|remove|paste>\n\n" +
      "  vars list                 names of every var that's set (values hidden)\n" +
      "  vars get <name>           print one var's value\n" +
      "  vars set <name> <value>   set one var\n" +
      "  vars remove <name>        delete one var\n" +
      "  vars paste                paste multiple KEY=VALUE lines at once, blank line to finish\n\n" +
      "Vars are stored through One, under _Ship/Vars — gated to the machine owner,\n" +
      "never a raw .env file or environment variable."
  );
}

export async function runVarsCli(args: string[]): Promise<void> {
  const [, sub] = args;
  const vars = createVars(store());

  if (!sub || sub === "--help" || sub === "-h" || sub === "list") {
    const names = await vars.list();
    if (names.length === 0) {
      console.log("no vars set yet — try `ship vars paste`");
      return;
    }
    console.log(`${names.length} var(s):`);
    for (const name of names.sort()) console.log(`  ${name}`);
    return;
  }

  if (sub === "get") {
    const name = args[2];
    if (!name) {
      console.error("Usage: vars get <name>");
      process.exitCode = 1;
      return;
    }
    const value = await vars.get(name);
    if (value === undefined) {
      console.error(`"${name}" isn't set`);
      process.exitCode = 1;
      return;
    }
    console.log(value);
    return;
  }

  if (sub === "set") {
    const name = args[2];
    const value = args.slice(3).join(" ");
    if (!name || !value) {
      console.error("Usage: vars set <name> <value>");
      process.exitCode = 1;
      return;
    }
    await vars.set(name, value);
    console.log(`set "${name}"`);
    return;
  }

  if (sub === "remove" || sub === "rm") {
    const name = args[2];
    if (!name) {
      console.error("Usage: vars remove <name>");
      process.exitCode = 1;
      return;
    }
    await vars.remove(name);
    console.log(`removed "${name}"`);
    return;
  }

  if (sub === "paste") {
    console.log("Paste your KEY=VALUE lines below, then press Enter on an empty line to finish:\n");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const lines: string[] = [];
    try {
      for await (const line of rl) {
        if (line.trim() === "") break;
        lines.push(line);
      }
    } finally {
      rl.close();
    }

    const entries = parsePasted(lines.join("\n"));
    if (entries.length === 0) {
      console.log("nothing parsed — expected lines like KEY=VALUE");
      return;
    }
    for (const { name, value } of entries) await vars.set(name, value);
    console.log(`\nset ${entries.length} var(s): ${entries.map((e) => e.name).join(", ")}`);
    return;
  }

  printHelp();
  process.exitCode = sub ? 1 : 0;
}
