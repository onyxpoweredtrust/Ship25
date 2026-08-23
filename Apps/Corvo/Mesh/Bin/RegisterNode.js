#!/usr/bin/env node
// Corvo
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createStore } from "@ship/datasets";
import { createNodeRegistry } from "../NodeRegistry.js";
import { generateNodeIdentity } from "../NodeIdentity.js";

const ROOT = fileURLToPath(new URL("../../.", import.meta.url));
const store = createStore(join(ROOT, ".data"));
const registry = createNodeRegistry(store);

const [command, ...rest] = process.argv.slice(2);

/**
 * Issuing a node key is a deliberate, real act by the machine owner — there
 * is no self-service join. This is that act: it prints the new node's full
 * identity, including the private key, exactly once. The primary never
 * stores that private key — only the public key goes into the registry.
 * Whoever runs this is responsible for getting the printed identity to the
 * joining machine over some channel they trust (this script doesn't do
 * that part — the honest thing here is not to pretend it's automated when
 * it involves handing a secret to another physical box).
 *
 * `url` is the joining node's own reachable address — without it, no other
 * node (the primary included) can ever ask it for anything, so this node
 * would sync but never actually serve reads to the rest of the mesh.
 */
async function registerNode(label, url) {
  const identity = generateNodeIdentity();
  await registry.register(identity.nodeId, identity.publicKey, { label: label ?? null, url: url ?? null });

  console.log("New Mesh node registered. Copy this identity to the joining machine now — it will not be shown again:\n");
  console.log(JSON.stringify(identity, null, 2));
  if (!url) console.log("\nNo URL given — this node will sync but won't be reachable by peers until you revoke and re-register it with one.");
}

async function revokeNode(nodeId) {
  if (!nodeId) {
    console.error("Usage: RegisterNode.js revoke <nodeId>");
    process.exitCode = 1;
    return;
  }
  await registry.revoke(nodeId);
  console.log(`Node ${nodeId} revoked.`);
}

async function listNodes() {
  const nodes = await registry.list();
  if (nodes.length === 0) {
    console.log("No nodes registered yet.");
    return;
  }
  for (const node of nodes) {
    console.log(`${node.nodeId}  ${node.revoked ? "[REVOKED]" : "[active]"}  ${node.label ?? ""}  ${node.url ?? "(no url)"}`.trim());
  }
}

switch (command) {
  case "new":
    await registerNode(rest[0], rest[1]);
    break;
  case "revoke":
    await revokeNode(rest[0]);
    break;
  case "list":
    await listNodes();
    break;
  default:
    console.error("Usage: RegisterNode.js <new [label] [url] | revoke <nodeId> | list>");
    process.exitCode = 1;
}
