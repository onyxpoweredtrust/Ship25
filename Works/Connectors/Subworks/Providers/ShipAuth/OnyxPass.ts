// Connectors OnyxPass
// designed and built by onyxlabs.

import { createCipheriv, createDecipheriv, generateKeyPairSync, randomBytes } from "node:crypto";
import type { BetterAuthPlugin } from "../../Vendor/BetterAuth/wrapper.mjs";
import { APIError, createAuthEndpoint } from "../../Vendor/BetterAuth/Api.mjs";
import { getSessionCookie, setSessionCookie } from "../../Vendor/BetterAuth/Cookies.mjs";
import * as z from "../../Vendor/Zod/index.js";

function encryptPrivKey(rawPrivKey: Buffer, key: Uint8Array): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(rawPrivKey), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64url");
}

function decryptPrivKey(stored: string, key: Uint8Array): Buffer {
  const data = Buffer.from(stored, "base64url");
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const ciphertext = data.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function generateEd25519Keypair(): { rawPrivKey: Buffer; rawPubKey: Buffer } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privDer = privateKey.export({ format: "der", type: "pkcs8" }) as Buffer;
  const pubDer = publicKey.export({ format: "der", type: "spki" }) as Buffer;
  return {
    rawPrivKey: Buffer.from(privDer.subarray(16, 48)),
    rawPubKey: Buffer.from(pubDer.subarray(12, 44)),
  };
}

function newDeviceToken(): string {
  return randomBytes(32).toString("base64url");
}

async function getSessionUserId(ctx: any): Promise<string | null> {
  const raw = getSessionCookie(ctx.request as Request);
  if (!raw) return null;
  const token = raw.split(".")[0];
  const row = (await ctx.context.adapter.findOne({
    model: "session",
    where: [{ field: "token", operator: "eq", value: token }],
  })) as { userId: string; expiresAt: Date } | null;
  if (!row || new Date() > new Date(row.expiresAt)) return null;
  return row.userId;
}

export const onyxPass = (encryptionKey: Uint8Array): BetterAuthPlugin => {
  return {
    id: "onyx-pass",
    schema: {
      onyxKey: {
        fields: {
          userId: {
            type: "string",
            references: { model: "user", field: "id" },
            required: true,
            index: true,
          },
          publicKey: { type: "string", required: true, unique: true },
          encryptedPrivKey: { type: "string", required: true },
          deviceToken: { type: "string", required: true, unique: true },
          createdAt: { type: "date", required: true },
          updatedAt: { type: "date", required: true },
        },
      },
    },
    endpoints: {
      onyxCreatePass: createAuthEndpoint(
        "/onyx/create-pass",
        { method: "POST", requireRequest: true },
        async (ctx) => {
          const userId = await getSessionUserId(ctx);
          if (!userId) throw new APIError("UNAUTHORIZED", { message: "Not authenticated" });

          const existing = await ctx.context.adapter.findOne<{ id: string }>({
            model: "onyxKey",
            where: [{ field: "userId", operator: "eq", value: userId }],
          });
          if (existing) {
            await ctx.context.adapter.delete({
              model: "onyxKey",
              where: [{ field: "userId", operator: "eq", value: userId }],
            });
            await ctx.context.adapter.delete({
              model: "account",
              where: [
                { field: "userId", operator: "eq", value: userId },
                { field: "providerId", operator: "eq", value: "onyx" },
              ],
            });
          }

          const { rawPrivKey, rawPubKey } = generateEd25519Keypair();
          const publicKey = rawPubKey.toString("base64url");
          const encryptedPrivKey = encryptPrivKey(rawPrivKey, encryptionKey);
          const deviceToken = newDeviceToken();
          const now = new Date();

          await ctx.context.adapter.create({
            model: "onyxKey",
            data: { userId, publicKey, encryptedPrivKey, deviceToken, createdAt: now, updatedAt: now },
          });
          await ctx.context.internalAdapter.createAccount({
            userId,
            providerId: "onyx",
            accountId: publicKey,
            createdAt: now,
            updatedAt: now,
          });

          return ctx.json({ deviceToken, publicKey });
        }
      ),

      onyxAuth: createAuthEndpoint(
        "/onyx/auth",
        {
          method: "POST",
          body: z.object({ deviceToken: z.string().min(1) }),
          requireRequest: true,
        },
        async (ctx) => {
          const { deviceToken } = ctx.body;

          const record = await ctx.context.adapter.findOne<{
            id: string;
            userId: string;
            publicKey: string;
            encryptedPrivKey: string;
          }>({
            model: "onyxKey",
            where: [{ field: "deviceToken", operator: "eq", value: deviceToken }],
          });

          if (!record) {
            throw new APIError("UNAUTHORIZED", { message: "Invalid Pass" });
          }

          decryptPrivKey(record.encryptedPrivKey, encryptionKey);

          const nextToken = newDeviceToken();
          await ctx.context.adapter.update({
            model: "onyxKey",
            where: [{ field: "id", operator: "eq", value: record.id }],
            update: { deviceToken: nextToken, updatedAt: new Date() },
          });

          const user = await ctx.context.adapter.findOne<{
            id: string;
            email: string;
            name: string;
            emailVerified: boolean;
            createdAt: Date;
            updatedAt: Date;
          }>({
            model: "user",
            where: [{ field: "id", operator: "eq", value: record.userId }],
          });

          if (!user) throw new APIError("INTERNAL_SERVER_ERROR", { message: "User not found" });

          const session = await ctx.context.internalAdapter.createSession(user.id);
          if (!session) throw new APIError("INTERNAL_SERVER_ERROR", { message: "Failed to create session" });

          await setSessionCookie(ctx, { session, user });

          return ctx.json({ deviceToken: nextToken });
        }
      ),
    },
  } satisfies BetterAuthPlugin;
};
