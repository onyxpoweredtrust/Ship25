// Connectors Connector
// designed and built by onyxlabs.

export interface ConnectorV1 {
  readonly id: string;
  capabilities(): ConnectorCapability[];
}

export type ConnectorCapability = string;

export type ConnectorFactory<TSettings, TConnector extends ConnectorV1 = ConnectorV1> = (
  settings: TSettings
) => TConnector;

export class ConnectorError extends Error {
  constructor(
    readonly connectorId: string,
    message: string,
    readonly code?: string
  ) {
    super(message);
    this.name = "ConnectorError";
  }
}
