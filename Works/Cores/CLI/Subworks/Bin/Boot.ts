#!/usr/bin/env node
// CLI Boot
// designed and built by onyxlabs.

import { runDynamicBoot } from "../DynamicBoot.js";

const gray = (s: string) => (process.stdout.isTTY ? `\x1b[90m${s}\x1b[39m` : s);
const green = (s: string) => (process.stdout.isTTY ? `\x1b[32m${s}\x1b[39m` : s);
const red = (s: string) => (process.stdout.isTTY ? `\x1b[31m${s}\x1b[39m` : s);

console.log(`${gray("┌")}  Ship — Dynamic Boot`);
console.log(gray("│"));

try {
  const result = await runDynamicBoot(process.argv[2], {
    onStepStart: (label) => {
      console.log(`${green("◇")}  ${label}`);
      console.log(gray("│"));
    },
    onStepDone: (label, detail) => {
      console.log(`${green("◆")}  ${detail ? `${label} — ${detail}` : label}`);
      console.log(gray("│"));
    },
  });
  if (result.shellConfigAdditions.length > 0) {
    console.log(`${gray("│")}`);
    console.log(`${gray("│")}  Added to ${result.shellRcPath}:`);
    for (const line of result.shellConfigAdditions) console.log(`${gray("│")}    ${line}`);
    console.log(gray("│"));
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
