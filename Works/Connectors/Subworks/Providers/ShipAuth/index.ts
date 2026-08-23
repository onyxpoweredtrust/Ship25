// Connectors index
// designed and built by onyxlabs.

import { betterAuth } from "../../Vendor/BetterAuth/Minimal.mjs";
import type { BetterAuthOptions } from "../../Vendor/BetterAuth/Types.mjs";
import { createKeyring, type Store, type Role } from "@ship/datasets";
import type { ConnectorV1 } from "../../Connector.js";
import { createShipAuthAdapter } from "./Adapter.js";
import { buildSocialProviders, type ShipAuthProviderSettings } from "./SocialProviders.js";
import { createZeroMailTransport, type ZeroMailSettings, type MailTransport } from "./Mail.js";
import { onyxPass } from "./OnyxPass.js";
import { emailOTP } from "../../Vendor/BetterAuth/EmailOtp.mjs";

export interface ShipAuthConnectorSettings {
  store: Store;
  appBlock: string;
  role: Role;

  baseURL: string;
  secret: string;

  providers?: ShipAuthProviderSettings;
  mail?: ZeroMailSettings;
  mailTransport?: MailTransport;
}

export interface ShipAuthConnector extends ConnectorV1 {
  readonly instance: ReturnType<typeof betterAuth<BetterAuthOptions>>;
}

export const createShipAuthConnector = async (settings: ShipAuthConnectorSettings): Promise<ShipAuthConnector> => {
  const mail = settings.mailTransport ?? (settings.mail ? createZeroMailTransport(settings.mail) : undefined);
  const socialProviders = buildSocialProviders(settings.providers ?? {});

  const adapter = createShipAuthAdapter(settings.store, settings.appBlock, settings.role);
  await adapter.preload();

  const onyxPassKey = await createKeyring(settings.store).loadOrGenerateKey("onyx-pass-encryption");

  const options: BetterAuthOptions = {
    baseURL: settings.baseURL,
    secret: settings.secret,
    database: adapter,
    socialProviders,
    user: {
      additionalFields: {
        username: { type: "string", required: false, input: true },
        firstName: { type: "string", required: false, input: true },
        lastName: { type: "string", required: false, input: true },
        pfp: { type: "string", required: false, input: true },
        legalAgreedAt: { type: "date", required: false, input: true },
      },
    },
    plugins: [
      onyxPass(onyxPassKey),
      emailOTP({
        sendVerificationOnSignUp: true,
        overrideDefaultEmailVerification: true,
        async sendVerificationOTP({ email, otp, type }) {
          const subject =
            type === "sign-in"
              ? "Your Onyx sign-in code"
              : type === "forget-password"
                ? "Your Onyx password reset code"
                : type === "change-email"
                  ? "Confirm your new email"
                  : "Verify your email";
          await mail?.send({
            to: email,
            subject,
            html: `<p>Your code: <strong>${otp}</strong></p><p>It expires in 5 minutes.</p>`,
          });
        },
      }),
    ],
    emailAndPassword: {
      enabled: true,
      sendResetPassword: async ({ user, url }) => {
        await mail?.send({
          to: user.email,
          subject: "Reset your password",
          html: `<p>Reset your password: <a href="${url}">${url}</a></p>`,
        });
      },
    },
  };

  const instance = betterAuth(options);

  return {
    id: "ship-auth",
    instance,

    capabilities() {
      return ["email-password", "email-otp", "onyx-pass", ...Object.keys(socialProviders).map((p) => `oauth:${p}`)];
    },
  };
};
