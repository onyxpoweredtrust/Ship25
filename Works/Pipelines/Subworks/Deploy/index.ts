// Pipelines index
// designed and built by onyxlabs.

export { connectTunnel, type TunnelOptions, type TunnelHandle } from "./TunnelClient.js";
export type { ClaimMessage, ClaimOkMessage, ClaimDeniedMessage, ReclaimedMessage, ClaimRecord, RelayToClientMessage, ClientToRelayMessage } from "./Types.js";

export { createRelay, type RelayOptions, type RelayHandle, type RelayMailTransport } from "./Relay/Server.js";
export { createOwnershipStore, type OwnershipStore, type ClaimResult } from "./Relay/Ownership.js";
export { issueRelayAdminToken, verifyRelayAdminToken, loadOrGenerateRelayAdminKey } from "./Relay/AdminAuth.js";
export { issueWildcardCert, hasCert, certPaths, type IssueCertOptions, type IssuedCert } from "./Relay/Tls.js";
export { createCdn, type CdnOptions, type CdnHandle } from "./Relay/Cdn.js";
