// Connectors index
// designed and built by onyxlabs.

export type { ConnectorV1, ConnectorCapability, ConnectorFactory } from "./Connector.js";
export { ConnectorError } from "./Connector.js";

export { ConnectorRegistry, createConnectorRegistry, type RegisteredConnector } from "./Registry.js";

export type { OAuthProvider, OAuthProviderSettings, OAuthTokens } from "./Auth/OAuthProvider.js";

export type { ConnectorStorageAdapter } from "./Storage/Adapter.js";
export { createOneConnectorAdapter } from "./Storage/OneAdapter.js";

export { createGithubConnector, type GithubConnector, type GithubConnectorSettings, type GithubRepo } from "./Providers/Github.js";
export { createShipUiConnector, buildScaffoldArgs, type ShipUiConnector, type ShipUiConnectorSettings } from "./Providers/ShipUi.js";

export { createShipAuthConnector, type ShipAuthConnector, type ShipAuthConnectorSettings } from "./Providers/ShipAuth/index.js";
export { createShipAuthAdapter, type AuthTables } from "./Providers/ShipAuth/Adapter.js";
export {
  buildSocialProviders,
  SOCIAL_PROVIDER_IDS,
  type SocialProviderId,
  type ShipAuthProviderSettings,
  type OAuthClientCredentials,
} from "./Providers/ShipAuth/SocialProviders.js";
export { createZeroMailTransport, type ZeroMailSettings, type MailTransport, type MailMessage } from "./Providers/ShipAuth/Mail.js";
export { onyxPass } from "./Providers/ShipAuth/OnyxPass.js";
export { toNodeHandler } from "./Vendor/BetterAuth/Node.mjs";

export { createShipAiConnector, type ShipAiConnector, type ShipAiConnectorSettings, type AiProviderId } from "./Providers/ShipAi/index.js";
export { createOpenAiProvider } from "./Providers/ShipAi/OpenAi.js";
export { createAnthropicProvider } from "./Providers/ShipAi/Anthropic.js";
export type { AiProviderV1, AiProviderSettings, ChatMessage, GenerateTextOptions, GenerateTextResult } from "./Providers/ShipAi/Model.js";

export { createShipPayConnector, type ShipPayConnector, type ShipPayConnectorSettings, type StoredPaymentLink } from "./Providers/ShipPay/index.js";
export { createProduct, createPrice, createPaymentLink, verifyWebhookSignature } from "./Providers/ShipPay/Stripe.js";
export { createQrEmbed } from "./Providers/ShipPay/Qr.js";
export type { StripeProduct, StripePrice, PaymentLink, QrEmbed, PaymentLinkWithQr } from "./Providers/ShipPay/Model.js";

export { createShipNotifyConnector, type ShipNotifyConnector, type ShipNotifyConnectorSettings, type NotifyProviderId } from "./Providers/ShipNotify/index.js";
export { createSlackProvider } from "./Providers/ShipNotify/Slack.js";
export { createDiscordProvider } from "./Providers/ShipNotify/Discord.js";
export type { NotifyProviderV1, NotifyProviderSettings, NotifyMessage } from "./Providers/ShipNotify/Model.js";

export {
  createShipShieldConnector,
  DEFAULT_TRAP_PATHS,
  SHIELD_CHALLENGE_PATH,
  SHIELD_VERIFY_PATH,
  SHIELD_THRESHOLDS,
  KNOWN_AI_CRAWLER_UA_SUBSTRINGS,
  computeFingerprint,
  extractSignals,
  scoreRequest,
  generateTrapPage,
  streamTrapPage,
  type ShipShieldConnector,
  type ShipShieldConnectorSettings,
  type ShieldDecision,
  type GuardResult,
  type RequestSignals,
  type BotScore,
} from "./Providers/ShipShield/index.js";

export { TWO_VERSION } from "./Version.js";
export { guidelinesLines } from "./Guidelines.js";
export { runTwoCli, TWO_COMMANDS } from "./Cli.js";
