// Connectors Stripe
// designed and built by onyxlabs.

import { createHmac, timingSafeEqual } from "node:crypto";
import { ConnectorError } from "../../Connector.js";
import type { StripeProduct, StripePrice, PaymentLink } from "./Model.js";

const API_BASE = "https://api.stripe.com/v1";

function authHeader(secretKey: string): string {
  return "Basic " + Buffer.from(`${secretKey}:`).toString("base64");
}

function formBody(fields: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) params.set(key, String(value));
  }
  return params.toString();
}

async function stripeRequest(
  fetchImpl: typeof fetch,
  secretKey: string,
  path: string,
  fields: Record<string, string | number | undefined>
): Promise<Record<string, unknown>> {
  const res = await fetchImpl(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: authHeader(secretKey),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formBody(fields),
  });

  const body = (await res.json()) as Record<string, unknown> & { error?: { message?: string } };
  if (!res.ok) {
    throw new ConnectorError("ship-pay", body.error?.message ?? `Stripe request to ${path} failed with status ${res.status}`);
  }
  return body;
}

export async function createProduct(fetchImpl: typeof fetch, secretKey: string, name: string): Promise<StripeProduct> {
  const body = await stripeRequest(fetchImpl, secretKey, "/products", { name });
  return { id: body.id as string, name: body.name as string };
}

export async function createPrice(
  fetchImpl: typeof fetch,
  secretKey: string,
  productId: string,
  unitAmount: number,
  currency: string
): Promise<StripePrice> {
  const body = await stripeRequest(fetchImpl, secretKey, "/prices", {
    product: productId,
    unit_amount: unitAmount,
    currency,
  });
  return { id: body.id as string, productId, unitAmount, currency };
}

export async function createPaymentLink(fetchImpl: typeof fetch, secretKey: string, priceId: string): Promise<PaymentLink> {
  const body = await stripeRequest(fetchImpl, secretKey, "/payment_links", {
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": 1,
  });
  return { id: body.id as string, url: body.url as string, priceId };
}

export function verifyWebhookSignature(rawBody: string, signatureHeader: string, webhookSecret: string): boolean {
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key, value];
    })
  );
  const timestamp = parts.t;
  if (!timestamp) return false;

  const expected = createHmac("sha256", webhookSecret).update(`${timestamp}.${rawBody}`).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");

  const candidates = signatureHeader
    .split(",")
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3));

  return candidates.some((candidate) => {
    const candidateBuf = Buffer.from(candidate, "hex");
    return candidateBuf.length === expectedBuf.length && timingSafeEqual(candidateBuf, expectedBuf);
  });
}
