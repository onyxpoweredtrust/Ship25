// Pipelines Types
// designed and built by onyxlabs.

export interface FrameworkDetector {
  path?: string;
  matchContent?: string;
  matchPackage?: string;
}

export interface FrameworkDetectors {
  every?: FrameworkDetector[];
  some?: FrameworkDetector[];
}

export interface FrameworkSetting<T = string | null> {
  value?: T;
  placeholder?: string;
  ignorePackageJsonScript?: boolean;
}

export interface FrameworkSettings {
  installCommand: FrameworkSetting;
  buildCommand: FrameworkSetting;
  devCommand: FrameworkSetting;
  outputDirectory: FrameworkSetting;
}

export type EngineName = "node" | "python" | "go" | "ruby" | "rust" | "static";

export interface Framework {
  name: string;
  slug: string | null;
  engine?: EngineName;
  tagline?: string;
  description?: string;
  envPrefix?: string;
  sort?: number;
  experimental?: boolean;
  runtimeFramework?: boolean;
  supersedes?: string[];
  detectors?: FrameworkDetectors;
  settings: FrameworkSettings;
}
