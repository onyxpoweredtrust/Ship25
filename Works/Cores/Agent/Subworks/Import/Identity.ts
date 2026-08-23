// Agent Identity
// designed and built by onyxlabs.

import type { DetectorFilesystem } from "../Search/Filesystem.js";
import type { RuntimeSlug } from "../Search/Signatures.js";

const COMMENT_PREFIX: Record<RuntimeSlug, string> = {
  node: "//",
  go: "//",
  rust: "//",
  ruby: "#",
  python: "#",
};

function nameLinePattern(runtime: RuntimeSlug): RegExp {
  const prefix = COMMENT_PREFIX[runtime].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${prefix}\\s*(.+)$`);
}

export async function readModuleName(
  fs: DetectorFilesystem,
  entrypointPath: string,
  runtime: RuntimeSlug
): Promise<string | null> {
  if (!(await fs.hasPath(entrypointPath))) return null;
  const contents = await fs.readFile(entrypointPath);
  const firstLine = contents.split("\n")[0] ?? "";
  const match = firstLine.match(nameLinePattern(runtime));
  return match ? match[1].trim() : null;
}

export function stampModuleName(contents: string, name: string, runtime: RuntimeSlug): string {
  const prefix = COMMENT_PREFIX[runtime];
  const lines = contents.split("\n");
  const nameLine = `${prefix} ${name}`;

  if (lines[0]?.match(nameLinePattern(runtime))) {
    lines[0] = nameLine;
    return lines.join("\n");
  }
  return [nameLine, ...lines].join("\n");
}
