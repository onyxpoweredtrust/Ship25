// Pipelines Tls
// designed and built by onyxlabs.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import acme from "../../Vendor/AcmeClient/wrapper.mjs";

export interface IssueCertOptions {
  domain: string; // e.g. 'onyxpowered.com' — cert covers this + *.this
  email: string; // ACME account contact
  staging?: boolean; // Let's Encrypt staging — untrusted cert, no rate limits, for testing the flow
  onChallenge: (recordName: string, recordValue: string) => Promise<void>;
}

export interface IssuedCert {
  certPath: string;
  keyPath: string;
}

function certDir(domain: string): string {
  return path.join(os.homedir(), ".ship", "certs", domain);
}

export function certPaths(domain: string): IssuedCert {
  const dir = certDir(domain);
  return { certPath: path.join(dir, "fullchain.pem"), keyPath: path.join(dir, "privkey.pem") };
}

export function hasCert(domain: string): boolean {
  const { certPath, keyPath } = certPaths(domain);
  return fs.existsSync(certPath) && fs.existsSync(keyPath);
}

export async function issueWildcardCert(opts: IssueCertOptions): Promise<IssuedCert> {
  const accountKey = await acme.crypto.createPrivateKey();
  const client = new acme.Client({
    directoryUrl: opts.staging ? acme.directory.letsencrypt.staging : acme.directory.letsencrypt.production,
    accountKey,
  });

  const [certKey, csr] = await acme.crypto.createCsr({
    commonName: opts.domain,
    altNames: [opts.domain, `*.${opts.domain}`],
  });

  const cert = await client.auto({
    csr,
    email: opts.email,
    termsOfServiceAgreed: true,
    challengePriority: ["dns-01"],
    challengeCreateFn: async (_authz, challenge, keyAuthorization) => {
      if (challenge.type !== "dns-01") {
        throw new Error(`[ship/three/relay/tls] unsupported challenge type: ${challenge.type} — wildcard certs require dns-01`);
      }
      await opts.onChallenge(`_acme-challenge.${opts.domain}`, keyAuthorization);
    },
    challengeRemoveFn: async () => {},
  });

  const dir = certDir(opts.domain);
  fs.mkdirSync(dir, { recursive: true });
  const { certPath, keyPath } = certPaths(opts.domain);
  fs.writeFileSync(certPath, cert);
  fs.writeFileSync(keyPath, certKey);

  return { certPath, keyPath };
}
