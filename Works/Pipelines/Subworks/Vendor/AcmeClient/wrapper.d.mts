// Three @ Onyx Ship
export interface AcmeChallenge {
  type: string;
}

export interface AcmeClient {
  auto(opts: {
    csr: Buffer;
    email: string;
    termsOfServiceAgreed: boolean;
    challengePriority: string[];
    challengeCreateFn: (authz: unknown, challenge: AcmeChallenge, keyAuthorization: string) => Promise<void>;
    challengeRemoveFn: (authz?: unknown, challenge?: AcmeChallenge, keyAuthorization?: string) => Promise<void>;
  }): Promise<string>;
}

declare const acme: {
  crypto: {
    createPrivateKey(): Promise<Buffer>;
    createCsr(data: { commonName: string; altNames: string[] }): Promise<[Buffer, Buffer]>;
  };
  Client: new (opts: { directoryUrl: string; accountKey: Buffer }) => AcmeClient;
  directory: {
    letsencrypt: { staging: string; production: string };
  };
};

export default acme;
