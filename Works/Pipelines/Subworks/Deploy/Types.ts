// Pipelines Types
// designed and built by onyxlabs.

export interface ClaimMessage {
  type: "claim";
  name: string;
  identity: string;
  email?: string;
}

export interface ClaimOkMessage {
  type: "claim.ok";
  name: string;
}

export interface ClaimDeniedMessage {
  type: "claim.denied";
  name: string;
  reason: string;
}

export interface ReclaimedMessage {
  type: "reclaimed";
  name: string;
  reason: string;
}

export interface TunnelRequestMessage {
  type: "request";
  id: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  bodyBase64: string | null;
}

export interface TunnelResponseMessage {
  type: "response";
  id: string;
  status: number;
  headers: Record<string, string>;
  bodyBase64: string | null;
}

export type RelayToClientMessage = ClaimOkMessage | ClaimDeniedMessage | ReclaimedMessage | TunnelRequestMessage;
export type ClientToRelayMessage = ClaimMessage | TunnelResponseMessage;

export interface ClaimRecord {
  name: string;
  identity: string;
  email?: string;
  claimedAt: number;
  lastSeenAt: number;
}
