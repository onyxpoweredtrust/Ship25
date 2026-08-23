// Connectors OAuthProvider
// designed and built by onyxlabs.

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
}

export interface OAuthProvider {
  readonly id: string;

  authorizationUrl(params: { state: string; redirectUri: string; codeChallenge?: string }): string;

  exchangeCode(params: { code: string; redirectUri: string; codeVerifier?: string }): Promise<OAuthTokens>;

  refresh?(refreshToken: string): Promise<OAuthTokens>;
}

export interface OAuthProviderSettings {
  clientId: string;
  clientSecret: string;
  scopes?: string[];
}
