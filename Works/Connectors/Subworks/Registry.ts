// Connectors Registry
// designed and built by onyxlabs.

import type { ConnectorV1 } from "./Connector.js";

export interface RegisteredConnector {
  id: string;
  create(): ConnectorV1;
}

export class ConnectorRegistry {
  private readonly connectors = new Map<string, RegisteredConnector>();

  register(entry: RegisteredConnector): void {
    if (this.connectors.has(entry.id)) {
      throw new Error(`Connector id collision: "${entry.id}" is already registered`);
    }
    this.connectors.set(entry.id, entry);
  }

  get(id: string): RegisteredConnector | undefined {
    return this.connectors.get(id);
  }

  list(): RegisteredConnector[] {
    return [...this.connectors.values()];
  }
}

export function createConnectorRegistry(): ConnectorRegistry {
  return new ConnectorRegistry();
}
