// Connectors SocialProviders
// designed and built by onyxlabs.

import type { SocialProviders } from "../../Vendor/BetterAuth/SocialProviders.mjs";

export const SOCIAL_PROVIDER_IDS = [
  "apple",
  "atlassian",
  "cognito",
  "discord",
  "dropbox",
  "facebook",
  "figma",
  "github",
  "gitlab",
  "google",
  "huggingface",
  "kakao",
  "kick",
  "line",
  "linear",
  "linkedin",
  "microsoft-entra-id",
  "naver",
  "notion",
  "paybin",
  "paypal",
  "polar",
  "railway",
  "reddit",
  "roblox",
  "salesforce",
  "slack",
  "spotify",
  "tiktok",
  "twitch",
  "twitter",
  "vercel",
  "vk",
  "wechat",
  "zoom",
] as const;

export type SocialProviderId = (typeof SOCIAL_PROVIDER_IDS)[number];

export interface OAuthClientCredentials {
  clientId: string;
  clientSecret: string;
}

export type ShipAuthProviderSettings = Partial<Record<SocialProviderId, OAuthClientCredentials>>;

export function buildSocialProviders(settings: ShipAuthProviderSettings): SocialProviders {
  const enabled: Record<string, OAuthClientCredentials> = {};
  for (const id of SOCIAL_PROVIDER_IDS) {
    const creds = settings[id];
    if (creds?.clientId && creds.clientSecret) {
      enabled[id] = creds;
    }
  }
  return enabled as SocialProviders;
}
