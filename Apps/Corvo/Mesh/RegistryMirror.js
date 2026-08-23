// Corvo
import { verifySignature } from "./NodeIdentity.js";

/**
 * A satellite doesn't have its own One-backed store, so it can't hold the
 * authoritative node registry the primary does — this is a read-only local
 * cache of it instead, refreshed periodically from the primary's
 * `/mesh/nodes`. Same interface shape as NodeRegistry (get/isRevoked/
 * verifyRequest) so a satellite's own createMeshServer can use either one
 * interchangeably.
 *
 * A real consequence of being a periodically-refreshed cache: a node
 * revoked at the primary isn't reflected here until the next refresh — the
 * same staleness window every satellite's manifest/GC sweep already
 * accepts, not a new kind of risk.
 */
export function createRegistryMirror() {
  let nodes = new Map();

  return {
    refresh(directory) {
      nodes = new Map(directory.map((n) => [n.nodeId, n]));
    },

    async get(nodeId) {
      return nodes.get(nodeId) ?? null;
    },

    async list() {
      return [...nodes.values()];
    },

    /** Only ever holds nodes the primary reported as active — absence from the mirror is treated the same as revoked. */
    async isRevoked(nodeId) {
      return !nodes.has(nodeId);
    },

    async verifyRequest(nodeId, payload, signature) {
      const node = nodes.get(nodeId);
      if (!node) return false;
      return verifySignature(node.publicKey, payload, signature);
    },
  };
}
