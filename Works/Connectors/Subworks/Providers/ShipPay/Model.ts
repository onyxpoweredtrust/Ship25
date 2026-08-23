// Connectors Model
// designed and built by onyxlabs.

export interface StripeProduct {
  id: string;
  name: string;
}

export interface StripePrice {
  id: string;
  productId: string;
  unitAmount: number;
  currency: string;
}

export interface PaymentLink {
  id: string;
  url: string;
  priceId: string;
}

export interface QrEmbed {
  svg: string;
  dataUrl: string;
}

export interface PaymentLinkWithQr {
  paymentLink: PaymentLink;
  qr: QrEmbed;
}
