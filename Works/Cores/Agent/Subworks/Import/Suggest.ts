// Agent Suggest
// designed and built by onyxlabs.

import type { DetectorFilesystem } from "../Search/Filesystem.js";
import { scan } from "../Search/Scanner.js";
import { runtimes, type RuntimeSlug } from "../Search/Signatures.js";
import { resolveAllSourceFiles } from "./Resolve.js";
import { readModuleName } from "./Identity.js";

export interface ModuleSuggestion {
  runtime: RuntimeSlug;
  entrypoint: string;
}

export async function suggestModules(fs: DetectorFilesystem): Promise<ModuleSuggestion[]> {
  const detected = await scan(fs, runtimes);
  const suggestions: ModuleSuggestion[] = [];

  for (const result of detected) {
    const sourceFiles = await resolveAllSourceFiles(fs, result.slug);

    for (const sourceFile of sourceFiles) {
      const existingName = await readModuleName(fs, sourceFile, result.slug);
      if (!existingName) suggestions.push({ runtime: result.slug, entrypoint: sourceFile });
    }
  }

  return suggestions;
}
