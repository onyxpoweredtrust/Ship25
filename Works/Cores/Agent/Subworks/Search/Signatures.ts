// Agent Signatures
// designed and built by onyxlabs.

export type RuntimeSlug = "node" | "go" | "ruby" | "python" | "rust";

export interface DetectionRule {
  path?: string;
  matchContent?: RegExp;
  matchPackage?: string;
}

export interface RuntimeDefinition {
  slug: RuntimeSlug;
  name: string;
  detectors: {
    every?: DetectionRule[];
    some?: DetectionRule[];
  };
  supersedes?: RuntimeSlug[];
}

export const runtimes: RuntimeDefinition[] = [
  {
    slug: "node",
    name: "Node.js",
    detectors: {
      some: [
        { path: "package.json" },
        { path: "node_modules" },
      ],
    },
  },
  {
    slug: "go",
    name: "Go",
    detectors: {
      some: [
        { path: "go.mod" },
        { matchContent: /\.go$/ },
      ],
    },
  },
  {
    slug: "ruby",
    name: "Ruby",
    detectors: {
      some: [
        { path: "Gemfile" },
        { path: "Gemfile.lock" },
      ],
    },
  },
  {
    slug: "python",
    name: "Python",
    detectors: {
      some: [
        { path: "pyproject.toml" },
        { path: "requirements.txt" },
        { path: "Pipfile" },
      ],
    },
  },
  {
    slug: "rust",
    name: "Rust",
    detectors: {
      every: [{ path: "Cargo.toml" }],
    },
  },
];
