// Cores SecurityHeaders
// designed and built by onyxlabs.

import type { ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";

export function applyBaselineSecurityHeaders(res: ServerResponse): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
}

export function applyJsonContentSecurityPolicy(res: ServerResponse): void {
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
}

export function generateCspNonce(): string {
  return randomBytes(16).toString("base64");
}

export function applyDashboardContentSecurityPolicy(res: ServerResponse, nonce: string): void {
  res.setHeader(
    "Content-Security-Policy",
    `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self' ws: wss:; frame-ancestors 'none'`
  );
}
