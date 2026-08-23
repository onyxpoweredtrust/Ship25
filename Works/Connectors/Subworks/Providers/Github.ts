// Connectors Github
// designed and built by onyxlabs.

import type { ConnectorV1, ConnectorFactory } from "../Connector.js";
import { ConnectorError } from "../Connector.js";
import type { OAuthProvider, OAuthProviderSettings, OAuthTokens } from "../Auth/OAuthProvider.js";

const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const API_BASE = "https://api.github.com";

export interface GithubRepo {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  htmlUrl: string;
}

export interface GithubConnector extends ConnectorV1, OAuthProvider {
  listRepos(accessToken: string): Promise<GithubRepo[]>;
}

export interface GithubConnectorSettings extends OAuthProviderSettings {
  fetchImpl?: typeof fetch;
}

export const createGithubConnector: ConnectorFactory<GithubConnectorSettings, GithubConnector> = (settings) => {
  const fetchImpl = settings.fetchImpl ?? fetch;
  const scopes = settings.scopes ?? ["repo", "read:user"];

  return {
    id: "github",

    capabilities() {
      return ["oauth", "list-repos"];
    },

    authorizationUrl({ state, redirectUri }) {
      const url = new URL(AUTHORIZE_URL);
      url.searchParams.set("client_id", settings.clientId);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("scope", scopes.join(" "));
      url.searchParams.set("state", state);
      return url.toString();
    },

    async exchangeCode({ code, redirectUri }): Promise<OAuthTokens> {
      const res = await fetchImpl(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          client_id: settings.clientId,
          client_secret: settings.clientSecret,
          code,
          redirect_uri: redirectUri,
        }),
      });

      const body = (await res.json()) as {
        access_token?: string;
        scope?: string;
        error?: string;
        error_description?: string;
      };

      if (!res.ok || !body.access_token) {
        throw new ConnectorError("github", body.error_description ?? "token exchange failed", body.error);
      }

      return { accessToken: body.access_token, scope: body.scope };
    },

    async listRepos(accessToken): Promise<GithubRepo[]> {
      const res = await fetchImpl(`${API_BASE}/user/repos?per_page=100`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

      if (!res.ok) {
        throw new ConnectorError("github", `list-repos failed with status ${res.status}`);
      }

      const repos = (await res.json()) as {
        id: number;
        name: string;
        full_name: string;
        private: boolean;
        html_url: string;
      }[];

      return repos.map((r) => ({
        id: r.id,
        name: r.name,
        fullName: r.full_name,
        private: r.private,
        htmlUrl: r.html_url,
      }));
    },
  };
};
