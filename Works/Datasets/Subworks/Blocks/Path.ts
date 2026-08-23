// Datasets Path
// designed and built by onyxlabs.

import { join, sep } from "node:path";

export const SHIP_ROOT_BLOCK = "_Ship";

export const LEAF_EXTENSION = ".ds";
export const SUDO_FILENAME = "_sudo.ds";

export class InvalidBlockPathError extends Error {
  constructor(segment: string) {
    super(`invalid block path segment: "${segment}"`);
    this.name = "InvalidBlockPathError";
  }
}

export type BlockPath = readonly string[];

function assertValidSegment(segment: string): void {
  if (!segment || segment === "." || segment === "..") throw new InvalidBlockPathError(segment);
  if (segment.includes(sep) || segment.includes("/") || segment.includes("\0")) {
    throw new InvalidBlockPathError(segment);
  }
}

export function toFsPath(dataRoot: string, path: BlockPath): string {
  path.forEach(assertValidSegment);
  return join(dataRoot, ...path);
}

export function toLeafFsPath(dataRoot: string, path: BlockPath): string {
  if (path.length === 0) throw new InvalidBlockPathError("<empty>");
  const parentPath = path.slice(0, -1);
  const leaf = path[path.length - 1];
  assertValidSegment(leaf);
  return join(toFsPath(dataRoot, parentPath), `${leaf}${LEAF_EXTENSION}`);
}

export function isShipRoot(path: BlockPath): boolean {
  return path[0] === SHIP_ROOT_BLOCK;
}
