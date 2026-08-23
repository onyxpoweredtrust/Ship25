// Corvo
import { verifySignature } from "./NodeIdentity.js";

const APP_BLOCK = "Corvo";

/** Registered Mesh nodes' public keys and revocation state — this is metadata, so it lives on the HDD via One, same as everything else central. */
const paths = {
  nodesIndex: () => [APP_BLOCK, "_Mesh", "Nodes"],
  node: (nodeId) => [APP_BLOCK, "_Mesh", "Nodes", nodeId],
};

export function createNodeRegistry(store) {
  return {
    /**
     * Issuing a node key is a real, deliberate act — there's no self-service
     * join, matching "permissioned, not a public swarm." `url` is the
     * node's own reachable address — without it, other nodes have no way
     * to ask it for anything, so it's what makes real peer-to-peer serving
     * possible instead of everything routing through the primary.
     */
    async register(nodeId, publicKey, { label, url } = {}) {
      await store.write(paths.node(nodeId), { publicKey, label: label ?? null, url: url ?? null, joinedAt: new Date().toISOString(), revoked: false });
    },

    async get(nodeId) {
      try {
        return await store.read(paths.node(nodeId));
      } catch {
        return null;
      }
    },

    async list() {
      const ids = await store.list(paths.nodesIndex());
      const nodes = await Promise.all(ids.map((id) => this.get(id)));
      return ids.map((id, i) => ({ nodeId: id, ...nodes[i] }));
    },

    /** Revoke, don't delete — keeps the audit trail (who was ever a node, when they were cut off) rather than erasing history. */
    async revoke(nodeId) {
      const node = await this.get(nodeId);
      if (!node) throw new Error(`unknown node "${nodeId}"`);
      await store.write(paths.node(nodeId), { ...node, revoked: true, revokedAt: new Date().toISOString() });
    },

    async isRevoked(nodeId) {
      const node = await this.get(nodeId);
      return !node || node.revoked === true;
    },

    /** The one check every node-to-node request goes through: registered, not revoked, and the signature actually verifies against that node's own public key. */
    async verifyRequest(nodeId, payload, signature) {
      const node = await this.get(nodeId);
      if (!node || node.revoked) return false;
      return verifySignature(node.publicKey, payload, signature);
    },
  };
}
