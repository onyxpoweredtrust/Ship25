// Pipelines Cdn
// designed and built by onyxlabs.

import http from "node:http";

export interface CdnOptions {
  publicPort: number;
  upstreams: number[];
}

export interface CdnHandle {
  close: () => Promise<void>;
}

export async function createCdn(opts: CdnOptions): Promise<CdnHandle> {
  if (opts.upstreams.length === 0) throw new Error("[ship/three/cdn] at least one upstream is required");

  let next = 0;
  function nextUpstream(): number {
    const port = opts.upstreams[next % opts.upstreams.length]!;
    next++;
    return port;
  }

  const server = http.createServer((req, res) => {
    const upstream = http.request(
      { host: "127.0.0.1", port: nextUpstream(), path: req.url, method: req.method, headers: req.headers },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
        upstreamRes.pipe(res);
      }
    );

    upstream.on("error", () => {
      res.writeHead(502, { "Content-Type": "text/plain" });
      res.end("upstream unreachable");
    });

    req.pipe(upstream);
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(opts.publicPort, () => resolve());
    server.on("error", reject);
  });

  return {
    async close() {
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
