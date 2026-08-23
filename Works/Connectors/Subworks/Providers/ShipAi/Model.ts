// Connectors Model
// designed and built by onyxlabs.

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GenerateTextOptions {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface GenerateTextResult {
  text: string;
  usage?: Record<string, number>;
}

export interface AiProviderV1 {
  readonly id: string;
  generateText(options: GenerateTextOptions): Promise<GenerateTextResult>;
}

export interface AiProviderSettings {
  apiKey: string;
  fetchImpl?: typeof fetch;
}
