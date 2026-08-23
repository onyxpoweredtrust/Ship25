// Connectors index
// designed and built by onyxlabs.

import type { ConnectorV1, ConnectorFactory } from "../../Connector.js";
import type { ConnectorStorageAdapter } from "../../Storage/Adapter.js";
import { createProduct, createPrice, createPaymentLink, verifyWebhookSignature } from "./Stripe.js";
import { createQrEmbed } from "./Qr.js";
import type { PaymentLink, PaymentLinkWithQr } from "./Model.js";

export interface ShipPayConnectorSettings {
  secretKey: string;
  webhookSecret?: string;
  storage: ConnectorStorageAdapter;
  fetchImpl?: typeof fetch;
}

export interface StoredPaymentLink extends PaymentLink {
  productId: string;
  productName: string;
  unitAmount: number;
  currency: string;
  createdAt: string;
}

export interface ShipPayConnector extends ConnectorV1 {
  createPaymentLinkWithQr(productName: string, unitAmount: number, currency?: string): Promise<PaymentLinkWithQr>;
  getPaymentLink(paymentLinkId: string): Promise<StoredPaymentLink | undefined>;
  verifyWebhook(rawBody: string, signatureHeader: string): boolean;
}

export const createShipPayConnector: ConnectorFactory<ShipPayConnectorSettings, ShipPayConnector> = (settings) => {
  const fetchImpl = settings.fetchImpl ?? fetch;

  return {
    id: "ship-pay",

    capabilities() {
      return ["create-payment-link", "qr-embed", ...(settings.webhookSecret ? ["webhook-verify"] : [])];
    },

    async createPaymentLinkWithQr(productName, unitAmount, currency = "usd") {
      const product = await createProduct(fetchImpl, settings.secretKey, productName);
      const price = await createPrice(fetchImpl, settings.secretKey, product.id, unitAmount, currency);
      const paymentLink = await createPaymentLink(fetchImpl, settings.secretKey, price.id);
      const qr = await createQrEmbed(paymentLink.url);

      const stored: StoredPaymentLink = {
        ...paymentLink,
        productId: product.id,
        productName: product.name,
        unitAmount,
        currency,
        createdAt: new Date().toISOString(),
      };
      await settings.storage.set("ship-pay", `payment-link:${paymentLink.id}`, stored);

      return { paymentLink, qr };
    },

    async getPaymentLink(paymentLinkId) {
      const value = await settings.storage.get("ship-pay", `payment-link:${paymentLinkId}`);
      return value as StoredPaymentLink | undefined;
    },

    verifyWebhook(rawBody, signatureHeader) {
      if (!settings.webhookSecret) return false;
      return verifyWebhookSignature(rawBody, signatureHeader, settings.webhookSecret);
    },
  };
};
