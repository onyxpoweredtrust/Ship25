// Connectors index
// designed and built by onyxlabs.

import type { ConnectorV1, ConnectorFactory } from "../../Connector.js";
import { ConnectorError } from "../../Connector.js";
import { createSlackProvider } from "./Slack.js";
import { createDiscordProvider } from "./Discord.js";
import type { NotifyProviderV1, NotifyMessage } from "./Model.js";

export type NotifyProviderId = "slack" | "discord";

export interface ShipNotifyConnectorSettings {
  providers?: Partial<Record<NotifyProviderId, { webhookUrl: string; fetchImpl?: typeof fetch }>>;
}

export interface ShipNotifyConnector extends ConnectorV1 {
  send(providerId: NotifyProviderId, message: NotifyMessage): Promise<void>;
}

const PROVIDER_FACTORIES: Record<NotifyProviderId, (settings: { webhookUrl: string; fetchImpl?: typeof fetch }) => NotifyProviderV1> = {
  slack: createSlackProvider,
  discord: createDiscordProvider,
};

export const createShipNotifyConnector: ConnectorFactory<ShipNotifyConnectorSettings, ShipNotifyConnector> = (settings) => {
  const providers = new Map<NotifyProviderId, NotifyProviderV1>();
  for (const [id, config] of Object.entries(settings.providers ?? {}) as [NotifyProviderId, { webhookUrl: string; fetchImpl?: typeof fetch }][]) {
    if (config?.webhookUrl) providers.set(id, PROVIDER_FACTORIES[id](config));
  }

  return {
    id: "ship-notify",

    capabilities() {
      return [...providers.keys()].map((id) => `send:${id}`);
    },

    async send(providerId, message) {
      const provider = providers.get(providerId);
      if (!provider) {
        throw new ConnectorError("ship-notify", `provider "${providerId}" is not configured with a webhook URL`);
      }
      await provider.send(message);
    },
  };
};
