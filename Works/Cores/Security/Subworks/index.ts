// Security index
// designed and built by onyxlabs.

export { createTokenIssuer, isNearExpiry, type TokenScope, type ScopedTokenPayload, type TokenIssuer, type TokenSigner } from "./Tokens.js";
export { createJoseTokenSigner } from "./Jose.js";
export { loadOrGenerateSigningKey, rotateSigningKey } from "./Keyring.js";
export { createDefaultTokenIssuer } from "./Issuer.js";
export { createPersistedRevocationStore, createInMemoryRevocationStore, MAX_REVOCATIONS, type RevocationStore } from "./Revocations.js";

export { authorize, UnauthorizedError, ForbiddenError } from "./Guard.js";

export { createShipShieldConnector, type ShipShieldConnector, type ShipShieldConnectorSettings, DEFAULT_TRAP_PATHS, SHIELD_CHALLENGE_PATH, SHIELD_VERIFY_PATH } from "./ShipShield/index.js";
