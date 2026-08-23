// Connectors Slack
// designed and built by onyxlabs.

import { ConnectorError } from "../../Connector.js";
import type { NotifyProviderV1, NotifyProviderSettings, NotifyMessage } from "./Model.js";

export function createSlackProvider(settings: NotifyProviderSettings): NotifyProviderV1 {
  const fetchImpl = settings.fetchImpl ?? fetch;

  return {
    id: "slack",

    async send(message: NotifyMessage): Promise<void> {
      const res = await fetchImpl(settings.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message.text }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new ConnectorError("ship-notify:slack", body || `Slack webhook failed with status ${res.status}`);
      }
    },
  };
}
