// Connectors Model
// designed and built by onyxlabs.

export interface NotifyMessage {
  text: string;
}

export interface NotifyProviderV1 {
  readonly id: string;
  send(message: NotifyMessage): Promise<void>;
}

export interface NotifyProviderSettings {
  webhookUrl: string;
  fetchImpl?: typeof fetch;
}
