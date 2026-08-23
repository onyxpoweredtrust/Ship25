#!/usr/bin/env node
// CLI Startup
// designed and built by onyxlabs.

import { createInterface } from "node:readline/promises";
import { runDynamicBoot } from "../DynamicBoot.js";
import { createStore, createVars } from "@ship/datasets";
import { DEFAULT_DATA_ROOT } from "@ship/cores";
import { listRegisteredApps } from "@ship/scaffold";
import { isDaemonInstalled } from "@ship/agent";

const gray = (s: string) => (process.stdout.isTTY ? `\x1b[90m${s}\x1b[39m` : s);
const green = (s: string) => (process.stdout.isTTY ? `\x1b[32m${s}\x1b[39m` : s);
const red = (s: string) => (process.stdout.isTTY ? `\x1b[31m${s}\x1b[39m` : s);

function line(): void {
  console.log(gray("│"));
}

console.log(`${gray("┌")}  Ship — Startup`);
line();

try {
  // Phase 1 — the same install + build + link + shell-config Dynamic Boot has
  // always done, so ship boot and Startup.command stay a single code path.
  const result = await runDynamicBoot(process.argv[2], {
    onStepStart: (label) => {
      console.log(`${green("◇")}  ${label}`);
      line();
    },
    onStepDone: (label, detail) => {
      console.log(`${green("◆")}  ${detail ? `${label} — ${detail}` : label}`);
      line();
    },
  });

  if (result.shellConfigAdditions.length > 0) {
    console.log(`${gray("│")}  Added to ${result.shellRcPath}:`);
    for (const l of result.shellConfigAdditions) console.log(`${gray("│")}    ${l}`);
    line();
  }

  // Phase 2 — vars. First run on a machine almost always needs at least one
  // (a connector credential); ask once, right here, instead of failing later
  // mid-command with no clear path back to where vars are even set.
  const vars = createVars(createStore(DEFAULT_DATA_ROOT));
  const existing = await vars.list();
  if (existing.length === 0 && process.stdin.isTTY && process.stdout.isTTY) {
    console.log(`${green("◇")}  vars`);
    console.log(`${gray("│")}  No vars set yet. Paste KEY=VALUE lines now (blank line to skip):`);
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const pasted: string[] = [];
    try {
      for await (const l of rl) {
        if (l.trim() === "") break;
        pasted.push(l);
      }
    } finally {
      rl.close();
    }
    let set = 0;
    for (const raw of pasted) {
      const withoutExport = raw.trim().startsWith("export ") ? raw.trim().slice("export ".length) : raw.trim();
      const eq = withoutExport.indexOf("=");
      if (eq === -1) continue;
      const name = withoutExport.slice(0, eq).trim();
      let value = withoutExport.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (name) {
        await vars.set(name, value);
        set++;
      }
    }
    console.log(`${gray("│")}  ${set > 0 ? `set ${set} var(s) — edit anytime with \`ship vars\`` : "skipped — set them anytime with `ship vars paste`"}`);
    line();
  }

  // Phase 3 — report daemon status for every app Ship already knows about, so
  // "everything auto runs" is visibly true rather than something to take on faith.
  const apps = await listRegisteredApps();
  if (apps.length > 0) {
    console.log(`${green("◇")}  apps`);
    for (const app of apps) {
      const running = await isDaemonInstalled(`com.onyxlabs.ship.${app.appId}`);
      console.log(`${gray("│")}  ${running ? "●" : "○"} ${app.appId}${running ? " — running as a background service" : " — not a daemon yet (ship daemon install " + app.appId + ")"}`);
    }
    line();
  }

  const needsNewTerminal = result.linkedGlobally && result.shellConfigAdditions.length > 0;
  const message = result.linkedGlobally
    ? needsNewTerminal
      ? `Ship is built at ${result.shipRoot} — open a new terminal (or \`source ${result.shellRcPath}\`) and \`ship\` works everywhere.`
      : `Ship is ready. \`ship\` is on PATH — found at ${result.shipRoot}.`
    : `Ship is built at ${result.shipRoot}, but the global link needs a manual retry (see above).`;
  console.log(`${gray("└")}  ${message}`);
} catch (err) {
  console.log(`${red("■")}  ${(err as Error).message}`);
  process.exitCode = 1;
}
