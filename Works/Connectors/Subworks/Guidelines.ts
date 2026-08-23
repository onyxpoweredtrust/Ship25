// Connectors Guidelines
// designed and built by onyxlabs.

export const guidelinesLines: string[] = [
  "Two — Connectors for Onyx Ship",
  "",
  "  ship connector list    show every registered Connector",
  "",
  "A Connector is one shared ConnectorV1 interface (Connector.ts) implemented",
  "by a plain factory function per external service (Providers/*.ts) — never a",
  "class to subclass. OAuth-based connectors implement the shared OAuthProvider",
  "shape (Auth/OAuthProvider.ts): authorize URL, code exchange, optional refresh.",
  "",
  "Storage never touches a specific backend directly — every Connector's",
  "credentials/state go through ConnectorStorageAdapter (Storage/Adapter.ts).",
  "The one real implementation is backed by One's Sudoblock-gated Store",
  "(Storage/OneAdapter.ts), under `[appBlock, Connectors, <connectorId>, ...]`.",
];
