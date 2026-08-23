// Agent Scanner
// designed and built by onyxlabs.

import type { DetectorFilesystem } from "./Filesystem.js";
import type { DetectionRule, RuntimeDefinition, RuntimeSlug } from "./Signatures.js";
import { runtimes } from "./Signatures.js";

async function ruleMatches(fs: DetectorFilesystem, rule: DetectionRule): Promise<boolean> {
  if (rule.path && !(await fs.hasPath(rule.path))) return false;
  if (rule.matchContent || rule.matchPackage) {
    const target = rule.path ?? "package.json";
    if (!(await fs.hasPath(target))) return false;
    const contents = await fs.readFile(target);
    if (rule.matchPackage) {
      const pattern = new RegExp(
        `"(dev)?(d|D)ependencies":\\s*{[^}]*"${rule.matchPackage}":\\s*"(.+?)"[^}]*}`
      );
      if (!pattern.test(contents)) return false;
    }
    if (rule.matchContent && !rule.matchContent.test(contents)) return false;
  }
  return true;
}

async function definitionMatches(fs: DetectorFilesystem, def: RuntimeDefinition): Promise<boolean> {
  const { every = [], some = [] } = def.detectors;
  for (const rule of every) {
    if (!(await ruleMatches(fs, rule))) return false;
  }
  if (some.length > 0) {
    const results = await Promise.all(some.map((rule: DetectionRule) => ruleMatches(fs, rule)));
    if (!results.some(Boolean)) return false;
  }
  return true;
}

function removeSuperseded(matched: RuntimeDefinition[]): RuntimeDefinition[] {
  const slugs = new Set(matched.map((m) => m.slug));
  return matched.filter((def) => {
    const supersededBy = matched.find((other) => other.supersedes?.includes(def.slug));
    return !supersededBy;
  });
}

export interface ScanResult {
  slug: RuntimeSlug;
  name: string;
}

export async function scan(
  fs: DetectorFilesystem,
  registry: RuntimeDefinition[] = runtimes
): Promise<ScanResult[]> {
  const matched: RuntimeDefinition[] = [];
  for (const def of registry) {
    if (await definitionMatches(fs, def)) matched.push(def);
  }
  return removeSuperseded(matched).map((def) => ({ slug: def.slug, name: def.name }));
}
