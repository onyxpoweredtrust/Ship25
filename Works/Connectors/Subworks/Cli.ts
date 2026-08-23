// Connectors Cli
// designed and built by onyxlabs.

import { resolve } from "node:path";
import { createStore, createVars, DEFAULT_DATA_ROOT } from "@ship/datasets";
import { createConnectorRegistry } from "./Registry.js";
import { createGithubConnector } from "./Providers/Github.js";
import { createShipUiConnector } from "./Providers/ShipUi.js";
import { createShipAiConnector } from "./Providers/ShipAi/index.js";
import { createShipPayConnector } from "./Providers/ShipPay/index.js";
import { createShipNotifyConnector } from "./Providers/ShipNotify/index.js";
import type { ConnectorStorageAdapter } from "./Storage/Adapter.js";

const noopStorage: ConnectorStorageAdapter = {
  async get() {
    return undefined;
  },
  async set() {},
  async remove() {},
};

export const TWO_COMMANDS = ["connector"] as const;

// Real credentials come from `ship vars` (One's Store, under _Ship/Vars), never a
// hardcoded literal here — a connector with no var set just registers with an
// empty credential, same as before, so `connector list` still works with nothing configured.
async function defaultRegistry() {
  const vars = createVars(createStore(DEFAULT_DATA_ROOT));
  const v = async (name: string) => (await vars.get(name)) ?? "";

  const [githubClientId, githubClientSecret, shipPaySecretKey, openaiKey, anthropicKey] = await Promise.all([
    v("GITHUB_CLIENT_ID"),
    v("GITHUB_CLIENT_SECRET"),
    v("SHIP_PAY_SECRET_KEY"),
    v("OPENAI_API_KEY"),
    v("ANTHROPIC_API_KEY"),
  ]);

  const registry = createConnectorRegistry();
  registry.register({ id: "github", create: () => createGithubConnector({ clientId: githubClientId, clientSecret: githubClientSecret }) });
  registry.register({ id: "ship-ui", create: () => createShipUiConnector({}) });
  registry.register({
    id: "ship-ai",
    create: () =>
      createShipAiConnector({
        providers: {
          ...(openaiKey ? { openai: { apiKey: openaiKey } } : {}),
          ...(anthropicKey ? { anthropic: { apiKey: anthropicKey } } : {}),
        },
      }),
  });
  registry.register({ id: "ship-pay", create: () => createShipPayConnector({ secretKey: shipPaySecretKey, storage: noopStorage }) });
  registry.register({ id: "ship-notify", create: () => createShipNotifyConnector({}) });
  return registry;
}

export async function runTwoCli(args: string[]): Promise<void> {
  const [command, sub] = args;

  if (command !== "connector") {
    console.error(`Unknown command: ${command}`);
    process.exitCode = 1;
    return;
  }

  if (sub === "--help" || sub === "-h") {
    console.log("Usage: connector <list|scaffold>\n\n  connector list                    show every registered connector and its capabilities\n  connector scaffold ship-ui [path] scaffold the Ship UI shadcn setup");
    return;
  }

  const registry = await defaultRegistry();

  if (!sub || sub === "list") {
    for (const entry of registry.list()) {
      const connector = entry.create();
      console.log(`${connector.id}  (${connector.capabilities().join(", ")})`);
    }
    return;
  }

  if (sub === "scaffold") {
    const [, , connectorId, path] = args;
    if (connectorId !== "ship-ui") {
      console.error(`Usage: connector scaffold ship-ui [path]`);
      process.exitCode = 1;
      return;
    }
    const connector = createShipUiConnector({});
    const result = await connector.scaffold(resolve(path ?? "."));
    console.log(`Ship UI scaffolded at ${result.path}`);
    return;
  }

  console.error(`Usage: connector <list|scaffold>`);
  process.exitCode = 1;
}
