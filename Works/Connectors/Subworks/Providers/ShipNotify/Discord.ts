// Connectors Discord
// designed and built by onyxlabs.

import { ConnectorError } from "../../Connector.js";
import type { NotifyProviderV1, NotifyProviderSettings, NotifyMessage } from "./Model.js";

export function createDiscordProvider(settings: NotifyProviderSettings): NotifyProviderV1 {
  const fetchImpl = settings.fetchImpl ?? fetch;

  return {
    id: "discord",

    async send(message: NotifyMessage): Promise<void> {
      const res = await fetchImpl(settings.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: message.text }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new ConnectorError("ship-notify:discord", body || `Discord webhook failed with status ${res.status}`);
      }
    },
  };
}
