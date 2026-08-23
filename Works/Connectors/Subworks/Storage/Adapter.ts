// Connectors Adapter
// designed and built by onyxlabs.

export interface ConnectorStorageAdapter {
  get(connectorId: string, key: string): Promise<unknown>;
  set(connectorId: string, key: string, value: unknown): Promise<void>;
  remove(connectorId: string, key: string): Promise<void>;
}
