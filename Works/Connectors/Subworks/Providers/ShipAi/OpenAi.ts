// Connectors OpenAi
// designed and built by onyxlabs.

import { ConnectorError } from "../../Connector.js";
import type { AiProviderV1, AiProviderSettings, GenerateTextOptions, GenerateTextResult } from "./Model.js";

const API_URL = "https://api.openai.com/v1/chat/completions";

export function createOpenAiProvider(settings: AiProviderSettings): AiProviderV1 {
  const fetchImpl = settings.fetchImpl ?? fetch;

  return {
    id: "openai",

    async generateText(options: GenerateTextOptions): Promise<GenerateTextResult> {
      const res = await fetchImpl(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify({
          model: options.model,
          messages: options.messages,
          max_tokens: options.maxTokens,
          temperature: options.temperature,
        }),
      });

      const body = (await res.json()) as {
        choices?: { message: { content: string } }[];
        usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
        error?: { message: string };
      };

      if (!res.ok || !body.choices?.[0]) {
        throw new ConnectorError("ship-ai:openai", body.error?.message ?? `request failed with status ${res.status}`);
      }

      return {
        text: body.choices[0].message.content,
        usage: body.usage
          ? { promptTokens: body.usage.prompt_tokens, completionTokens: body.usage.completion_tokens, totalTokens: body.usage.total_tokens }
          : undefined,
      };
    },
  };
}
