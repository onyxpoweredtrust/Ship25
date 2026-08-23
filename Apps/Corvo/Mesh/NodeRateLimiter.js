// Corvo
/**
 * A small, self-contained token bucket keyed by nodeId — deliberately not
 * shared with Ship Shield's own rate limiter. Mesh is meant to stay
 * independent of Corvo-specific Shield internals (same reasoning as
 * everywhere else in Mesh), and this is genuinely a different concern:
 * Shield rate-limits anonymous fingerprints, this rate-limits already-
 * authenticated node identities.
 */
export function createNodeRateLimiter({ capacity = 60, refillPerSecond = 5, now = Date.now } = {}) {
  const buckets = new Map();

  return {
    consume(nodeId) {
      let bucket = buckets.get(nodeId);
      if (!bucket) {
        bucket = { tokens: capacity, lastRefillAt: now() };
        buckets.set(nodeId, bucket);
      }
      const elapsedSeconds = (now() - bucket.lastRefillAt) / 1000;
      if (elapsedSeconds > 0) {
        bucket.tokens = Math.min(capacity, bucket.tokens + elapsedSeconds * refillPerSecond);
        bucket.lastRefillAt = now();
      }
      if (bucket.tokens < 1) return false;
      bucket.tokens -= 1;
      return true;
    },
  };
}
