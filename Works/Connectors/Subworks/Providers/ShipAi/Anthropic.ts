// Connectors Anthropic
// designed and built by onyxlabs.

import { ConnectorError } from "../../Connector.js";
import type { AiProviderV1, AiProviderSettings, GenerateTextOptions, GenerateTextResult, ChatMessage } from "./Model.js";

const API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

function splitSystemPrompt(messages: ChatMessage[]): { system: string | undefined; rest: ChatMessage[] } {
  const systemMessages = messages.filter((m) => m.role === "system");
  const rest = messages.filter((m) => m.role !== "system");
  return { system: systemMessages.map((m) => m.content).join("\n") || undefined, rest };
}

export function createAnthropicProvider(settings: AiProviderSettings): AiProviderV1 {
  const fetchImpl = settings.fetchImpl ?? fetch;

  return {
    id: "anthropic",

    async generateText(options: GenerateTextOptions): Promise<GenerateTextResult> {
      const { system, rest } = splitSystemPrompt(options.messages);

      const res = await fetchImpl(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": settings.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: options.model,
          system,
          messages: rest,
          max_tokens: options.maxTokens ?? 1024,
          temperature: options.temperature,
        }),
      });

      const body = (await res.json()) as {
        content?: { type: string; text: string }[];
        usage?: { input_tokens: number; output_tokens: number };
        error?: { message: string };
      };

      const textBlock = body.content?.find((block) => block.type === "text");
      if (!res.ok || !textBlock) {
        throw new ConnectorError("ship-ai:anthropic", body.error?.message ?? `request failed with status ${res.status}`);
      }

      return {
        text: textBlock.text,
        usage: body.usage ? { inputTokens: body.usage.input_tokens, outputTokens: body.usage.output_tokens } : undefined,
      };
    },
  };
}
