// Connectors Qr
// designed and built by onyxlabs.

import QRCode from "../../Vendor/Qrcode/wrapper.mjs";
import type { QrEmbed } from "./Model.js";

export async function createQrEmbed(url: string): Promise<QrEmbed> {
  const [svg, dataUrl] = await Promise.all([QRCode.toString(url, { type: "svg" }), QRCode.toDataURL(url)]);
  return { svg, dataUrl };
}
