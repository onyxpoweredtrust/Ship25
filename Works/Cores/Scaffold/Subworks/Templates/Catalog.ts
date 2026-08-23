// Scaffold Catalog
// designed and built by onyxlabs.

import type { RuntimeSlug } from "@ship/agent";

export interface TemplateFile {
  path: string;
  contents: string;
}

export interface Template {
  slug: string;
  runtime: RuntimeSlug;
  entrypoint: { command: string; args: string[] };
  files: TemplateFile[];
}

const nodeBasic: Template = {
  slug: "node-basic",
  runtime: "node",
  entrypoint: { command: "node", args: ["index.js"] },
  files: [
    {
      path: "package.json",
      contents: JSON.stringify({ name: "zero-app", version: "0.0.1", private: true, type: "module" }, null, 2),
    },
    {
      path: "index.js",
      contents: `console.log("Zero App running.");\nsetInterval(() => {}, 1_000_000);\n`,
    },
    { path: ".gitignore", contents: "node_modules\n" },
  ],
};

const goBasic: Template = {
  slug: "go-basic",
  runtime: "go",
  entrypoint: { command: "go", args: ["run", "main.go"] },
  files: [
    { path: "go.mod", contents: "module zero-app\n\ngo 1.22\n" },
    {
      path: "main.go",
      contents: `package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Zero App running.")\n\tselect {}\n}\n`,
    },
    { path: ".gitignore", contents: "zero-app\n" },
  ],
};

const rubyBasic: Template = {
  slug: "ruby-basic",
  runtime: "ruby",
  entrypoint: { command: "ruby", args: ["main.rb"] },
  files: [
    { path: "Gemfile", contents: 'source "https://rubygems.org"\n' },
    { path: "main.rb", contents: 'puts "Zero App running."\nsleep\n' },
  ],
};

const pythonBasic: Template = {
  slug: "python-basic",
  runtime: "python",
  entrypoint: { command: "python3", args: ["main.py"] },
  files: [
    { path: "pyproject.toml", contents: '[project]\nname = "zero-app"\nversion = "0.0.1"\n' },
    { path: "main.py", contents: 'import time\n\nprint("Zero App running.")\ntime.sleep(1_000_000)\n' },
  ],
};

const rustBasic: Template = {
  slug: "rust-basic",
  runtime: "rust",
  entrypoint: { command: "cargo", args: ["run"] },
  files: [
    {
      path: "Cargo.toml",
      contents: '[package]\nname = "zero-app"\nversion = "0.0.1"\nedition = "2021"\n',
    },
    {
      path: "src/main.rs",
      contents: 'fn main() {\n    println!("Zero App running.");\n    loop {\n        std::thread::park();\n    }\n}\n',
    },
  ],
};

export const templates: Template[] = [nodeBasic, goBasic, rubyBasic, pythonBasic, rustBasic];

export function findTemplate(slug: string): Template | undefined {
  return templates.find((t) => t.slug === slug);
}
