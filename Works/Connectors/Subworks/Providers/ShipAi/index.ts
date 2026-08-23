// Connectors index
// designed and built by onyxlabs.

import type { ConnectorV1, ConnectorFactory } from "../../Connector.js";
import { ConnectorError } from "../../Connector.js";
import { createOpenAiProvider } from "./OpenAi.js";
import { createAnthropicProvider } from "./Anthropic.js";
import type { AiProviderV1, GenerateTextOptions, GenerateTextResult } from "./Model.js";

export type AiProviderId = "openai" | "anthropic";

export interface ShipAiConnectorSettings {
  providers?: Partial<Record<AiProviderId, { apiKey: string; fetchImpl?: typeof fetch }>>;
}

export interface ShipAiConnector extends ConnectorV1 {
  generateText(providerId: AiProviderId, options: GenerateTextOptions): Promise<GenerateTextResult>;
}

const PROVIDER_FACTORIES: Record<AiProviderId, (settings: { apiKey: string; fetchImpl?: typeof fetch }) => AiProviderV1> = {
  openai: createOpenAiProvider,
  anthropic: createAnthropicProvider,
};

export const createShipAiConnector: ConnectorFactory<ShipAiConnectorSettings, ShipAiConnector> = (settings) => {
  const providers = new Map<AiProviderId, AiProviderV1>();
  for (const [id, config] of Object.entries(settings.providers ?? {}) as [AiProviderId, { apiKey: string; fetchImpl?: typeof fetch }][]) {
    if (config?.apiKey) providers.set(id, PROVIDER_FACTORIES[id](config));
  }

  return {
    id: "ship-ai",

    capabilities() {
      return [...providers.keys()].map((id) => `generate-text:${id}`);
    },

    async generateText(providerId, options) {
      const provider = providers.get(providerId);
      if (!provider) {
        throw new ConnectorError("ship-ai", `provider "${providerId}" is not configured with an API key`);
      }
      return provider.generateText(options);
    },
  };
};
